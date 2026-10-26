/** Frontera confiable de moderación: cola privada, cuota y publicación CAS recuperable. */
import "server-only"
import { createHash, randomUUID } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import { prepararImagenReporte } from "@/lib/media/preparar-imagen-reporte.server"
import { moderarImagen } from "./sightengine.server"
import type { ResultadoModeracion } from "./tipos"
import { enviarAvisoRetiro } from "./avisos-retiro.server"

const BUCKET_PRIVADO = "reportes-pendientes"
const BUCKET_PUBLICO = "reportes"
type Decision = ResultadoModeracion["decision"]
type FilaImagen = {
  id: string
  reporte_id: number
  propietario_id: string
  hash_sha256: string
  path_privado: string
  decision: Decision
  motivos: string[]
  estado_publicacion: "pendiente" | "reclamada" | "publicando" | "publicada" | "rechazada"
  token: string | null
}
export type ResultadoImagenReporte = {
  estado: Decision | "ERROR_PRIVADO"
  publicada: boolean
  motivos: string[]
  advertencias: string[]
}
export type EntradaImagenReporte = { reporteId: number; propietarioId: string; image: File }

/** Calcula identidad exacta del contenido sin nombres suministrados por el cliente. */
function hash(bytes: Uint8Array) { return createHash("sha256").update(bytes).digest("hex") }

/** Devuelve únicamente texto seguro; nunca identificadores o motivos internos del proveedor. */
function resultado(fila?: FilaImagen | null, advertencias: string[] = []): ResultadoImagenReporte {
  const cargaFallida = fila?.decision === "REVIEW" && fila.motivos?.includes("carga_privada_pendiente")
  const estado = cargaFallida ? "ERROR_PRIVADO" : fila?.decision ?? "ERROR_PRIVADO"
  return {
    estado,
    publicada: fila?.estado_publicacion === "publicada",
    motivos: estado === "REJECTED" ? ["Tu reporte fue retirado porque la fotografía adjunta incumple nuestras normas de contenido. Evitá volver a publicar este tipo de material"]
      : estado === "REVIEW" ? ["La fotografía quedó privada y pendiente de revisión. No necesitás reenviar el reporte."]
      : estado === "ERROR_PRIVADO" ? ["No pudimos guardar la fotografía. Tu reporte fue creado sin imagen."] : [],
    advertencias,
  }
}

/** Lee la evidencia por servicio; los llamadores deben autorizar previamente su sesión. */
async function leerFila(supabase: SupabaseClient, id: string): Promise<FilaImagen> {
  const { data, error } = await supabase.from("moderacion_imagenes").select("*").eq("id", id).single()
  if (error || !data) throw new Error("cola_no_disponible")
  return data as FilaImagen
}

/** Persiste códigos de recuperación sin registrar cuerpos remotos ni datos sensibles. */
async function auditar(supabase: SupabaseClient, fila: FilaImagen, codigo: string): Promise<void> {
  const motivos = [...new Set([...(fila.motivos ?? []), codigo])]
  const { error } = await supabase.from("moderacion_imagenes").update({ motivos }).eq("id", fila.id)
  if (error) throw new Error("auditoria_pendiente")
}

/** Borra solo privados terminales; una fila terminal con objeto sigue siendo recuperable por su ruta durable. */
export async function limpiarImagenModerada(supabase: SupabaseClient, id: string): Promise<string[]> {
  try {
    const fila = await leerFila(supabase, id)
    if (fila.estado_publicacion !== "publicada" && fila.estado_publicacion !== "rechazada") return []
    const { error } = await supabase.storage.from(BUCKET_PRIVADO).remove([fila.path_privado])
    if (!error) return []
    await auditar(supabase, fila, "limpieza_privada_pendiente")
    return ["limpieza_privada_pendiente"]
  } catch {
    return ["limpieza_privada_pendiente", "auditoria_pendiente"]
  }
}

