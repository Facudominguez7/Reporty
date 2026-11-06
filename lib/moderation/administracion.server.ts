/** Administración privada de evidencia: autorización DB en cada entrada y decisiones CAS. */
import "server-only"
import { createHash, randomUUID } from "node:crypto"
import { createClient } from "@/utils/supabase/server"
import { createAdminClient } from "@/utils/supabase/admin"
import { getUserRoleContext, isAdminRole } from "@/lib/authz/roles"
import { publicarImagenModerada, limpiarImagenModerada } from "./imagenes-reporte.server"
import { enviarAvisoRetiro, VENTANA_REINTENTO_MS } from "./avisos-retiro.server"
import { obtenerImagenPrivadaMascota, publicarRevisionMascota } from "./mascotas-imagen.server"
import { limpiarFotoMascotaRetirada } from "./mascotas-withdrawal.server"
import { procesarAvisosMascota } from "./avisos-mascotas.server"
import { prepararImagenReporte } from "@/lib/media/preparar-imagen-reporte.server"

export type OperacionRevision = "aprobar" | "rechazar" | "recuperar" | "publicar" | "limpiar" | "avisar" | "conciliar" | "retirarMascota"
export type ImagenAdministrativa = {
  id: string; reporteId: number; decision: string; estado: string
  motivos: string[]; fecha: string; cargaPendiente: boolean; esReemplazo: boolean
  aviso?: { estado: string; conciliacion: boolean; intentos: number }
  avisoMascota?: { id: number; estado: string; conciliacion: boolean; intentos: number; primerIntentoAt: string | null; conciliadoAt: string | null }
  soloAviso?: boolean
  tipo?: "reporte" | "mascota"
  mascotaId?: number | null
  tipoAnimal?: string
  reemplazoFoto?: boolean
  mascota?: { id: number; tipoAnimal: "perro" | "gato" | "otro"; descripcion: string; lat: number; lon: number; telefono: string; estado: "perdida" | "encontrada" }
}
export type ResultadoRevision = { exito: boolean; mensaje: string; reporteId?: number; mascotaId?: number; imagenId?: string }
export type EdicionMascotaAdmin = { id: number; tipoAnimal: "perro" | "gato" | "otro"; descripcion: string; lat: number; lon: number; telefono: string; estado: "perdida" | "encontrada" }
type Evidencia = {
  id: string; reporte_id: number; decision: string; estado_publicacion: string
  motivos: string[]; token: string | null; path_privado: string; hash_sha256: string
  reemplaza_foto_id: number | null
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
  return { administradorId: data.user.id, servicio: createAdminClient(), sesion }
}

/** Validates admin input and lets the caller-bound DB routine enforce authorization again. */
export async function subirFotoReemplazoMascotaAdministrativamente(mascotaId: number, archivo: File): Promise<ResultadoRevision> {
  if (!Number.isSafeInteger(mascotaId) || mascotaId <= 0 || !archivo || typeof archivo.arrayBuffer !== "function" || archivo.size <= 0) fallar(400)
  const { servicio, sesion } = await autorizarAdministracion()
  const { data: pet, error: petError } = await servicio.from("mascotas_perdidas")
    .select("propietario_id").eq("id", mascotaId).is("retirada_at", null).eq("moderacion_estado", "aprobada").maybeSingle()
  if (petError) fallar(503)
  if (!pet) return { exito: false, mensaje: "La publicación no está disponible para cambiar su foto." }
  const preparada = await prepararImagenReporte(archivo)
  const id = randomUUID()
  const hash = createHash("sha256").update(preparada.original).digest("hex")
  const { data: creada, error: crearError } = await sesion.rpc("crear_revision_reemplazo_foto_mascota", {
    p_mascota_id: mascotaId, p_evidencia_id: id, p_hash: hash,
  })
  if (crearError) fallar(503)
  if (creada !== id) return { exito: false, mensaje: "Ya hay una foto en revisión o la publicación cambió. Actualizá la cola." }
  const path = `${pet.propietario_id}/${id}`
  const { error: uploadError } = await servicio.storage.from("reportes-pendientes").upload(path, preparada.original, {
    upsert: false, contentType: "image/webp", cacheControl: "0",
  })
  if (uploadError) {
    await servicio.from("mascotas_fotos_moderacion").update({ motivos: ["carga_privada_pendiente"] }).eq("id", id)
    return { exito: true, mascotaId, imagenId: id, mensaje: "La solicitud quedó registrada sin foto privada confirmada; solo se puede rechazar." }
  }
  return { exito: true, mascotaId, imagenId: id, mensaje: "Foto cargada en privado; debe aprobarse en moderación antes de reemplazar la publicación." }
}

