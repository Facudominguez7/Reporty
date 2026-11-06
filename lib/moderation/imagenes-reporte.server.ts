/** Frontera confiable de moderación: cola privada, cuota y publicación CAS recuperable. */
import "server-only"
import { createHash, randomUUID } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import { prepararImagenReporte } from "@/lib/media/preparar-imagen-reporte.server"
import { sendAdminReviewNotificationEmail } from "@/lib/notifications/report-notifications"
import { moderarImagen } from "./sightengine.server"
import type { ResultadoModeracion } from "./tipos"
import { enviarAvisoRetiro } from "./avisos-retiro.server"
import { getReportImageStorageRefs, isMissingReportImageColumnsError, type ReportImageRow } from "@/lib/media/report-images"

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
  /** Operaciones reservadas y registradas de la clasificación; 0 = todavía sin clasificar. */
  operaciones?: number
  reemplaza_foto_id?: number | null
  /** Destino de la fila; «reporte» es el comportamiento histórico y el valor por omisión. */
  destino?: "reporte" | "evidencia_reparacion"
  evidencia_id?: string | null
}
export type ResultadoImagenReporte = {
  estado: Decision | "ERROR_PRIVADO"
  publicada: boolean
  motivos: string[]
  advertencias: string[]
}
export type EntradaImagenReporte = { reporteId: number; propietarioId: string; image: File; reemplazaFotoId?: number }

/** Entrada de la evidencia: la RPC del SQL crea la evidencia y su fila de moderación. */
export type EntradaImagenEvidenciaReparacion = {
  reporteId: number
  autorId: string
  comentario: string
  image: File
}

/** Resultado de moderar la foto de una evidencia; el código de la RPC nunca se muestra crudo. */
export type ResultadoImagenEvidenciaReparacion = ResultadoImagenReporte & {
  evidenciaId: string | null
  codigoRpc?: string
  mensajeRpc?: string
  /**
   * `true` cuando el reintento trae otro comentario que el ya guardado con la misma
   * foto: no se reanuda ni se publica, para no cambiar el texto de la evidencia.
   */
  comentarioDistinto?: true
}

/** Calcula identidad exacta del contenido sin nombres suministrados por el cliente. */
function hash(bytes: Uint8Array) { return createHash("sha256").update(bytes).digest("hex") }

/** Email is best-effort: provider failures must not change the report/photo workflow. */
async function notificarRevisionAdmin(supabase: SupabaseClient, fila: FilaImagen) {
  if (fila.decision !== "REVIEW" || fila.estado_publicacion !== "pendiente") return
  try {
    await sendAdminReviewNotificationEmail({
      supabase,
      tipo: "foto",
      reviewId: fila.id,
      reporteId: fila.reporte_id,
      reporteTitulo: `Reporte N.º ${fila.reporte_id}`,
    })
  } catch (error) {
    console.error("Error al notificar revisión administrativa de fotografía:", error)
  }
}