/** Reconoce únicamente ausencia inequívoca; limita a 4 KiB y 500 ms el cuerpo original del SDK. */
async function esObjetoAusente(error: unknown): Promise<boolean> {
  if (!error || typeof error !== "object") return false
  const detalle = error as { statusCode?: unknown; status?: unknown; name?: unknown; originalError?: unknown }
  const codigo = detalle.statusCode ?? detalle.status
  if (codigo === "404" || codigo === 404) return true
  const respuesta = detalle.originalError
  if (detalle.name !== "StorageUnknownError" || !(respuesta instanceof Response) || respuesta.status !== 400 || !respuesta.body) return false
  const lector = respuesta.body.getReader()
  let temporizador: ReturnType<typeof setTimeout> | undefined
  try {
    const limite = new Promise<never>((_, rechazar) => {
      temporizador = setTimeout(() => rechazar(new Error("lectura_storage_agotada")), 500)
    })
    const trozos: Uint8Array[] = []
    let longitud = 0
    while (true) {
      const parte = await Promise.race([lector.read(), limite])
      if (parte.done) break
      longitud += parte.value.byteLength
      if (longitud > 4096) return false
      trozos.push(parte.value)
    }
    const cuerpo: unknown = JSON.parse(Buffer.concat(trozos).toString("utf8"))
    if (!cuerpo || typeof cuerpo !== "object" || Array.isArray(cuerpo)) return false
    const ausencia = cuerpo as Record<string, unknown>
    return ausencia.statusCode === "404" && ausencia.error === "not_found" && ausencia.code === "NoSuchKey"
  } catch {
    // Nunca interpretar texto remoto, credenciales o un fallo de lectura como permiso para subir.
    return false
  } finally {
    if (temporizador) clearTimeout(temporizador)
    void lector.cancel().catch(() => undefined)
  }
}

/** Verifica bytes existentes antes de reutilizar un objeto; nunca sobrescribe, ni siquiera al recuperar. */
async function guardarObjeto(supabase: SupabaseClient, bucket: string, path: string, bytes: Buffer): Promise<void> {
  const almacen = supabase.storage.from(bucket)
  const existente = await almacen.download(path)
  if (existente.data) {
    if (existente.data.size !== bytes.length || hash(new Uint8Array(await existente.data.arrayBuffer())) !== hash(bytes)) throw new Error("objeto_no_coincide")
    return
  }
  if (!await esObjetoAusente(existente.error)) throw new Error("objeto_no_verificable")
  const { error } = await almacen.upload(path, bytes, { upsert: false, contentType: "image/webp", cacheControl: "31536000" })
  if (error) {
    // Otro publicador del mismo token puede haber ganado entre download y upload.
    const recuperado = await almacen.download(path)
    if (!recuperado.data || recuperado.data.size !== bytes.length || hash(new Uint8Array(await recuperado.data.arrayBuffer())) !== hash(bytes)) throw new Error("copia_pendiente")
  }
}

/** Limpia copias aprobadas huérfanas solo cuando ningún confirmador puede publicar un reporte eliminado. */
async function limpiarHuerfanos(supabase: SupabaseClient, id: string, token: string, paths: string[]): Promise<string[]> {
  const actual = await leerFila(supabase, id)
  if (actual.estado_publicacion === "publicada" || actual.token !== token) return []
  const { data: reporte, error } = await supabase.from("reportes").select("deleted_at").eq("id", actual.reporte_id).maybeSingle()
  if (error || (reporte && !reporte.deleted_at)) return []
  // Una confirmación pudo ganar antes del borrado lógico observado: volver a leer su estado.
  const final = await leerFila(supabase, id)
  if (final.estado_publicacion === "publicada" || final.token !== token) return []
  const borrado = await supabase.storage.from(BUCKET_PUBLICO).remove(paths)
  if (borrado.error) {
    await auditar(supabase, actual, "limpieza_publica_pendiente")
    return ["limpieza_publica_pendiente"]
  }
  return []
}