export async function editarMascotaAdministrativamente(input: EdicionMascotaAdmin): Promise<ResultadoRevision> {
  if (!input || !Number.isSafeInteger(input.id) || input.id <= 0
    || !["perro", "gato", "otro"].includes(input.tipoAnimal)
    || typeof input.descripcion !== "string" || input.descripcion.trim().length < 1 || input.descripcion.trim().length > 5000
    || !Number.isFinite(input.lat) || input.lat < -90 || input.lat > 90
    || !Number.isFinite(input.lon) || input.lon < -180 || input.lon > 180
    || typeof input.telefono !== "string" || input.telefono.trim().length < 1 || input.telefono.trim().length > 40
    || !["perdida", "encontrada"].includes(input.estado)) fallar(400)
  const { sesion } = await autorizarAdministracion()
  const { data, error } = await sesion.rpc("editar_mascota_moderacion", {
    p_mascota_id: input.id, p_tipo_animal: input.tipoAnimal, p_descripcion: input.descripcion.trim(),
    p_lat: input.lat, p_lon: input.lon, p_telefono: input.telefono.trim(), p_estado: input.estado,
  })
  if (error) fallar(503)
  return data === true
    ? { exito: true, mascotaId: input.id, mensaje: "Publicación de mascota actualizada." }
    : { exito: false, mascotaId: input.id, mensaje: "La publicación ya fue retirada o no está disponible." }
}

