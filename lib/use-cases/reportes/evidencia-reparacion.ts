/**
 * Casos de uso server-only de evidencia fotográfica y verificación comunitaria de
 * reparaciones (issue #145).
 *
 * Toda la autoridad vive en las RPC `security definer` de la migración
 * `20261106120000_evidencia_reparacion.sql`: estas funciones validan la entrada,
 * autorizan a la persona con el catálogo de roles y traducen el resultado a datos y
 * mensajes en español. Ningún cliente escribe estados, votos ni puntos (S12).
 */
import "server-only"

import type { SupabaseClient, User } from "@supabase/supabase-js"

import { ROLE_IDS } from "@/lib/authz/catalog"
import { getUserRoleContext, isAdminRole, puedeVotarReportes } from "@/lib/authz/roles"
import {
  REPORT_IMAGE_MAX_BYTES,
  REPORT_IMAGE_MAX_BYTES_LABEL,
  isAcceptedReportImageType,
} from "@/lib/media/report-images"
import { validateUploadedReportImage } from "@/lib/media/report-image-validation.server"
import {
  type ResultadoImagenEvidenciaReparacion,
  moderarYGuardarImagenEvidenciaReparacion,
} from "@/lib/moderation/imagenes-reporte.server"
import { sendStatusNotificationEmail } from "@/lib/notifications/report-notifications"
import { getReportContext } from "./detail-mutations"

/**
 * Confirmaciones independientes que validan una reparación («inicialmente tres», S5).
 * Espeja `public.umbral_confirmaciones_reparacion()` en SQL.
 */
export const UMBRAL_CONFIRMACIONES_REPARACION = 3

/** Límite diario de evidencias por cuenta, igual al cupo de `crear_evidencia_reparacion`. */
export const EVIDENCIAS_REPARACION_POR_DIA = 3

/** Longitud máxima del comentario de la evidencia (`evidencias_reparacion.comentario`). */
export const COMENTARIO_REPARACION_MAX = 500

/** Longitud máxima del motivo de una impugnación (`verificaciones_reparacion.motivo`). */
export const MOTIVO_IMPUGNACION_MAX = 500

/** Texto único para las cuentas que todavía no pueden informar ni verificar (S15). */
export const MENSAJE_CUENTA_REPARACION_REQUERIDA =
  "Necesitás una cuenta registrada con el correo confirmado para informar y verificar reparaciones."

/** Texto del comentario inválido; también lo usa la acción para no duplicar el literal. */
export const MENSAJE_COMENTARIO_REPARACION_INVALIDO = "Contá en hasta 500 caracteres qué se reparó."

/**
 * Texto cuando la misma fotografía se reintenta con otro comentario: la evidencia ya
 * guardada conserva su texto y publicarla no puede cambiar lo que la persona escribió.
 */
export const MENSAJE_COMENTARIO_EVIDENCIA_DISTINTO =
  "Esta reparación ya quedó informada con otro comentario. Reintentá con la misma foto y su comentario original, o esperá la revisión de la evidencia ya enviada."

/** Texto del motivo de impugnación inválido. */
export const MENSAJE_MOTIVO_IMPUGNACION_INVALIDO = "Contá por qué impugnás la reparación, en hasta 500 caracteres."

/** Texto compartido por todas las acciones administrativas de evidencia. */
export const MENSAJE_SIN_PERMISO_ADMINISTRADOR = "No tenés permisos de administrador para esta acción."

const MENSAJE_VERIFICACION_FALLIDA = "No pudimos registrar tu verificación. Recargá e intentá nuevamente."
const MENSAJE_RESOLUCION_FALLIDA = "No pudimos resolver la impugnación."

/**
 * Texto cuando los bytes privados no quedaron confirmados. Nunca se informa la
 * reparación como enviada; reintentar la misma foto reanuda esa misma evidencia.
 */
export const MENSAJE_CARGA_EVIDENCIA_INCOMPLETA =
  "No pudimos guardar la fotografía de la reparación. Reintentá con la misma foto: retomamos la misma evidencia."