/** Publica exclusivamente APPROVED/publicando; reintentos conservan token y no consumen proveedor/cuota. */
export async function publicarImagenModerada(supabase: SupabaseClient, id: string): Promise<ResultadoImagenReporte> {
  let fila: FilaImagen | undefined
  let paths: string[] = []
  try {
    fila = await leerFila(supabase, id)
    if (fila.estado_publicacion === "publicada") return resultado(fila, await limpiarImagenModerada(supabase, id))
    if (fila.decision !== "APPROVED" || fila.estado_publicacion !== "publicando" || !fila.token) return resultado(fila)
    paths = [`${fila.id}/${fila.token}`, `${fila.id}/${fila.token}-miniatura`]
    const privado = await supabase.storage.from(BUCKET_PRIVADO).download(fila.path_privado)
    if (privado.error || !privado.data) throw new Error("original_no_disponible")
    if (privado.data.size > 102400) throw new Error("original_invalido")
    const bytes = Buffer.from(await privado.data.arrayBuffer())
    if (hash(bytes) !== fila.hash_sha256) throw new Error("original_no_coincide")
    const { miniatura } = await prepararImagenReporte(new File([new Uint8Array(bytes)], "original.webp", { type: "image/webp" }))
    await guardarObjeto(supabase, BUCKET_PUBLICO, paths[0], bytes)
    await guardarObjeto(supabase, BUCKET_PUBLICO, paths[1], miniatura)
    const { data, error } = await supabase.rpc("confirmar_publicacion_moderacion", {
      p_id: id, p_token: fila.token,
      p_url: supabase.storage.from(BUCKET_PUBLICO).getPublicUrl(paths[0]).data.publicUrl,
      p_thumbnail_url: supabase.storage.from(BUCKET_PUBLICO).getPublicUrl(paths[1]).data.publicUrl,
    })
    const actual = await leerFila(supabase, id)
    // Un confirmador concurrente puede ganar incluso si nuestra RPC falla o devuelve false.
    if (actual.estado_publicacion === "publicada") return resultado(actual, await limpiarImagenModerada(supabase, id))
    if (error || data !== true) throw new Error("confirmacion_pendiente")
    throw new Error("confirmacion_no_verificable")
  } catch {
    const advertencias = ["publicacion_pendiente"]
    if (fila?.token && paths.length) {
      try { advertencias.push(...await limpiarHuerfanos(supabase, id, fila.token, paths)) }
      catch { advertencias.push("limpieza_publica_pendiente") }
    }
    return resultado(fila, advertencias)
  }
}