/** Lista veinte filas en orden total, separando revisión activa de terminales para limpieza manual. */
export async function listarImagenesAdministrativas(pagina: number, terminales = false): Promise<ImagenAdministrativa[]> {
  const { servicio } = await autorizarAdministracion()
  const indice = Number.isSafeInteger(pagina) ? Math.max(0, Math.min(pagina, 500)) : 0
  const noticeQuery = await servicio.from("avisos_estado_mascota")
    .select("id,mascota_id,estado,intentos,primer_intento_at,conciliado_at,creado_at")
    .or("estado.neq.enviado,conciliado_at.not.is.null").order("id", { ascending: true })
    .range(indice * 20, indice * 20 + 19)
  if (noticeQuery.error) fallar(503)
  const noticeEvents = noticeQuery.data ?? []
  const noticePetIds = [...new Set(noticeEvents.map((notice) => notice.mascota_id))]
  const noticePetsQuery = noticePetIds.length ? await servicio.from("mascotas_perdidas")
    .select("id,tipo_animal,retirada_at").in("id", noticePetIds) : { data: [], error: null }
  if (noticePetsQuery.error) fallar(503)
  const noticePets = new Map((noticePetsQuery.data ?? []).map((pet) => [pet.id, pet]))
  const noticeRows: ImagenAdministrativa[] = noticeEvents.flatMap((notice) => {
    const pet = noticePets.get(notice.mascota_id)
    if (!pet) return []
    return [{
      id: `aviso-mascota-${notice.id}`, reporteId: 0, mascotaId: notice.mascota_id,
      tipo: "mascota", tipoAnimal: pet.tipo_animal, decision: "APPROVED",
      estado: pet.retirada_at ? "retirada" : "publicada", fecha: notice.creado_at,
      cargaPendiente: false, esReemplazo: false, motivos: [], soloAviso: true,
      avisoMascota: { id: notice.id, estado: notice.estado, conciliacion: notice.estado === "conciliacion",
        intentos: notice.intentos, primerIntentoAt: notice.primer_intento_at, conciliadoAt: notice.conciliado_at },
    }]
  })
  const { data, error } = await servicio.from("moderacion_imagenes")
    .select("id,reporte_id,decision,estado_publicacion,motivos,creado_at,reemplaza_foto_id")
    .in("estado_publicacion", terminales ? ["publicada", "rechazada"] : ["pendiente", "reclamada", "publicando"])
    .order("creado_at", { ascending: true }).order("id", { ascending: true }).range(indice * 20, indice * 20 + 19)
  if (error) fallar(503)
  const reportRows = await Promise.all((data ?? []).map(async (fila) => ({
    id: fila.id, reporteId: fila.reporte_id, decision: fila.decision, estado: fila.estado_publicacion,
    fecha: fila.creado_at, cargaPendiente: fila.motivos?.includes("carga_privada_pendiente") ?? false,
    motivos: describirMotivos(fila.motivos), esReemplazo: fila.reemplaza_foto_id != null, tipo: "reporte" as const,
    ...(fila.decision === "REJECTED" && fila.reemplaza_foto_id == null ? { aviso: await estadoAviso(servicio, fila.reporte_id) } : {}),
  })))
  const petQuery = await servicio.from("mascotas_fotos_moderacion")
    .select("id,decision,estado,estado_publicacion,motivos,creado_at,mascota_id,tipo_animal,reemplaza_mascota_id")
    .in("estado", terminales ? ["aprobada", "rechazada"] : ["pendiente", "aprobada"])
    .range(indice * 20, indice * 20 + 19)
  if (petQuery.error) fallar(503)
  const petRows = (petQuery.data ?? []).filter((fila) => !("reporte_id" in fila) && (terminales
    ? fila.estado !== "pendiente"
    : fila.estado === "pendiente" || (fila.decision === "APPROVED" && !fila.mascota_id))).map((fila) => ({
    id: fila.id, reporteId: 0, decision: fila.decision,
    estado: fila.decision === "APPROVED" && !fila.mascota_id ? "publicando" : fila.estado_publicacion,
    fecha: fila.creado_at, cargaPendiente: fila.motivos?.includes("carga_privada_pendiente") ?? false,
    motivos: describirMotivos(fila.motivos), esReemplazo: false, tipo: "mascota" as const,
    mascotaId: fila.mascota_id, tipoAnimal: fila.tipo_animal, reemplazoFoto: fila.reemplaza_mascota_id != null,
  }))
  let editablePets: ImagenAdministrativa[] = []
  if (!terminales) {
    const { data: mascotas, error: mascotasError } = await servicio.from("mascotas_perdidas")
      .select("id,tipo_animal,descripcion,lat,lon,telefono,estado,publicada_at")
      .is("retirada_at", null).eq("moderacion_estado", "aprobada")
      .order("publicada_at", { ascending: true }).order("id", { ascending: true }).range(indice * 20, indice * 20 + 19)
    if (mascotasError) fallar(503)
    editablePets = (mascotas ?? []).filter((mascota) => Number.isSafeInteger(mascota.id) && typeof mascota.publicada_at === "string").map((mascota) => ({
      id: `mascota-${mascota.id}`, mascotaId: mascota.id, reporteId: 0, decision: "APPROVED", estado: "publicada",
      fecha: mascota.publicada_at, cargaPendiente: false, esReemplazo: false, motivos: [], tipo: "mascota" as const,
      mascota: { id: mascota.id, tipoAnimal: mascota.tipo_animal as "perro" | "gato" | "otro", descripcion: mascota.descripcion, lat: mascota.lat,
        lon: mascota.lon, telefono: mascota.telefono, estado: mascota.estado as "perdida" | "encontrada" },
    }))
  }
  return [...reportRows, ...petRows, ...editablePets, ...noticeRows].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id.localeCompare(b.id))
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

export async function conciliarAvisoMascotaAdministrativamente(avisoId: number) {
  if (!Number.isSafeInteger(avisoId) || avisoId <= 0) fallar(400)
  const { servicio, administradorId } = await autorizarAdministracion()
  const { data, error } = await servicio.from("avisos_estado_mascota")
    .select("id,token,estado").eq("id", avisoId).maybeSingle()
  if (error) fallar(503)
  if (!data || data.estado !== "conciliacion" || !data.token) return false
  const result = await servicio.rpc("conciliar_aviso_estado_mascota", {
    p_id: avisoId, p_token: data.token, p_administrador: administradorId,
  })
  if (result.error) fallar(503)
  return result.data === true
}

