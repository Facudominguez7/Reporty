/**
 * Lectura server-only de la evidencia de reparación que se muestra en la ficha del
 * reporte (S10, S11, S13).
 *
 * La ficha solo describe lo que la base ya decidió: el estado visible de la
 * evidencia, sus fotos públicas, sus contadores y qué puede hacer la persona que
 * está mirando. Nunca expone identidades de quienes confirmaron o impugnaron, ni la
 * foto privada de una evidencia que todavía está en moderación. Cualquier fallo de
 * lectura devuelve `null` para que la ficha del reporte siga funcionando.
 */
import "server-only"

import type { SupabaseClient, User } from "@supabase/supabase-js"

import { REPORT_STATE_IDS } from "@/lib/authz/catalog"
import {
  esRolOperador,
  getUserRoleContext,
} from "@/lib/authz/roles"
import { getPublicProfile } from "@/database/queries/profiles"
import { resolveReportImageThumbnailUrl, resolveReportImageUrl } from "@/lib/media/report-images"
import { createAdminClient } from "@/utils/supabase/admin"
import { createClient } from "@/utils/supabase/server"
import {
  UMBRAL_CONFIRMACIONES_REPARACION,
  puedeInformarReparacion,
  type TipoVerificacionReparacion,
} from "./evidencia-reparacion"

/** Los tres estados que puede mostrar la ficha del reporte (S11). */
export type EstadoVisibleReparacion = "informada" | "en_verificacion" | "reparado"

/**
 * Por qué una persona no puede confirmar ni impugnar: sin sesión, con una cuenta que
 * todavía no cumple los requisitos, por ser el autor de la foto o por ser operador
 * municipal (administración sí participa, L21).
 */
export type MotivoSinParticipacion = "sesion" | "cuenta" | "autor" | "operador"

/** Foto pública de la reparación; solo existe cuando la moderación ya la publicó. */
export type FotoEvidenciaReparacion = { src: string; miniatura: string | null }

/** Evidencia que la ficha muestra, con lo que puede hacer quien la está mirando. */
export type EvidenciaReparacionVista = {
  evidenciaId: string
  estado: EstadoVisibleReparacion
  autor: string | null
  comentario: string | null
  informadaAt: string
  publicadaAt: string | null
  foto: FotoEvidenciaReparacion | null
  confirmaciones: number
  impugnacionesPendientes: number
  participacion: {
    puede: boolean
    motivo: MotivoSinParticipacion | null
    yaVerifico: TipoVerificacionReparacion | null
  }
}

/** Sección completa de reparación: la evidencia visible y si se puede informar otra. */
export type SeccionReparacionVista = {
  umbral: number
  evidencia: EvidenciaReparacionVista | null
  /** Muestra el formulario: cuenta habilitada, reporte Pendiente y sin evidencia activa. */
  puedeInformar: boolean
}

const ESTADOS_VISIBLES = ["informada", "en_verificacion", "validada"] as const
const ESTADOS_ACTIVOS: readonly string[] = ["informada", "en_verificacion"]
/** Tope de filas de verificación que se agregan; el umbral es tres (S5). */
const LIMITE_VERIFICACIONES = 1000
/** Tope de evidencias leídas por reporte cuando una validada convive con una activa. */
const LIMITE_EVIDENCIAS = 5

const COLUMNAS_EVIDENCIA = "id,autor_id,comentario,estado,url,bucket,path,thumbnail_url,thumbnail_bucket,thumbnail_path,created_at,publicada_at"

type Relacion<T> = T | T[] | null

type FilaEvidencia = {
  id: string
  autor_id: string
  comentario: string | null
  estado: string
  url: string | null
  bucket: string | null
  path: string | null
  thumbnail_url: string | null
  thumbnail_bucket: string | null
  thumbnail_path: string | null
  created_at: string
  publicada_at: string | null
}

type FilaVerificacion = { usuario_id: string; tipo: string; estado: string }