/** Resultado de una mutación: datos o el error en español que muestra el formulario. */
export type ResultadoReparacion<T> =
  | { success: true; data: T }
  | { success: false; error: string }

/** Estados durables de una evidencia de reparación. */
export type EstadoEvidenciaReparacion = "informada" | "en_verificacion" | "validada" | "rechazada" | "revertida"

/** Verificación comunitaria: confirmar la reparación o impugnarla. */
export type TipoVerificacionReparacion = "confirmacion" | "impugnacion"

/** Acción administrativa sobre una evidencia (S8). */
export type AccionEvidenciaAdministrativa = "aprobar" | "rechazar" | "revertir"

/** Decisión administrativa sobre una impugnación pendiente (S5, S8). */
export type DecisionImpugnacionReparacion = "aceptada" | "descartada"

const ESTADOS_EVIDENCIA: readonly string[] = ["informada", "en_verificacion", "validada", "rechazada", "revertida"]

/** Entrada del formulario mínimo para informar una reparación (S13). */
export type EntradaInformeReparacion = { comentario: string; image: File }

/** Resultado visible de informar una reparación: nunca implica cambiar el estado del reporte. */
export type ResultadoInformeReparacion = {
  evidenciaId: string
  estado: EstadoEvidenciaReparacion
  publicada: boolean
  motivos: string[]
  advertencias: string[]
}

/** Avance de la verificación comunitaria de una evidencia. */
export type ResultadoVerificacionReparacion = {
  tipo: TipoVerificacionReparacion
  repetida: boolean
  evidenciaEstado: EstadoEvidenciaReparacion
  reporteEstadoId: number | null
  cerrado: boolean
  confirmaciones: number
  impugnaciones: number
  impugnacionesPendientes: number
  umbral: number
}

/** Resultado de aprobar, rechazar o revertir una evidencia. */
export type ResultadoResolucionEvidencia = {
  accion: AccionEvidenciaAdministrativa
  repetida: boolean
  evidenciaEstado: EstadoEvidenciaReparacion
  reporteEstadoId: number | null
  cerrado: boolean
  revertido: boolean
  confirmaciones: number
  impugnaciones: number
  impugnacionesPendientes: number
}

/** Resultado de aceptar o descartar una impugnación. */
export type ResultadoResolucionImpugnacion = {
  accion: DecisionImpugnacionReparacion
  repetida: boolean
  evidenciaEstado: EstadoEvidenciaReparacion
  reporteEstadoId: number | null
  cerrado: boolean
  confirmaciones: number
  impugnaciones: number
  impugnacionesPendientes: number
}

/**
 * Roles que pueden informar y verificar reparaciones: Admin y Operador cierran con sus
 * propias herramientas y el invitado no participa (S15). Un perfil sin rol sigue
 * habilitado, igual que en `private.usuario_habilitado_para_reparacion`.
 *
 * @param rolId - `rol_id` del perfil, tal como lo devuelve el catálogo.
 * @returns `true` cuando el rol puede participar del flujo de reparaciones.
 */
export function esRolHabilitadoParaReparacion(rolId: number | null | undefined) {
  return rolId !== ROLE_IDS.ADMIN && rolId !== ROLE_IDS.OPERADOR && rolId !== ROLE_IDS.INVITADO
}

/**
 * Participante habilitado: cuenta registrada, no anónima y con el correo confirmado.
 *
 * @param usuario - Usuario devuelto por `auth.getUser()`; nunca datos del cliente.
 * @param rolId - `rol_id` del perfil en la base.
 * @returns `true` cuando la cuenta puede informar y verificar reparaciones.
 */
export function puedeInformarReparacion(
  usuario: Pick<User, "is_anonymous" | "email_confirmed_at"> | null | undefined,
  rolId: number | null | undefined,
) {
  return puedeVotarReportes(usuario, rolId) && Boolean(usuario?.email_confirmed_at)
}

/** Rol del actor leído con el cliente de sesión; nunca confía en el rol enviado por el navegador. */
async function rolHabilitado(supabase: SupabaseClient, usuarioId: string) {
  const { data, error } = await getUserRoleContext(supabase, usuarioId)
  return !error && esRolHabilitadoParaReparacion(data?.roleId)
}