/** Traduce únicamente códigos conocidos: motivos remotos o futuros nunca se filtran al HTML. */
function describirMotivos(motivos: unknown): string[] {
  const textos: Record<string, string> = {
    carga_privada_pendiente: "Carga privada no confirmada: si falta la imagen solo se permite rechazar.",
    limpieza_privada_pendiente: "Limpieza privada pendiente; reintentar el borrado.",
    limpieza_publica_pendiente: "Limpieza pública pendiente; reintentar el borrado de la foto.",
    foto_reemplazada: "Foto anterior reemplazada; ya no es la imagen activa de la publicación.",
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
    .select("id,reporte_id,decision,estado_publicacion,motivos,token,path_privado,hash_sha256,reemplaza_foto_id").eq("id", id).single()
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
  const pet = await servicio.from("mascotas_fotos_moderacion").select("id").eq("id", id).maybeSingle()
  if (pet.error) fallar(503)
  if (pet.data && !("reporte_id" in pet.data)) return obtenerImagenPrivadaMascota(servicio, id)
  return leerBytes(servicio, await leerEvidencia(servicio, id))
}

/** Ejecuta decisiones humanas y recuperaciones explícitas; nunca llama al clasificador ni reserva cuota. */
export async function ejecutarRevision(id: string, operacion: OperacionRevision): Promise<ResultadoRevision> {
  validarId(id)
  if (!["aprobar", "rechazar", "recuperar", "publicar", "limpiar", "avisar", "conciliar", "retirarMascota"].includes(operacion)) fallar(400)
  const { servicio, sesion, administradorId } = await autorizarAdministracion()
  const pet = await servicio.from("mascotas_fotos_moderacion").select("*").eq("id", id).maybeSingle()
  if (pet.error) fallar(503)
  if (pet.data && !("reporte_id" in pet.data)) return ejecutarRevisionMascota(servicio, sesion, id, operacion, pet.data, administradorId)
  if (operacion === "retirarMascota") fallar(400)
  const fila = await leerEvidencia(servicio, id)
  const conflicto = { exito: false, mensaje: "Otro proceso modificó la imagen. Actualizá la cola antes de decidir." }
  if (operacion === "avisar" || operacion === "conciliar") {
    if (fila.reemplaza_foto_id != null || fila.decision !== "REJECTED" || fila.estado_publicacion !== "rechazada") return conflicto
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
      const avisos = await limpiarImagenModerada(servicio, id)
      if (fila.reemplaza_foto_id != null) {
        return { exito: true, reporteId: fila.reporte_id, mensaje: avisos.length ? "Reemplazo rechazado; el reporte se conserva. Limpieza pendiente." : "Reemplazo rechazado; el reporte y sus fotos actuales se conservan." }
      }
      await enviarAvisoRetiro(servicio, fila.reporte_id)
      return { exito: true, reporteId: fila.reporte_id, mensaje: avisos.length ? "Reporte retirado; advertencia registrada y limpieza pendiente. Reintentá el borrado." : "Reporte retirado; advertencia registrada y archivo privado eliminado." }
    }
  }
  const publicacion = await publicarImagenModerada(servicio, id)
  return { exito: true, reporteId: fila.reporte_id, mensaje: publicacion.publicada ? (publicacion.advertencias.length ? "Publicada; limpieza pendiente." : "Fotografía publicada.") : "Aprobación registrada; publicación pendiente. Reintentá sin reclasificar." }
}

const PHOTO_PATH = /^mascotas\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$/i

async function limpiarFotoReemplazada(servicio: ReturnType<typeof createAdminClient>, evidencia: Record<string, any>) {
  const path = typeof evidencia.path_publico === "string" ? evidencia.path_publico
    : typeof evidencia.id === "string" && UUID.test(evidencia.id) ? `mascotas/${evidencia.id}.webp` : null
  if (!path || !PHOTO_PATH.test(path)) return true
  const bucket = servicio.storage.from("reportes")
  const actual = await servicio.from("mascotas_perdidas").select("id").eq("foto_path", path).limit(1)
  if (actual.error) {
    if (!evidencia.motivos?.includes("limpieza_publica_pendiente")) {
      await servicio.from("mascotas_fotos_moderacion").update({ motivos: [...(evidencia.motivos ?? []), "limpieza_publica_pendiente"] }).eq("id", evidencia.id)
    }
    return true
  }
  if (actual.data?.length) {
    if (evidencia.motivos?.includes("limpieza_publica_pendiente")) {
      await servicio.from("mascotas_fotos_moderacion").update({ motivos: (evidencia.motivos ?? []).filter((reason: string) => reason !== "limpieza_publica_pendiente") }).eq("id", evidencia.id)
    }
    return false
  }
  if (!evidencia.motivos?.includes("limpieza_publica_pendiente")) {
    const marked = await servicio.from("mascotas_fotos_moderacion")
      .update({ motivos: [...(evidencia.motivos ?? []), "limpieza_publica_pendiente"] }).eq("id", evidencia.id)
    if (marked.error) return true
  }
  try { await bucket.remove([path]) } catch { /* Verify absence before clearing the durable retry flag. */ }
  try {
    const stored = await bucket.download(path)
    const url = bucket.getPublicUrl(path).data.publicUrl
    const response = await fetch(url, { method: "GET", cache: "no-store", signal: AbortSignal.timeout(5000) })
    const hidden = [401, 403, 404, 410].includes(response.status)
    const absent = !stored.data && ["404", 404].includes((stored.error as { statusCode?: string | number } | null)?.statusCode ?? "")
    if (!hidden || !absent) return true
  } catch { return true }
  const { error } = await servicio.from("mascotas_fotos_moderacion")
    .update({ motivos: (evidencia.motivos ?? []).filter((reason: string) => reason !== "limpieza_publica_pendiente") })
    .eq("id", evidencia.id).contains("motivos", ["limpieza_publica_pendiente"])
  return Boolean(error)
}

