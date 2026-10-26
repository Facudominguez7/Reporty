/** Administración privada de evidencia: autorización DB en cada entrada y decisiones CAS. */
import "server-only"
import { createHash } from "node:crypto"
import { createClient } from "@/utils/supabase/server"
import { createAdminClient } from "@/utils/supabase/admin"
import { getUserRoleContext, isAdminRole } from "@/lib/authz/roles"
import { publicarImagenModerada, limpiarImagenModerada } from "./imagenes-reporte.server"
import { enviarAvisoRetiro, VENTANA_REINTENTO_MS } from "./avisos-retiro.server"

export type OperacionRevision = "aprobar" | "rechazar" | "recuperar" | "publicar" | "limpiar" | "avisar" | "conciliar"
export type ImagenAdministrativa = {
  id: string; reporteId: number; decision: string; estado: string
  motivos: string[]; fecha: string; cargaPendiente: boolean
  aviso?: { estado: string; conciliacion: boolean; intentos: number }
}
export type ResultadoRevision = { exito: boolean; mensaje: string; reporteId?: number }
type Evidencia = {
  id: string; reporte_id: number; decision: string; estado_publicacion: string
  motivos: string[]; token: string | null; path_privado: string; hash_sha256: string
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** Produce un error seguro con estado HTTP sin incluir información de Storage. */
function fallar(estado: number): never { throw Object.assign(new Error("Operación no disponible"), { estado }) }

/** Rechaza entradas inválidas antes de consultar DB o crear servicio. */
function validarId(id: string) { if (typeof id !== "string" || !UUID.test(id)) fallar(400) }

/** Obtiene identidad verificada y rol DB; metadata nunca concede acceso. */
export async function autorizarAdministracion() {
  const sesion = await createClient()
  const { data, error } = await sesion.auth.getUser()
  if (error || !data.user) fallar(401)
  if (data.user.is_anonymous) fallar(403)
  const rol = await getUserRoleContext(sesion, data.user.id)
  if (rol.error || !isAdminRole(rol.data?.roleId)) fallar(403)
  return { administradorId: data.user.id, servicio: createAdminClient() }
}

/** Lista veinte filas en orden total, separando revisión activa de terminales para limpieza manual. */
export async function listarImagenesAdministrativas(pagina: number, terminales = false): Promise<ImagenAdministrativa[]> {
  const { servicio } = await autorizarAdministracion()
  const indice = Number.isSafeInteger(pagina) ? Math.max(0, Math.min(pagina, 500)) : 0
  const { data, error } = await servicio.from("moderacion_imagenes")
    .select("id,reporte_id,decision,estado_publicacion,motivos,creado_at")
    .in("estado_publicacion", terminales ? ["publicada", "rechazada"] : ["pendiente", "reclamada", "publicando"])
    .order("creado_at", { ascending: true }).order("id", { ascending: true }).range(indice * 20, indice * 20 + 19)
  if (error) fallar(503)
  return Promise.all((data ?? []).map(async (fila) => ({
    id: fila.id, reporteId: fila.reporte_id, decision: fila.decision, estado: fila.estado_publicacion,
    fecha: fila.creado_at, cargaPendiente: fila.motivos?.includes("carga_privada_pendiente") ?? false,
    motivos: describirMotivos(fila.motivos),
    ...(fila.decision === "REJECTED" ? { aviso: await estadoAviso(servicio, fila.reporte_id) } : {}),
  })))
}

/** Proyección administrativa sin email ni token del outbox. */
async function estadoAviso(servicio: ReturnType<typeof createAdminClient>, reporteId: number) {
  const { data, error } = await servicio.from("avisos_retiro_reporte")
    .select("estado,intentos,primer_intento_at").eq("reporte_id", reporteId).maybeSingle()
  if (error) fallar(503)
  // Rechazos históricos anteriores a T1 no se completan infiriendo destinatarios.
  if (!data) return undefined
  return { estado: data.estado, intentos: data.intentos,
    conciliacion: data.estado === "reclamado" && Date.now() - Date.parse(data.primer_intento_at) >= VENTANA_REINTENTO_MS }
}

/** Traduce únicamente códigos conocidos: motivos remotos o futuros nunca se filtran al HTML. */
function describirMotivos(motivos: unknown): string[] {
  const textos: Record<string, string> = {
    carga_privada_pendiente: "Carga privada no confirmada: si falta la imagen solo se permite rechazar.",
    limpieza_privada_pendiente: "Limpieza privada pendiente; reintentar el borrado.",
    limpieza_publica_pendiente: "Limpieza pública pendiente; reintentar publicación o consultar operación manual.",
    reclamo_recuperado_por_administracion: "Clasificación interrumpida recuperada para revisión humana.",
    cuota_no_disponible: "Cuota no disponible.",
    contenido_ambiguo_armas_violencia_o_lesiones: "Contenido ambiguo: posibles armas, violencia o lesiones; evaluar el contexto.",
    contenido_explicito_o_grafico_extremo: "Contenido explícito o gráfico extremo detectado.",
    proveedor_no_disponible: "Proveedor no disponible; se requiere revisión humana.",
    respuesta_incompleta: "Respuesta del proveedor incompleta.",
    operaciones_desconocidas: "Consumo del proveedor incierto; no repetir clasificación.",
    operaciones_inesperadas: "Consumo inesperado; verificar presupuesto antes de continuar con el proveedor.",
    registro_consumo_pendiente: "Registro de consumo pendiente.",
    aprobacion_administrativa: "Aprobación humana registrada.",
    rechazo_administrativo: "Rechazo humano registrado.",
    indicadores_seguros: "Indicadores seguros.",
  }
  if (!Array.isArray(motivos) || !motivos.length) return ["Revisión humana necesaria."]
  return [...new Set(motivos.map((motivo) => textos[String(motivo)] ?? "Resultado ambiguo o clasificación no disponible; requiere revisión humana."))]
}

/** Lee una sola evidencia exclusivamente después del guard administrativo. */
async function leerEvidencia(servicio: ReturnType<typeof createAdminClient>, id: string): Promise<Evidencia> {
  const { data, error } = await servicio.from("moderacion_imagenes")
    .select("id,reporte_id,decision,estado_publicacion,motivos,token,path_privado,hash_sha256").eq("id", id).single()
  if (error || !data) fallar(404)
  return data as Evidencia
}

/** Valida tamaño, identidad y firma de los bytes canónicos, sin confiar en que la carga existió. */
async function leerBytes(servicio: ReturnType<typeof createAdminClient>, fila: Evidencia): Promise<Uint8Array> {
  const { data, error } = await servicio.storage.from("reportes-pendientes").download(fila.path_privado)
  if (error || !data || data.size > 102400 || data.size < 12) fallar(404)
  const bytes = new Uint8Array(await data.arrayBuffer())
  const buffer = Buffer.from(bytes)
  if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WEBP" || createHash("sha256").update(bytes).digest("hex") !== fila.hash_sha256) fallar(404)
  return bytes
}

/** Cada GET vuelve a verificar sesión y DB Admin antes de leer metadatos u objetos privados. */
export async function obtenerImagenPrivada(id: string): Promise<Uint8Array> {
  validarId(id)
  const { servicio } = await autorizarAdministracion()
  return leerBytes(servicio, await leerEvidencia(servicio, id))
}

/** Ejecuta decisiones humanas y recuperaciones explícitas; nunca llama al clasificador ni reserva cuota. */
export async function ejecutarRevision(id: string, operacion: OperacionRevision): Promise<ResultadoRevision> {
  validarId(id)
  if (!["aprobar", "rechazar", "recuperar", "publicar", "limpiar", "avisar", "conciliar"].includes(operacion)) fallar(400)
  const { servicio, administradorId } = await autorizarAdministracion()
  const fila = await leerEvidencia(servicio, id)
  const conflicto = { exito: false, mensaje: "Otro proceso modificó la imagen. Actualizá la cola antes de decidir." }
  if (operacion === "avisar" || operacion === "conciliar") {
    if (fila.decision !== "REJECTED" || fila.estado_publicacion !== "rechazada") return conflicto
    if (operacion === "avisar") {
      await enviarAvisoRetiro(servicio, fila.reporte_id)
      return { exito: true, reporteId: fila.reporte_id, mensaje: "Reporte retirado. Aviso procesado; consultá su estado antes de reintentar." }
    }
    const aviso = await servicio.from("avisos_retiro_reporte").select("token").eq("reporte_id", fila.reporte_id).single()
    if (aviso.error || !aviso.data) fallar(503)
    const conciliacion = await servicio.rpc("conciliar_aviso_retiro", {
      p_reporte_id: fila.reporte_id, p_token: aviso.data.token, p_administrador: administradorId,
    })
    if (conciliacion.error) fallar(503)
    return conciliacion.data === true
      ? { exito: true, reporteId: fila.reporte_id, mensaje: "Aceptación conciliada y auditada; no se envió otro correo." } : conflicto
  }
  if (operacion === "limpiar") {
    if (!["publicada", "rechazada"].includes(fila.estado_publicacion)) return conflicto
    const avisos = await limpiarImagenModerada(servicio, id)
    return { exito: true, reporteId: fila.reporte_id, mensaje: avisos.length ? "Decisión conservada; limpieza pendiente. Reintentá o consultá operación manual." : "Limpieza completada; auditoría conservada." }
  }
  if (operacion === "publicar") {
    if (fila.decision !== "APPROVED" || fila.estado_publicacion !== "publicando") return conflicto
  } else {
    const recuperar = operacion === "recuperar"
    if (fila.decision !== "REVIEW" || fila.estado_publicacion !== (recuperar ? "reclamada" : "pendiente")) return conflicto
    if (recuperar && !fila.token) return conflicto
    if (operacion === "aprobar") await leerBytes(servicio, fila)
    const { data, error } = await servicio.rpc("decidir_imagen_moderacion", {
      p_id: id, p_token: recuperar ? fila.token : null,
      p_decision: recuperar ? "REVIEW" : operacion === "aprobar" ? "APPROVED" : "REJECTED",
      p_motivos: [...(fila.motivos ?? []), recuperar ? "reclamo_recuperado_por_administracion" : operacion === "aprobar" ? "aprobacion_administrativa" : "rechazo_administrativo"],
      p_administrador: recuperar ? null : administradorId,
    })
    if (error) fallar(503)
    if (data !== true) return conflicto
    if (recuperar) return { exito: true, reporteId: fila.reporte_id, mensaje: "Reclamo devuelto a revisión. El token anterior quedó invalidado; ahora podés decidir." }
    if (operacion === "rechazar") {
      await enviarAvisoRetiro(servicio, fila.reporte_id)
      const avisos = await limpiarImagenModerada(servicio, id)
      return { exito: true, reporteId: fila.reporte_id, mensaje: avisos.length ? "Reporte retirado; advertencia registrada y limpieza pendiente. Reintentá el borrado." : "Reporte retirado; advertencia registrada y archivo privado eliminado." }
    }
  }
  const publicacion = await publicarImagenModerada(servicio, id)
  return { exito: true, reporteId: fila.reporte_id, mensaje: publicacion.publicada ? (publicacion.advertencias.length ? "Publicada; limpieza pendiente." : "Fotografía publicada.") : "Aprobación registrada; publicación pendiente. Reintentá sin reclasificar." }
}