/** Autoriza una acción administrativa sobre evidencias (S8). */
async function asegurarAdministrador(
  supabase: SupabaseClient,
  usuarioId: string,
): Promise<ResultadoReparacion<true>> {
  const { data, error } = await getUserRoleContext(supabase, usuarioId)
  if (error || !isAdminRole(data?.roleId)) {
    return { success: false, error: MENSAJE_SIN_PERMISO_ADMINISTRADOR }
  }
  return { success: true, data: true }
}

/**
 * Estado visible de una evidencia moderada. La revisión manual la deja «informada»:
 * el reporte nunca cambia de estado por subir una foto (S2, S11). Un fallo de carga
 * privada no llega acá: el caso de uso responde error y permite reintentar la foto.
 */
function estadoTrasModeracion(resultado: ResultadoImagenEvidenciaReparacion): EstadoEvidenciaReparacion {
  if (resultado.publicada) return "en_verificacion"
  return resultado.estado === "REJECTED" ? "rechazada" : "informada"
}

/** Traduce el rechazo de la RPC de evidencia; nunca muestra el mensaje crudo de la base. */
function mensajeDeCreacionFallida(resultado: ResultadoImagenEvidenciaReparacion) {
  switch (resultado.codigoRpc) {
    case "PRE01":
      return MENSAJE_CUENTA_REPARACION_REQUERIDA
    case "PRE03":
      return (resultado.mensajeRpc ?? "").includes("fotografía")
        ? "Esa fotografía ya fue registrada en este reporte."
        : "Este reporte ya tiene una reparación informada en verificación."
    case "PRE04":
      return `Alcanzaste el límite de ${EVIDENCIAS_REPARACION_POR_DIA} evidencias de reparación por día.`
    case "PRE05":
      return "El reporte ya está cerrado o no está disponible para informar una reparación."
    case "PRE11":
      return "Revisá el comentario: debe tener entre 1 y 500 caracteres."
    default:
      return resultado.motivos[0] ?? "No pudimos registrar la evidencia de reparación."
  }
}

/** Traduce el código de error de la RPC de verificación a un texto para la persona. */
function mensajeDeVerificacion(error: { code?: string; message?: string }) {
  switch (error.code) {
    case "PRE01":
      return MENSAJE_CUENTA_REPARACION_REQUERIDA
    case "PRE02":
      return "No podés validar tu propia evidencia."
    case "PRE05":
      return "La reparación ya no está disponible para verificar."
    case "PRE06":
      return "Ya registraste una verificación distinta para esta evidencia."
    case "PRE07":
      return MENSAJE_MOTIVO_IMPUGNACION_INVALIDO
    case "PRE09":
      return "La evidencia ya fue resuelta."
    case "PRE11":
      return "No pudimos registrar tu verificación. Recargá e intentá nuevamente."
    default:
      return MENSAJE_VERIFICACION_FALLIDA
  }
}

/** Traduce el código de error de la resolución administrativa de una evidencia. */
function mensajeDeResolucionEvidencia(error: { code?: string; message?: string }) {
  switch (error.code) {
    case "PRE05":
      return "La evidencia o el reporte ya no están disponibles."
    case "PRE08":
      return MENSAJE_SIN_PERMISO_ADMINISTRADOR
    case "PRE12":
      return "La evidencia todavía no tiene la foto publicada: no se puede aprobar la reparación."
    case "PRE09":
      return "La evidencia ya cambió de estado. Recargá la revisión e intentá nuevamente."
    default:
      return "No pudimos resolver la evidencia. Recargá la revisión e intentá nuevamente."
  }
}

/** Traduce el código de error de la resolución de una impugnación. */
function mensajeDeResolucionImpugnacion(error: { code?: string; message?: string }) {
  switch (error.code) {
    case "PRE05":
      return "La impugnación o el reporte ya no están disponibles."
    case "PRE08":
      return MENSAJE_SIN_PERMISO_ADMINISTRADOR
    case "PRE07":
      return "La impugnación ya fue resuelta o no corresponde a esta evidencia."
    default:
      return MENSAJE_RESOLUCION_FALLIDA
  }
}