/**
 * Traduce el estado durable de la evidencia a los tres estados que la ficha muestra.
 * Una evidencia rechazada o revertida no se publica como reparación: deja de mostrarse.
 *
 * @param estado - `evidencias_reparacion.estado` tal como está en la base.
 * @returns El estado visible de la ficha, o `null` cuando no corresponde mostrarla.
 */
export function estadoVisibleEvidencia(estado: string): EstadoVisibleReparacion | null {
  if (estado === "informada") return "informada"
  if (estado === "en_verificacion") return "en_verificacion"
  if (estado === "validada") return "reparado"
  return null
}

/** Normaliza la relación embebida de PostgREST a un único objeto o `null`. */
function uno<T>(relacion: Relacion<T>): T | null {
  return Array.isArray(relacion) ? relacion[0] ?? null : relacion
}

/** Elige la evidencia que la ficha muestra: la activa manda sobre una validada anterior. */
function elegirEvidencia(filas: FilaEvidencia[]): FilaEvidencia | null {
  return filas.find((fila) => ESTADOS_ACTIVOS.includes(fila.estado)) ?? filas[0] ?? null
}

/**
 * Explica por qué la persona no participa de la verificación, si es el caso.
 * El autor de la foto no valida su propia evidencia (S6); el operador municipal no
 * vota y el invitado o la cuenta sin correo confirmado no participan (S15).
 * Administración sí participa como cualquier cuenta habilitada (L21).
 */
function motivoSinParticipacion(
  usuario: Pick<User, "id" | "is_anonymous" | "email_confirmed_at"> | null,
  rolId: number | null,
  autorId: string,
): MotivoSinParticipacion | null {
  if (!usuario) return "sesion"
  if (usuario.id === autorId) return "autor"
  if (esRolOperador(rolId)) return "operador"
  if (!puedeInformarReparacion(usuario, rolId)) return "cuenta"
  return null
}

/** Cuenta confirmaciones, impugnaciones pendientes y la verificación de la persona. */
function leerVerificaciones(filas: FilaVerificacion[], usuarioId: string | null) {
  let confirmaciones = 0
  let impugnacionesPendientes = 0
  let yaVerifico: TipoVerificacionReparacion | null = null

  for (const fila of filas) {
    if (fila.tipo === "confirmacion") confirmaciones += 1
    if (fila.tipo === "impugnacion" && fila.estado === "pendiente") impugnacionesPendientes += 1
    if (usuarioId && fila.usuario_id === usuarioId) {
      if (fila.tipo === "confirmacion") yaVerifico = "confirmacion"
      if (fila.tipo === "impugnacion") yaVerifico = "impugnacion"
    }
  }

  return { confirmaciones, impugnacionesPendientes, yaVerifico }
}

/** Arma la foto pública de la evidencia; una evidencia en moderación no tiene foto. */
function fotoPublica(fila: FilaEvidencia): FotoEvidenciaReparacion | null {
  if (!fila.publicada_at) return null
  const src = resolveReportImageUrl(fila)
  if (!src) return null
  return { src, miniatura: resolveReportImageThumbnailUrl(fila) }
}

/**
 * Lee la evidencia visible del reporte y arma la sección que la ficha renderiza.
 * El servicio es de service_role: las tablas de reparaciones no tienen políticas de
 * cliente y la ficha nunca debe depender de un rol del navegador (S12).
 */