/** Autoriza propietario DB, deduplica evidencia canónica y clasifica una sola vez tras reservar cuota. */
export async function moderarYGuardarImagenReporte(supabase: SupabaseClient, entrada: EntradaImagenReporte): Promise<ResultadoImagenReporte> {
  let fila: FilaImagen | undefined
  let privadoGuardado = false
  try {
    const { data: reporte, error: errorReporte } = await supabase.from("reportes").select("usuario_id,deleted_at").eq("id", entrada.reporteId).single()
    if (errorReporte || !reporte || reporte.usuario_id !== entrada.propietarioId || reporte.deleted_at) return resultado()
    const imagen = await prepararImagenReporte(entrada.image)
    const identidad = hash(imagen.original)
    const id = randomUUID()
    const path = `${entrada.propietarioId}/${id}`
    const insercion = await supabase.from("moderacion_imagenes").insert({
      id, reporte_id: entrada.reporteId, propietario_id: entrada.propietarioId,
      hash_sha256: identidad, path_privado: path, decision: "REVIEW", motivos: [],
    }).select("*").single()
    if (insercion.error?.code === "23505") {
      const existente = await supabase.from("moderacion_imagenes").select("*").eq("reporte_id", entrada.reporteId).eq("hash_sha256", identidad).single()
      if (existente.error || !existente.data) return resultado()
      return resultado(existente.data as FilaImagen)
    }
    if (insercion.error || !insercion.data) return resultado()
    fila = insercion.data as FilaImagen
    const carga = await supabase.storage.from(BUCKET_PRIVADO).upload(path, imagen.original, { upsert: false, contentType: "image/webp" })
    if (carga.error) {
      await auditar(supabase, fila, "carga_privada_pendiente")
      return resultado(null, ["carga_privada_pendiente"])
    }
    privadoGuardado = true
    const reclamo = await supabase.rpc("reclamar_imagen_moderacion", { p_id: id, p_propietario: entrada.propietarioId })
    if (reclamo.error || !reclamo.data) return resultado(fila, ["revision_pendiente"])
    const reserva = await supabase.rpc("reservar_operaciones_moderacion", { p_solicitud: id, p_operaciones: 2 })
    let clasificacion: ResultadoModeracion = { decision: "REVIEW", motivos: ["cuota_no_disponible"], operaciones: 0, proveedor: "ninguno" }
    if (!reserva.error && reserva.data === true) {
      try { clasificacion = await moderarImagen(new Blob([new Uint8Array(imagen.original)], { type: "image/webp" })) }
      catch { clasificacion = { decision: "REVIEW", motivos: ["operaciones_desconocidas"], operaciones: 0, proveedor: "ninguno" } }
      if (clasificacion.operaciones !== 2 || clasificacion.motivos.includes("operaciones_desconocidas")) {
        clasificacion = { ...clasificacion, decision: "REVIEW" }
      }
      if (clasificacion.operaciones > 2) {
        const reducido = await supabase.rpc("reducir_presupuesto_moderacion", { p_diario: 0, p_mensual: 0 })
        clasificacion = { ...clasificacion, decision: "REVIEW", motivos: [...clasificacion.motivos, "operaciones_inesperadas"] }
        if (reducido.error) await auditar(supabase, fila, "presupuesto_requiere_revision")
      }
      if (!clasificacion.motivos.includes("operaciones_desconocidas")) {
        const registro = await supabase.rpc("registrar_operaciones_moderacion", { p_solicitud: id, p_operaciones: clasificacion.operaciones })
        const contador = await supabase.from("moderacion_imagenes").update({ operaciones: clasificacion.operaciones }).eq("id", id)
        if (registro.error || registro.data !== true || contador.error) clasificacion = { ...clasificacion, decision: "REVIEW", motivos: [...clasificacion.motivos, "registro_consumo_pendiente"] }
      }
    }
    const decision = await supabase.rpc("decidir_imagen_moderacion", {
      p_id: id, p_token: reclamo.data, p_decision: clasificacion.decision, p_motivos: clasificacion.motivos,
    })
    if (decision.error || decision.data !== true) return resultado(fila, ["decision_pendiente"])
    // El CAS exitoso ya retiró el reporte. Una lectura posterior fallida no debe ocultarlo.
    if (clasificacion.decision === "REJECTED") {
      fila = { ...fila, decision: "REJECTED", estado_publicacion: "rechazada" }
      await enviarAvisoRetiro(supabase, fila.reporte_id)
      return resultado(fila, await limpiarImagenModerada(supabase, id))
    }
    fila = await leerFila(supabase, id)
    if (fila.decision === "APPROVED") return publicarImagenModerada(supabase, id)
    return resultado(fila, await limpiarImagenModerada(supabase, id))
  } catch {
    // El reporte ya existe: no exponer excepciones ni provocar reenvío de su texto.
    if (fila && !privadoGuardado) {
      try { await auditar(supabase, fila, "carga_privada_pendiente") }
      catch { return resultado(null, ["carga_privada_pendiente", "auditoria_pendiente"]) }
      return resultado(null, ["carga_privada_pendiente"])
    }
    return resultado(fila, ["revision_pendiente"])
  }
}