/** Lee un estado de evidencia sin confiar en la forma de la respuesta. */
function leerEstadoEvidencia(valor: unknown): EstadoEvidenciaReparacion | null {
  return typeof valor === "string" && ESTADOS_EVIDENCIA.includes(valor)
    ? (valor as EstadoEvidenciaReparacion)
    : null
}

/** Lee el estado del reporte: la RPC lo devuelve como número o nulo. */
function leerEstadoReporte(valor: unknown): number | null | undefined {
  if (valor === null || valor === undefined) return null
  return typeof valor === "number" ? valor : undefined
}

/** Contadores de verificaciones de una respuesta de RPC. */
function leerContadores(datos: Record<string, unknown>) {
  const confirmaciones = datos.confirmaciones
  const impugnaciones = datos.impugnaciones
  const pendientes = datos.impugnaciones_pendientes
  if (typeof confirmaciones !== "number" || typeof impugnaciones !== "number" || typeof pendientes !== "number") {
    return null
  }
  return {
    confirmaciones,
    impugnaciones,
    impugnacionesPendientes: pendientes,
  }
}

/** Valida la respuesta de `registrar_verificacion_reparacion`. */
function leerVerificacion(datos: unknown): Omit<ResultadoVerificacionReparacion, "umbral"> | null {
  if (!datos || typeof datos !== "object" || Array.isArray(datos)) return null
  const fila = datos as Record<string, unknown>
  const tipo = fila.tipo
  const estado = leerEstadoEvidencia(fila.evidencia_estado)
  const reporteEstadoId = leerEstadoReporte(fila.reporte_estado_id)
  const contadores = leerContadores(fila)
  if ((tipo !== "confirmacion" && tipo !== "impugnacion") || !estado || reporteEstadoId === undefined || !contadores) {
    return null
  }
  if (typeof fila.repetida !== "boolean" || typeof fila.cerrado !== "boolean") return null
  return {
    tipo,
    repetida: fila.repetida,
    evidenciaEstado: estado,
    reporteEstadoId,
    cerrado: fila.cerrado,
    ...contadores,
  }
}

/** Valida la respuesta de `resolver_evidencia_reparacion_admin`. */
function leerResolucionEvidencia(
  datos: unknown,
  accion: AccionEvidenciaAdministrativa,
): ResultadoResolucionEvidencia | null {
  if (!datos || typeof datos !== "object" || Array.isArray(datos)) return null
  const fila = datos as Record<string, unknown>
  const estado = leerEstadoEvidencia(fila.evidencia_estado)
  const reporteEstadoId = leerEstadoReporte(fila.reporte_estado_id)
  const contadores = leerContadores(fila)
  if (!estado || reporteEstadoId === undefined || !contadores) return null
  if (typeof fila.repetida !== "boolean" || typeof fila.cerrado !== "boolean" || typeof fila.revertido !== "boolean") {
    return null
  }
  return {
    accion,
    repetida: fila.repetida,
    evidenciaEstado: estado,
    reporteEstadoId,
    cerrado: fila.cerrado,
    revertido: fila.revertido,
    ...contadores,
  }
}

/** Valida la respuesta de `resolver_impugnacion_reparacion`. */
function leerResolucionImpugnacion(
  datos: unknown,
  accion: DecisionImpugnacionReparacion,
): ResultadoResolucionImpugnacion | null {
  if (!datos || typeof datos !== "object" || Array.isArray(datos)) return null
  const fila = datos as Record<string, unknown>
  const estado = leerEstadoEvidencia(fila.evidencia_estado)
  const reporteEstadoId = leerEstadoReporte(fila.reporte_estado_id)
  const contadores = leerContadores(fila)
  if (!estado || reporteEstadoId === undefined || !contadores) return null
  if (typeof fila.repetida !== "boolean" || typeof fila.cerrado !== "boolean") return null
  return {
    accion,
    repetida: fila.repetida,
    evidenciaEstado: estado,
    reporteEstadoId,
    cerrado: fila.cerrado,
    ...contadores,
  }
}