/** Devuelve únicamente texto seguro; nunca identificadores o motivos internos del proveedor. */
function resultado(fila?: FilaImagen | null, advertencias: string[] = []): ResultadoImagenReporte {
  const cargaFallida = fila?.decision === "REVIEW" && fila.motivos?.includes("carga_privada_pendiente")
  const estado = cargaFallida ? "ERROR_PRIVADO" : fila?.decision ?? "ERROR_PRIVADO"
  const esEvidencia = fila?.destino === "evidencia_reparacion"
  return {
    estado,
    publicada: fila?.estado_publicacion === "publicada",
    motivos: estado === "REJECTED" ? [esEvidencia
      ? "La fotografía de la reparación fue rechazada: la evidencia no se publica y el reporte sigue pendiente."
      : fila?.reemplaza_foto_id
        ? "La foto nueva fue rechazada; el reporte y la foto anterior se conservan."
        : "Tu reporte fue retirado porque la fotografía adjunta incumple nuestras normas de contenido. Evitá volver a publicar este tipo de material"]
      : estado === "REVIEW" ? [esEvidencia
        ? "La fotografía de la reparación quedó privada y pendiente de revisión."
        : fila?.reemplaza_foto_id
          ? "El reemplazo quedó pendiente de revisión; la foto actual sigue visible."
          : "La fotografía quedó privada y pendiente de revisión. No necesitás reenviar el reporte."]
        : estado === "ERROR_PRIVADO" ? ["No pudimos guardar la fotografía."] : [],
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

async function completarPublicacion(supabase: SupabaseClient, fila: FilaImagen) {
  const advertencias = await limpiarImagenModerada(supabase, fila.id)
  if (fila.reemplaza_foto_id) {
    const retirada = await eliminarFotoReportePublicada(supabase, fila.reporte_id, fila.reemplaza_foto_id)
    if (!retirada.success || retirada.cleanupPending) advertencias.push("limpieza_reemplazo_pendiente")
  }
  return advertencias
}

/** Publica exclusivamente APPROVED/publicando; reintentos conservan token y no consumen proveedor/cuota. */
export async function publicarImagenModerada(supabase: SupabaseClient, id: string): Promise<ResultadoImagenReporte> {
  let fila: FilaImagen | undefined
  let paths: string[] = []
  try {
    fila = await leerFila(supabase, id)
    if (fila.estado_publicacion === "publicada") return resultado(fila, await completarPublicacion(supabase, fila))
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
    if (actual.estado_publicacion === "publicada") return resultado(actual, await completarPublicacion(supabase, actual))
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

/** Removes only the selected report-photo row and its referenced public originals/thumbnails. */
export async function eliminarFotoReportePublicada(supabase: SupabaseClient, reporteId: number, fotoId: number) {
  let { data, error } = await supabase.from("fotos_reporte")
    .select("id,reporte_id,url,bucket,path,thumbnail_url,thumbnail_bucket,thumbnail_path")
    .eq("id", fotoId).eq("reporte_id", reporteId).maybeSingle()

  if (error && isMissingReportImageColumnsError(error)) {
    ;({ data, error } = await supabase.from("fotos_reporte")
      .select("id,reporte_id,url,bucket,path").eq("id", fotoId).eq("reporte_id", reporteId).maybeSingle())
  }
  if (error && isMissingReportImageColumnsError(error)) {
    ;({ data, error } = await supabase.from("fotos_reporte")
      .select("id,reporte_id,url").eq("id", fotoId).eq("reporte_id", reporteId).maybeSingle())
  }
  if (error || !data) return { success: false, cleanupPending: false }

  const byBucket = getReportImageStorageRefs([data as ReportImageRow]).reduce<Record<string, string[]>>((paths, ref) => {
    paths[ref.bucket] = [...(paths[ref.bucket] ?? []), ref.path]
    return paths
  }, {})
  let cleanupPending = false
  for (const [bucket, paths] of Object.entries(byBucket)) {
    const { error: storageError } = await supabase.storage.from(bucket).remove(paths)
    if (storageError) {
      cleanupPending = true
      console.error("No pudimos limpiar Storage al quitar una foto del reporte:", { reporteId, bucket, pathCount: paths.length, message: storageError.message })
    }
  }
  if (cleanupPending) return { success: false, cleanupPending: true }

  const { data: deleted, error: deleteError } = await supabase.from("fotos_reporte").delete()
    .eq("id", fotoId).eq("reporte_id", reporteId).select("id").maybeSingle()
  if (deleteError || !deleted) return { success: false, cleanupPending: false }
  return { success: true, cleanupPending: false }
}

/**
 * Reclama, clasifica, registra consumo y decide una fila ya persistida en la cola
 * privada. Es el tramo compartido por las fotos de un reporte y por la evidencia de
 * una reparación: mismo proveedor, misma cuota y misma publicación CAS.
 *
 * @param supabase - Cliente de servicio; el llamador ya autorizó a la persona.
 * @param filaInicial - Fila durable de `moderacion_imagenes` con sus bytes privados ya subidos.
 * @param original - Bytes canónicos ya validados y recodificados a WebP.
 * @returns Resultado seguro para la interfaz, sin identificadores del proveedor.
 */
async function clasificarYResolver(
  supabase: SupabaseClient,
  filaInicial: FilaImagen,
  original: Buffer,
): Promise<ResultadoImagenReporte> {
  let fila = filaInicial
  const id = fila.id
  const reclamo = await supabase.rpc("reclamar_imagen_moderacion", { p_id: id, p_propietario: fila.propietario_id })
  if (reclamo.error || !reclamo.data) {
    await notificarRevisionAdmin(supabase, fila)
    return resultado(fila, ["revision_pendiente"])
  }
  const reserva = await supabase.rpc("reservar_operaciones_moderacion", { p_solicitud: id, p_operaciones: 2 })
  let clasificacion: ResultadoModeracion = { decision: "REVIEW", motivos: ["cuota_no_disponible"], operaciones: 0, proveedor: "ninguno" }
  if (!reserva.error && reserva.data === true) {
    try { clasificacion = await moderarImagen(new Blob([new Uint8Array(original)], { type: "image/webp" })) }
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
  if (decision.error || decision.data !== true) {
    await notificarRevisionAdmin(supabase, fila)
    return resultado(fila, ["decision_pendiente"])
  }
  // El CAS exitoso ya retiró el reporte. Una lectura posterior fallida no debe ocultarlo.
  if (clasificacion.decision === "REJECTED") {
    fila = { ...fila, decision: "REJECTED", estado_publicacion: "rechazada" }
    // Rechazar la foto de una evidencia invalida solo la evidencia: el reporte nunca
    // se retira por su foto de reparación (S2, S9).
    if (!fila.reemplaza_foto_id && fila.destino !== "evidencia_reparacion") await enviarAvisoRetiro(supabase, fila.reporte_id)
    return resultado(fila, await limpiarImagenModerada(supabase, id))
  }
  fila = await leerFila(supabase, id)
  if (fila.decision === "APPROVED") return publicarImagenModerada(supabase, id)
  await notificarRevisionAdmin(supabase, fila)
  return resultado(fila, await limpiarImagenModerada(supabase, id))
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
      ...(entrada.reemplazaFotoId ? { reemplaza_foto_id: entrada.reemplazaFotoId } : {}),
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
      await notificarRevisionAdmin(supabase, fila)
      return resultado(null, ["carga_privada_pendiente"])
    }
    privadoGuardado = true
    return await clasificarYResolver(supabase, fila, imagen.original)
  } catch {
    // El reporte ya existe: no exponer excepciones ni provocar reenvío de su texto.
    if (fila && !privadoGuardado) {
      try { await auditar(supabase, fila, "carga_privada_pendiente") }
      catch { return resultado(null, ["carga_privada_pendiente", "auditoria_pendiente"]) }
      return resultado(null, ["carga_privada_pendiente"])
    }
    if (fila) await notificarRevisionAdmin(supabase, fila)
    return resultado(fila, ["revision_pendiente"])
  }
}

/**
 * Registra el fallo de la carga privada sin declarar éxito. La evidencia queda
 * «informada», marcada en la cola, y la persona puede reintentar la misma foto para
 * reanudarla (S7, S12).
 *
 * @param supabase - Cliente de servicio; el llamador ya autorizó a la persona.
 * @param fila - Fila durable de la cola privada de la evidencia.
 * @param evidenciaId - Evidencia creada antes de subir los bytes, si existe.
 * @returns Resultado con estado `ERROR_PRIVADO`; nunca una publicación exitosa.
 */
async function registrarCargaPrivadaFallida(
  supabase: SupabaseClient,
  fila: FilaImagen,
  evidenciaId: string | null,
): Promise<ResultadoImagenEvidenciaReparacion> {
  try {
    await auditar(supabase, fila, "carga_privada_pendiente")
    await notificarRevisionAdmin(supabase, fila)
    return { ...resultado(null, ["carga_privada_pendiente"]), evidenciaId }
  } catch {
    return { ...resultado(null, ["carga_privada_pendiente", "auditoria_pendiente"]), evidenciaId }
  }
}

/** Evidencia activa y fila de cola que todavía pueden recibir los bytes privados. */
type EvidenciaReanudable = { evidenciaId: string; fila: FilaImagen }

/**
 * Desenlace de buscar la evidencia que el reintento podría reanudar. `comentario_distinto`
 * separa el caso en que la misma foto se reenvía con otro texto: la evidencia guardada
 * conserva su comentario y el reintento se rechaza en vez de publicar el texto viejo.
 */
type ReanudacionEvidencia =
  | { estado: "reanudable"; evidencia: EvidenciaReanudable }
  | { estado: "comentario_distinto" }
  | { estado: "no_reanudable" }

/**
 * Marcadores que solo registran un fallo operativo de la carga o de su auditoría;
 * nunca los escribe el clasificador ni una decisión humana.
 */
const MARCADORES_FALLO_CARGA = new Set(["carga_privada_pendiente", "auditoria_pendiente"])

/**
 * Indica si la fila quedó sin clasificar: sin motivos del proveedor, sin decisión
 * humana y sin consumo registrado. Es la prueba local de que solo faltan los bytes.
 *
 * @param fila - Fila durable de la cola privada.
 * @returns `true` cuando la fila todavía espera su primera clasificación.
 */
function sinClasificar(fila: FilaImagen): boolean {
  return Number(fila.operaciones ?? 0) === 0
    && (fila.motivos ?? []).every((motivo) => MARCADORES_FALLO_CARGA.has(motivo))
}

/**
 * Normaliza el comentario igual que la creación: recorta los espacios de los extremos,
 * que es lo que la RPC guarda con `btrim`. El texto interior nunca se reescribe.
 *
 * @param comentario - Comentario recibido o ya persistido; puede faltar.
 * @returns El comentario comparable entre la carga original y su reintento.
 */
function comentarioNormalizado(comentario: string | null | undefined): string {
  return (comentario ?? "").trim()
}

/**
 * Busca la evidencia que quedó sin bytes privados para reanudar su carga en vez de
 * crear otra: misma cuenta, mismo comentario, misma fotografía y una fila todavía sin
 * clasificar. Nunca reabre evidencia ajena, publicada ni resuelta (S7, S12).
 *
 * La marca `carga_privada_pendiente` es el camino normal, pero no puede ser la única
 * llave: si dos lecturas consecutivas de la cola fallan, la marca no llega a
 * escribirse y el reintento idéntico quedaría en un callejón sin salida. Por eso una
 * fila que todavía no registra clasificación también se reanuda; los bytes nunca se
 * sobrescriben (son los mismos o el objeto no existe) y la cuenta debe coincidir.
 *
 * Reanudar publica la evidencia ya guardada, así que el comentario debe coincidir: si
 * el reintento trae otro texto se responde `comentario_distinto` y no se toca nada, en
 * vez de publicar el comentario anterior como si fuera el nuevo (S1, S9). El texto se
 * compara después de la identidad de la foto y de la cola, para que una imagen distinta
 * del mismo autor solo reciba el rechazo genérico.
 *
 * @param supabase - Cliente de servicio; el llamador ya autorizó a la persona.
 * @param entrada - Reporte, autor, comentario y archivo reintentados por la persona.
 * @param identidad - Hash canónico de los bytes preparados de esta carga.
 * @returns La evidencia reanudable, el comentario distinto o el rechazo a conservar.
 */
async function evidenciaReanudable(
  supabase: SupabaseClient,
  entrada: EntradaImagenEvidenciaReparacion,
  identidad: string,
): Promise<ReanudacionEvidencia> {
  const { data: evidencia, error: errorEvidencia } = await supabase
    .from("evidencias_reparacion")
    .select("id,autor_id,estado,comentario")
    .eq("reporte_id", entrada.reporteId)
    .eq("estado", "informada")
    .maybeSingle()
  const activa = evidencia as { id?: string; autor_id?: string; estado?: string; comentario?: string } | null
  if (errorEvidencia || !activa?.id || activa.estado !== "informada" || activa.autor_id !== entrada.autorId) {
    return { estado: "no_reanudable" }
  }
  const { data: fila, error } = await supabase
    .from("moderacion_imagenes").select("*").eq("evidencia_id", activa.id).maybeSingle()
  const pendiente = fila as FilaImagen | null
  if (error || !pendiente) return { estado: "no_reanudable" }
  // La identidad de la foto se comprueba antes que el texto: un reintento con otra
  // imagen nunca recibe una respuesta que revele el comentario guardado.
  const reanudable = pendiente.destino === "evidencia_reparacion"
    && pendiente.evidencia_id === activa.id
    && pendiente.reporte_id === entrada.reporteId
    && pendiente.propietario_id === entrada.autorId
    && pendiente.decision === "REVIEW"
    && pendiente.estado_publicacion === "pendiente"
    && pendiente.hash_sha256 === identidad
    && pendiente.path_privado === `${entrada.autorId}/${pendiente.id}`
    && sinClasificar(pendiente)
  if (!reanudable) return { estado: "no_reanudable" }
  if (comentarioNormalizado(activa.comentario) !== comentarioNormalizado(entrada.comentario)) {
    return { estado: "comentario_distinto" }
  }
  return { estado: "reanudable", evidencia: { evidenciaId: activa.id, fila: pendiente } }
}

/**
 * Reintenta la carga privada sin sobrescribir: solo acepta los mismos bytes canónicos
 * o un objeto ausente, así un reintento nunca sustituye la evidencia de otra carga.
 *
 * @param supabase - Cliente de servicio; el llamador ya autorizó a la persona.
 * @param fila - Fila de cola con su ruta privada canónica.
 * @param original - Bytes ya preparados y validados de esta carga.
 * @returns `true` cuando el objeto privado quedó confirmado.
 */
async function reanudarCargaPrivada(supabase: SupabaseClient, fila: FilaImagen, original: Buffer) {
  try {
    await guardarObjeto(supabase, BUCKET_PRIVADO, fila.path_privado, original)
    return true
  } catch {
    return false
  }
}

/**
 * Registra la evidencia de reparación y modera su fotografía con el pipeline existente.
 *
 * La RPC `crear_evidencia_reparacion` crea la evidencia «informada» y su fila en la
 * cola privada —elegibilidad, evidencia activa única, cupo diario y deduplicación por
 * hash— antes de que este módulo suba los bytes. La aprobación publica la foto y deja
 * la evidencia «en verificación»; el rechazo invalida solo la evidencia y nunca cambia
 * el estado del reporte (S1, S2, S12). Si la carga privada no se confirma, el resultado
 * es `ERROR_PRIVADO` y repetir la misma foto y el mismo comentario reanuda esa evidencia
 * sin duplicarla; el mismo reintento con otro comentario se rechaza con
 * `comentarioDistinto` sin publicar ni mutar la evidencia guardada.
 *
 * @param supabase - Cliente de servicio; el llamador ya autorizó a la persona.
 * @param entrada - Reporte, autor, comentario y archivo elegidos en el formulario.
 * @returns Resultado de moderación más el identificador de la evidencia creada.
 */
export async function moderarYGuardarImagenEvidenciaReparacion(
  supabase: SupabaseClient,
  entrada: EntradaImagenEvidenciaReparacion,
): Promise<ResultadoImagenEvidenciaReparacion> {
  let fila: FilaImagen | undefined
  let moderacionId: string | null = null
  let evidenciaId: string | null = null
  let privadoGuardado = false
  try {
    const imagen = await prepararImagenReporte(entrada.image)
    const identidad = hash(imagen.original)
    const creacion = await supabase.rpc("crear_evidencia_reparacion", {
      p_reporte_id: entrada.reporteId,
      p_autor_id: entrada.autorId,
      p_comentario: entrada.comentario,
      p_hash_sha256: identidad,
    })
    const datos = creacion.data as { evidencia_id?: string; moderacion_id?: string; path_privado?: string } | null
    if (creacion.error || !datos?.evidencia_id || !datos.moderacion_id || !datos.path_privado) {
      // Solo el rechazo por evidencia activa puede reanudarse: reintentar la misma foto
      // tras un fallo de Storage no debe crear una segunda evidencia ni perder el
      // comentario ya guardado (S1, S7).
      const reanudacion: ReanudacionEvidencia = creacion.error?.code === "PRE03"
        ? await evidenciaReanudable(supabase, entrada, identidad)
        : { estado: "no_reanudable" }
      if (reanudacion.estado === "comentario_distinto") {
        // Publicar acá dejaría el comentario viejo visible como si fuera el nuevo.
        return { ...resultado(null), evidenciaId: null, comentarioDistinto: true }
      }
      if (reanudacion.estado === "no_reanudable") {
        // El código permite traducir el rechazo; el texto de la base nunca se muestra.
        return {
          ...resultado(null),
          evidenciaId: null,
          ...(creacion.error?.code ? { codigoRpc: String(creacion.error.code) } : {}),
          ...(creacion.error?.message ? { mensajeRpc: creacion.error.message } : {}),
        }
      }
      evidenciaId = reanudacion.evidencia.evidenciaId
      fila = reanudacion.evidencia.fila
      if (!await reanudarCargaPrivada(supabase, fila, imagen.original)) {
        return registrarCargaPrivadaFallida(supabase, fila, evidenciaId)
      }
      privadoGuardado = true
      return { ...await clasificarYResolver(supabase, fila, imagen.original), evidenciaId }
    }
    evidenciaId = String(datos.evidencia_id)
    moderacionId = String(datos.moderacion_id)
    fila = await leerFila(supabase, moderacionId)
    const carga = await supabase.storage.from(BUCKET_PRIVADO).upload(String(datos.path_privado), imagen.original, {
      upsert: false, contentType: "image/webp",
    })
    if (carga.error) return registrarCargaPrivadaFallida(supabase, fila, evidenciaId)
    privadoGuardado = true
    return { ...await clasificarYResolver(supabase, fila, imagen.original), evidenciaId }
  } catch {
    // La evidencia ya existe: nunca reenviar el comentario ni exponer excepciones.
    if (!fila && moderacionId) {
      // La fila quedó creada por la RPC: releerla deja el marcador que habilita el reintento.
      try { fila = await leerFila(supabase, moderacionId) } catch { fila = undefined }
    }
    if (fila && !privadoGuardado) return registrarCargaPrivadaFallida(supabase, fila, evidenciaId)
    if (fila) await notificarRevisionAdmin(supabase, fila)
    // Sin metadatos no se puede escribir la marca, pero la evidencia ya existe sin
    // bytes privados confirmados: se informa el fallo y el reintento idéntico de la
    // misma cuenta reanuda esa evidencia sin duplicarla (S7, S12).
    if (!fila && evidenciaId) return { ...resultado(null, ["carga_privada_pendiente"]), evidenciaId }
    return { ...resultado(fila, ["revision_pendiente"]), evidenciaId }
  }
}