async function publicarReemplazoFotoMascota(
  servicio: ReturnType<typeof createAdminClient>, sesion: Awaited<ReturnType<typeof createClient>>,
  id: string, mascotaId: number,
): Promise<{ exito: boolean; mensaje: string }> {
  const { data: evidence, error } = await servicio.from("mascotas_fotos_moderacion")
    .select("id,propietario_id,path_privado,path_publico,hash_sha256,decision,estado,estado_publicacion,publish_token,reemplaza_mascota_id,motivos")
    .eq("id", id).single()
  if (error || !evidence || evidence.reemplaza_mascota_id !== mascotaId || evidence.decision !== "APPROVED") {
    return { exito: false, mensaje: "La foto no está aprobada para esta publicación." }
  }
  if (evidence.estado_publicacion === "publicada") return { exito: true, mensaje: "El reemplazo ya quedó publicado; verificá la limpieza anterior en la cola." }
  let bytes: Uint8Array
  try { bytes = await obtenerImagenPrivadaMascota(servicio, id) }
  catch { return { exito: false, mensaje: "La foto privada no está disponible para verificar." } }
  const claim = await sesion.rpc("reclamar_reemplazo_foto_mascota", { p_evidencia_id: id })
  if (claim.error || typeof claim.data !== "string") return { exito: false, mensaje: "No se pudo reclamar el reemplazo; actualizá la cola." }
  const token = claim.data
  const livePet = await servicio.from("mascotas_perdidas").select("id")
    .eq("id", mascotaId).is("retirada_at", null).maybeSingle()
  if (livePet.error || !livePet.data) return { exito: false, mensaje: "La publicación cambió; no se cargó la foto nueva." }
  const path = `mascotas/${id}.webp`
  const bucket = servicio.storage.from("reportes")
  const existing = await bucket.download(path)
  if (existing.data) {
    if (existing.data.size !== bytes.length || createHash("sha256").update(new Uint8Array(await existing.data.arrayBuffer())).digest("hex") !== evidence.hash_sha256) {
      return { exito: false, mensaje: "La foto pública no coincide con la evidencia privada; no se reemplazó la publicación." }
    }
  } else {
    const notFound = ["404", 404].includes((existing.error as { statusCode?: string | number } | null)?.statusCode ?? "")
    if (!notFound) return { exito: false, mensaje: "No se pudo verificar el objeto público; el reemplazo sigue pendiente." }
    const uploaded = await bucket.upload(path, bytes, { upsert: false, contentType: "image/webp", cacheControl: "0" })
    if (uploaded.error) {
      const retry = await bucket.download(path)
      if (!retry.data || retry.data.size !== bytes.length || createHash("sha256").update(new Uint8Array(await retry.data.arrayBuffer())).digest("hex") !== evidence.hash_sha256) {
        return { exito: false, mensaje: "La carga pública no pudo confirmarse; la foto actual se conserva." }
      }
    }
  }
  const { data: petBefore, error: petError } = await servicio.from("mascotas_perdidas")
    .select("foto_moderacion_id").eq("id", mascotaId).is("retirada_at", null).maybeSingle()
  if (petError || !petBefore) {
    const reconciled = await sesion.rpc("conciliar_reemplazo_foto_mascota", { p_evidencia_id: id })
    if (reconciled.error || !["actual", "limpieza"].includes(reconciled.data)) {
      return { exito: false, mensaje: "No se pudo verificar la publicación ni registrar su limpieza; no se borró ninguna foto." }
    }
    return reconciled.data === "actual"
      ? { exito: true, mensaje: "El reemplazo ya está activo; la foto anterior conserva su limpieza pendiente." }
      : { exito: false, mensaje: "No se pudo verificar la publicación; la limpieza quedó registrada para reintento seguro." }
  }
  const { data: oldPhoto, error: oldError } = await servicio.from("mascotas_fotos_moderacion")
    .select("id,path_publico,motivos").eq("id", petBefore.foto_moderacion_id).single()
  const oldPhotoUnavailable = Boolean(oldError || !oldPhoto)
  const finalized = await sesion.rpc("finalizar_reemplazo_foto_mascota", { p_evidencia_id: id, p_token: token })
  if (finalized.error || typeof finalized.data !== "string") {
    const { data: current, error: currentError } = await servicio.from("mascotas_perdidas")
      .select("foto_moderacion_id,foto_path").eq("id", mascotaId).maybeSingle()
    if (!currentError && current?.foto_moderacion_id === id && current.foto_path === path) {
      return { exito: true, mensaje: "El reemplazo ya está activo; la foto anterior conserva su limpieza pendiente." }
    }
    const reconciled = await sesion.rpc("conciliar_reemplazo_foto_mascota", { p_evidencia_id: id })
    if (reconciled.error || !["actual", "limpieza"].includes(reconciled.data)) {
      return { exito: false, mensaje: "No se pudo confirmar el reemplazo ni registrar su limpieza; no se borró ninguna foto." }
    }
    return reconciled.data === "actual"
      ? { exito: true, mensaje: "El reemplazo ya está activo; la foto anterior conserva su limpieza pendiente." }
      : { exito: false, mensaje: "No se pudo confirmar el reemplazo; la limpieza quedó registrada para reintento seguro." }
  }
  if (oldPhotoUnavailable) {
    return { exito: true, mensaje: finalized.data
      ? "Foto reemplazada y aprobada; la limpieza de la foto anterior quedó pendiente en la cola."
      : "El reemplazo ya estaba publicado; la limpieza de la foto anterior quedó pendiente en la cola." }
  }
  const cleanupPending = finalized.data && oldPhoto ? await limpiarFotoReemplazada(servicio, { ...oldPhoto, motivos: [...(oldPhoto.motivos ?? []), "limpieza_publica_pendiente"] }) : false
  return { exito: true, mensaje: cleanupPending ? "Foto reemplazada y aprobada; la limpieza de la anterior sigue pendiente." : "Foto reemplazada y aprobada." }
}