type PerfilAutor = { username: string | null; email: string | null }

/** Normaliza la relación del perfil autor que devuelve `getReportContext`. */
function leerPerfilAutor(relacion: PerfilAutor | PerfilAutor[] | null | undefined) {
  if (Array.isArray(relacion)) return relacion[0] ?? null
  return relacion ?? null
}

/**
 * Avisa al autor del reporte que la reparación quedó validada. El correo es mejor
 * esfuerzo: un proveedor caído nunca deshace la verificación ni el cierre (S12).
 */
async function notificarReparacionValidada(
  supabase: SupabaseClient,
  evidenciaId: string,
  comentario: string,
) {
  try {
    const { data, error } = await supabase
      .from("evidencias_reparacion")
      .select("reporte_id")
      .eq("id", evidenciaId)
      .maybeSingle()
    const reporteId = Number((data as { reporte_id?: number } | null)?.reporte_id)
    if (error || !Number.isInteger(reporteId)) return

    const contexto = await getReportContext(supabase, reporteId)
    if (!contexto.success) return
    const autor = leerPerfilAutor(contexto.data.ownerProfile)
    if (!contexto.data.usuario_id || !autor?.email) return

    await sendStatusNotificationEmail({
      ownerEmail: autor.email,
      ownerUsername: autor.username,
      reporteId,
      reporteTitulo: contexto.data.titulo,
      nuevoEstado: "Reparado",
      comentario,
    })
  } catch (error) {
    console.error("Error al notificar la reparación validada:", error)
  }
}

/** Lee la evidencia de una impugnación para poder avisar el cierre del reporte. */
async function evidenciaDeImpugnacion(supabase: SupabaseClient, verificacionId: string) {
  try {
    const { data } = await supabase
      .from("verificaciones_reparacion")
      .select("evidencia_id")
      .eq("id", verificacionId)
      .maybeSingle()
    const evidenciaId = (data as { evidencia_id?: string } | null)?.evidencia_id
    return typeof evidenciaId === "string" ? evidenciaId : null
  } catch {
    return null
  }
}

/**
 * Informa una reparación con su fotografía y comentario (S1). La foto entra en la
 * cola de moderación existente y el reporte no cambia de estado (S2): la evidencia
 * queda «informada» hasta que la foto se publica. Cuando los bytes privados no se
 * confirman, la respuesta es un error y reintentar la misma foto con el mismo
 * comentario reanuda la evidencia; el mismo reintento con otro comentario se rechaza
 * para no publicar un texto distinto al escrito.
 *
 * @param supabase - Cliente de servicio; la acción ya validó la sesión.
 * @param reporteId - Reporte que se está informando como reparado.
 * @param actorUserId - Cuenta autenticada que informa la reparación.
 * @param entrada - Comentario y archivo elegidos en el formulario.
 * @returns Evidencia creada con su estado visible, o el error en español.
 */