async function leerSeccion(
  servicio: SupabaseClient,
  entrada: {
    reporteId: number
    reporteEstadoId: number
    usuario: Pick<User, "id" | "is_anonymous" | "email_confirmed_at"> | null
    rolId: number | null
  },
): Promise<SeccionReparacionVista | null> {
  const { data: filasEvidencia, error: errorEvidencias } = await servicio
    .from("evidencias_reparacion")
    .select(COLUMNAS_EVIDENCIA)
    .eq("reporte_id", entrada.reporteId)
    .in("estado", [...ESTADOS_VISIBLES])
    .order("created_at", { ascending: false })
    .limit(LIMITE_EVIDENCIAS)
  if (errorEvidencias) throw errorEvidencias

  const fila = elegirEvidencia((filasEvidencia ?? []) as FilaEvidencia[])
  const hayEvidenciaActiva = Boolean(fila && ESTADOS_ACTIVOS.includes(fila.estado))
  // Informar una reparación exige un reporte Pendiente, ninguna evidencia activa y
  // una cuenta habilitada; el servidor vuelve a comprobarlo en la RPC (S2, S15).
  const puedeInformar = Boolean(
    entrada.reporteEstadoId === REPORT_STATE_IDS.PENDIENTE
    && !hayEvidenciaActiva
    && puedeInformarReparacion(entrada.usuario, entrada.rolId),
  )

  // Sin evidencia visible la franja igual se devuelve: quien no puede informar
  // (invitado, sesión anónima, operador o reporte cerrado) ve la invitación a
  // ingresar en vez de que la sección desaparezca.
  if (!fila) {
    return { umbral: UMBRAL_CONFIRMACIONES_REPARACION, evidencia: null, puedeInformar }
  }

  const estado = estadoVisibleEvidencia(fila.estado)
  if (!estado) {
    return { umbral: UMBRAL_CONFIRMACIONES_REPARACION, evidencia: null, puedeInformar }
  }

  const [{ data: filasVerificacion, error: errorVerificaciones }, perfilResult] = await Promise.all([
    servicio
      .from("verificaciones_reparacion")
      .select("usuario_id,tipo,estado")
      .eq("evidencia_id", fila.id)
      .limit(LIMITE_VERIFICACIONES),
    fila.autor_id
      ? getPublicProfile(servicio, fila.autor_id)
      : Promise.resolve({ data: null, error: null }),
  ])
  if (errorVerificaciones) throw errorVerificaciones
  if (perfilResult.error) throw perfilResult.error

  const usuarioId = entrada.usuario?.id ?? null
  const { confirmaciones, impugnacionesPendientes, yaVerifico } = leerVerificaciones(
    (filasVerificacion ?? []) as FilaVerificacion[],
    usuarioId,
  )
  const motivo = estado === "en_verificacion"
    ? motivoSinParticipacion(entrada.usuario, entrada.rolId, fila.autor_id)
    : null

  return {
    umbral: UMBRAL_CONFIRMACIONES_REPARACION,
    puedeInformar,
    evidencia: {
      evidenciaId: fila.id,
      estado,
      autor: uno(perfilResult.data)?.username ?? null,
      comentario: fila.comentario,
      informadaAt: fila.created_at,
      publicadaAt: fila.publicada_at,
      foto: fotoPublica(fila),
      confirmaciones,
      impugnacionesPendientes,
      participacion: {
        puede: estado === "en_verificacion" && motivo === null,
        motivo,
        yaVerifico,
      },
    },
  }
}

/**
 * Devuelve la sección de reparación de la ficha del reporte.
 *
 * @param reporteId - Reporte cuya evidencia se muestra.
 * @param reporteEstadoId - `estado_id` ya cargado por la ficha, para no volver a leerlo.
 * @returns La sección visible, o `null` cuando no hay nada que mostrar o la lectura falla.
 */
export async function obtenerSeccionReparacion(
  reporteId: number,
  reporteEstadoId: number,
): Promise<SeccionReparacionVista | null> {
  try {
    const sesion = await createClient()
    const { data } = await sesion.auth.getUser()
    const usuario = data.user ?? null
    // El rol se lee del perfil de la base con la sesión, nunca del navegador.
    const rolId = usuario
      ? (await getUserRoleContext(sesion, usuario.id)).data?.roleId ?? null
      : null

    return await leerSeccion(createAdminClient(), { reporteId, reporteEstadoId, usuario, rolId })
  } catch (error) {
    console.error("Error al cargar la evidencia de reparación:", error)
    return null
  }
}