async function ejecutarRevisionMascota(
  servicio: ReturnType<typeof createAdminClient>,
  sesion: Awaited<ReturnType<typeof createClient>>,
  id: string,
  operacion: OperacionRevision,
  evidencia: Record<string, any>,
  administradorId: string,
): Promise<ResultadoRevision> {
  const conflicto = { exito: false, mensaje: "La revisión cambió o ya fue resuelta. Actualizá la cola." }
  if (operacion === "retirarMascota") {
    if (!Number.isSafeInteger(evidencia.mascota_id)) return conflicto
    const { data, error } = await sesion.rpc("retirar_mascota_moderacion", { p_mascota_id: evidencia.mascota_id })
    if (error) fallar(503)
    if (data !== true) return conflicto
    try { await procesarAvisosMascota(servicio, evidencia.mascota_id) } catch { /* Durable outbox remains available to the explicit retry action. */ }
    let cleanup
    try { cleanup = await limpiarFotoMascotaRetirada(servicio, evidencia.mascota_id) }
    catch { cleanup = { removed: false, pending: true, publiclyAccessible: true } }
    return {
      exito: true, mascotaId: evidencia.mascota_id,
      mensaje: cleanup.publiclyAccessible
        ? "Publicación retirada y puntos revertidos. La foto pública todavía puede verse por su URL; quedó una limpieza durable pendiente. Reintentá la limpieza."
        : "Publicación retirada, puntos revertidos una sola vez y foto pública no accesible.",
    }
  }
  if (operacion === "limpiar") {
    const orphanReplacement = evidencia.reemplaza_mascota_id
      && ["publicando", "rechazada"].includes(evidencia.estado_publicacion)
      && evidencia.motivos?.includes("limpieza_publica_pendiente")
    if (evidencia.estado !== "rechazada" && evidencia.estado_publicacion !== "publicada" && !orphanReplacement) return conflicto
    let cleanupPublica: Awaited<ReturnType<typeof limpiarFotoMascotaRetirada>> | null = null
    if (evidencia.mascota_id) {
      const { data: pet, error: petError } = await servicio.from("mascotas_perdidas")
        .select("retirada_at,foto_limpieza_estado").eq("id", evidencia.mascota_id).maybeSingle()
      if (petError) fallar(503)
      if (pet?.retirada_at && pet.foto_limpieza_estado === "pendiente") {
        try { cleanupPublica = await limpiarFotoMascotaRetirada(servicio, evidencia.mascota_id) }
        catch { cleanupPublica = { removed: false, pending: true, publiclyAccessible: true } }
      }
    }
    const replacedCleanupPending = evidencia.motivos?.includes("limpieza_publica_pendiente")
      ? await limpiarFotoReemplazada(servicio, evidencia) : false
    const { error } = await servicio.storage.from("reportes-pendientes").remove([evidencia.path_privado])
    if (cleanupPublica?.publiclyAccessible || replacedCleanupPending) {
      return { exito: true, mascotaId: evidencia.mascota_id ?? undefined, mensaje: "Foto privada limpiada; la foto pública todavía puede verse por su URL. La limpieza permanece pendiente; reintentá." }
    }
    return { exito: true, mascotaId: evidencia.mascota_id ?? undefined, mensaje: error ? "Decisión conservada; limpieza privada pendiente." : "Evidencia privada limpiada; auditoría conservada." }
  }
  if (operacion === "rechazar") {
    if (evidencia.estado !== "pendiente" || evidencia.decision !== "REVIEW" || evidencia.mascota_id) return conflicto
    const { data, error } = await servicio.from("mascotas_fotos_moderacion").update({
      decision: "REJECTED", estado: "rechazada", estado_publicacion: "rechazada",
      path_publico: null, aprobado_at: null, administrador_id: administradorId, revisado_at: new Date().toISOString(),
      motivos: [...(evidencia.motivos ?? []), "rechazo_administrativo"],
    }).eq("id", id).eq("decision", "REVIEW").eq("estado", "pendiente").select("id").maybeSingle()
    if (error) fallar(503)
    return data ? { exito: true, mensaje: "Foto rechazada; no se creó la publicación ni se otorgaron puntos." } : conflicto
  }
  if (operacion === "aprobar") {
    if (evidencia.estado !== "pendiente" || evidencia.decision !== "REVIEW") return conflicto
    try { await obtenerImagenPrivadaMascota(servicio, id) } catch { return { exito: false, mensaje: "La imagen privada no está disponible para verificar; solo se puede rechazar." } }
    const { data, error } = await servicio.from("mascotas_fotos_moderacion").update({
      decision: "APPROVED", administrador_id: administradorId, revisado_at: new Date().toISOString(),
      ...(evidencia.reemplaza_mascota_id ? { estado: "aprobada", aprobado_at: new Date().toISOString() } : {}),
      motivos: [...(evidencia.motivos ?? []), "aprobacion_administrativa"],
    }).eq("id", id).eq("decision", "REVIEW").eq("estado", "pendiente").select("id").maybeSingle()
    if (error) fallar(503)
    if (!data) return conflicto
  } else if (operacion !== "publicar" || evidencia.decision !== "APPROVED") {
    return conflicto
  }
  if (evidencia.reemplaza_mascota_id) {
    const resultado = await publicarReemplazoFotoMascota(servicio, sesion, id, evidencia.reemplaza_mascota_id)
    return { ...resultado, mascotaId: evidencia.reemplaza_mascota_id }
  }
  const publicacion = await publicarRevisionMascota(servicio, id)
  return publicacion.mascotaId
    ? { exito: true, mascotaId: publicacion.mascotaId, mensaje: "Mascota aprobada y publicada; se acreditaron los puntos de creación una sola vez." }
    : { exito: false, mensaje: "La aprobación quedó registrada, pero la publicación no pudo finalizarse. Reintentá sin reclasificar." }
}