export async function informarReparacionWorkflow(
  supabase: SupabaseClient,
  reporteId: number,
  actorUserId: string,
  entrada: EntradaInformeReparacion,
): Promise<ResultadoReparacion<ResultadoInformeReparacion>> {
  const comentario = (entrada.comentario ?? "").trim()
  if (comentario.length === 0 || comentario.length > COMENTARIO_REPARACION_MAX) {
    return { success: false, error: MENSAJE_COMENTARIO_REPARACION_INVALIDO }
  }
  if (!await rolHabilitado(supabase, actorUserId)) {
    return { success: false, error: MENSAJE_CUENTA_REPARACION_REQUERIDA }
  }
  if (!isAcceptedReportImageType(entrada.image.type)) {
    return { success: false, error: "La imagen debe estar en formato JPG, PNG o WebP." }
  }
  if (entrada.image.size > REPORT_IMAGE_MAX_BYTES) {
    return { success: false, error: `La imagen optimizada no puede superar los ${REPORT_IMAGE_MAX_BYTES_LABEL}.` }
  }
  // El tipo real del archivo se valida antes de crear la evidencia y de moderar.
  await validateUploadedReportImage(entrada.image)

  const resultado = await moderarYGuardarImagenEvidenciaReparacion(supabase, {
    reporteId,
    autorId: actorUserId,
    comentario,
    image: entrada.image,
  })
  if (resultado.comentarioDistinto) {
    // El comentario guardado no es el que la persona acaba de escribir: no se publica
    // la evidencia ni se declara enviada (S1, S9).
    return { success: false, error: MENSAJE_COMENTARIO_EVIDENCIA_DISTINTO }
  }
  if (!resultado.evidenciaId) {
    return { success: false, error: mensajeDeCreacionFallida(resultado) }
  }
  if (resultado.estado === "ERROR_PRIVADO") {
    // Los bytes privados no quedaron confirmados: informar éxito dejaría el reporte
    // con una evidencia activa que nadie puede verificar (S1, S12).
    return { success: false, error: MENSAJE_CARGA_EVIDENCIA_INCOMPLETA }
  }
  return {
    success: true,
    data: {
      evidenciaId: resultado.evidenciaId,
      estado: estadoTrasModeracion(resultado),
      publicada: resultado.publicada,
      motivos: resultado.motivos,
      advertencias: resultado.advertencias,
    },
  }
}

/**
 * Confirma o impugna una reparación informada (S4). Con tres confirmaciones y sin
 * impugnaciones pendientes la RPC cierra el reporte una sola vez (S5, S12); repetir
 * la misma verificación devuelve el estado actual sin contar de nuevo (S7).
 *
 * @param supabase - Cliente de servicio; la acción ya validó la sesión.
 * @param evidenciaId - Evidencia en verificación.
 * @param actorUserId - Cuenta que confirma o impugna.
 * @param tipo - «confirmacion» o «impugnacion».
 * @param motivo - Motivo obligatorio cuando se impugna.
 * @returns Avance de la verificación, o el error en español.
 */
export async function verificarReparacionWorkflow(
  supabase: SupabaseClient,
  evidenciaId: string,
  actorUserId: string,
  tipo: TipoVerificacionReparacion,
  motivo?: string,
): Promise<ResultadoReparacion<ResultadoVerificacionReparacion>> {
  if (tipo !== "confirmacion" && tipo !== "impugnacion") {
    return { success: false, error: "Elegí confirmar o impugnar la reparación." }
  }
  const motivoLimpio = (motivo ?? "").trim()
  if (tipo === "impugnacion" && (motivoLimpio.length === 0 || motivoLimpio.length > MOTIVO_IMPUGNACION_MAX)) {
    return { success: false, error: MENSAJE_MOTIVO_IMPUGNACION_INVALIDO }
  }
  if (!await rolHabilitado(supabase, actorUserId)) {
    return { success: false, error: MENSAJE_CUENTA_REPARACION_REQUERIDA }
  }

  const { data, error } = await supabase.rpc("registrar_verificacion_reparacion", {
    p_evidencia_id: evidenciaId,
    p_usuario_id: actorUserId,
    p_tipo: tipo,
    p_motivo: tipo === "impugnacion" ? motivoLimpio : null,
  })
  if (error) {
    return { success: false, error: mensajeDeVerificacion(error) }
  }
  const verificacion = leerVerificacion(data)
  if (!verificacion) {
    return { success: false, error: MENSAJE_VERIFICACION_FALLIDA }
  }
  if (verificacion.cerrado) {
    await notificarReparacionValidada(
      supabase,
      evidenciaId,
      `Reparación validada por ${verificacion.confirmaciones} confirmaciones de usuarios`,
    )
  }
  return { success: true, data: { ...verificacion, umbral: UMBRAL_CONFIRMACIONES_REPARACION } }
}

/**
 * Aprueba, rechaza o revierte una evidencia (S8). Aprobar exige la foto publicada,
 * resuelve las impugnaciones pendientes y cierra el reporte como Reparado; revertir
 * devuelve el reporte a Pendiente.
 *
 * @param supabase - Cliente de servicio; la acción ya validó la sesión.
 * @param evidenciaId - Evidencia que se resuelve.
 * @param administradorId - Cuenta administradora que ejecuta la acción.
 * @param accion - «aprobar», «rechazar» o «revertir».
 * @param motivo - Motivo opcional que queda en la auditoría y en el historial.
 * @returns Resultado durable de la evidencia, o el error en español.
 */
export async function resolverEvidenciaReparacionWorkflow(
  supabase: SupabaseClient,
  evidenciaId: string,
  administradorId: string,
  accion: AccionEvidenciaAdministrativa,
  motivo?: string,
): Promise<ResultadoReparacion<ResultadoResolucionEvidencia>> {
  if (accion !== "aprobar" && accion !== "rechazar" && accion !== "revertir") {
    return { success: false, error: "Acción administrativa inválida." }
  }
  const autorizacion = await asegurarAdministrador(supabase, administradorId)
  if (!autorizacion.success) return autorizacion
  const motivoLimpio = (motivo ?? "").trim()

  const { data, error } = await supabase.rpc("resolver_evidencia_reparacion_admin", {
    p_evidencia_id: evidenciaId,
    p_administrador_id: administradorId,
    p_accion: accion,
    p_motivo: motivoLimpio || null,
  })
  if (error) {
    return { success: false, error: mensajeDeResolucionEvidencia(error) }
  }
  const resolucion = leerResolucionEvidencia(data, accion)
  if (!resolucion) {
    return { success: false, error: "No pudimos resolver la evidencia. Recargá la revisión e intentá nuevamente." }
  }
  if (resolucion.cerrado) {
    await notificarReparacionValidada(
      supabase,
      evidenciaId,
      motivoLimpio || "Reparación aprobada por administración",
    )
  }
  return { success: true, data: resolucion }
}

/**
 * Acepta o descarta una impugnación (S5, S8). Aceptarla rechaza la evidencia y el
 * reporte sigue pendiente; descartarla reevalúa el umbral y puede validar la
 * reparación en la misma transacción.
 *
 * @param supabase - Cliente de servicio; la acción ya validó la sesión.
 * @param verificacionId - Impugnación pendiente.
 * @param administradorId - Cuenta administradora que resuelve.
 * @param decision - «aceptada» o «descartada».
 * @param motivo - Motivo opcional que queda registrado con la resolución.
 * @returns Resultado durable de la impugnación, o el error en español.
 */
export async function resolverImpugnacionReparacionWorkflow(
  supabase: SupabaseClient,
  verificacionId: string,
  administradorId: string,
  decision: DecisionImpugnacionReparacion,
  motivo?: string,
): Promise<ResultadoReparacion<ResultadoResolucionImpugnacion>> {
  if (decision !== "aceptada" && decision !== "descartada") {
    return { success: false, error: "Elegí aceptar o descartar la impugnación." }
  }
  const autorizacion = await asegurarAdministrador(supabase, administradorId)
  if (!autorizacion.success) return autorizacion
  const motivoLimpio = (motivo ?? "").trim()

  const { data, error } = await supabase.rpc("resolver_impugnacion_reparacion", {
    p_verificacion_id: verificacionId,
    p_administrador_id: administradorId,
    p_decision: decision,
    p_motivo: motivoLimpio || null,
  })
  if (error) {
    return { success: false, error: mensajeDeResolucionImpugnacion(error) }
  }
  const resolucion = leerResolucionImpugnacion(data, decision)
  if (!resolucion) {
    return { success: false, error: MENSAJE_RESOLUCION_FALLIDA }
  }
  if (resolucion.cerrado) {
    const evidenciaId = await evidenciaDeImpugnacion(supabase, verificacionId)
    if (evidenciaId) {
      await notificarReparacionValidada(
        supabase,
        evidenciaId,
        `Reparación validada por ${resolucion.confirmaciones} confirmaciones de usuarios`,
      )
    }
  }
  return { success: true, data: resolucion }
}
