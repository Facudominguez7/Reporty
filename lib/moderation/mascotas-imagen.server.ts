import "server-only"
import { createHash, randomUUID } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import { prepararImagenReporte } from "@/lib/media/preparar-imagen-reporte.server"
import { moderarImagen } from "./sightengine.server"
import type { ResultadoModeracion } from "./tipos"
import type { MascotaSubmission } from "@/lib/security/mascota-submission-guard.server"
import { esObjetoAusente } from "./imagenes-reporte.server"

const PRIVATE_BUCKET = "reportes-pendientes"
const PUBLIC_BUCKET = "reportes"
type Evidence = {
  id: string; propietario_id: string; path_privado: string; path_publico: string | null
  hash_sha256: string; decision: "REVIEW" | "APPROVED" | "REJECTED"; motivos: string[]
  operaciones: number; estado: "pendiente" | "aprobada" | "rechazada"; aprobado_at: string | null
  estado_publicacion: "pendiente" | "publicando" | "publicada" | "rechazada"; publish_token: string | null; mascota_id: number | null
}

const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex")
const resultadoSeguro = (decision: Evidence["decision"]) => decision === "REVIEW"
  ? "La foto quedó privada y pendiente de revisión administrativa. No la vuelvas a enviar."
  : decision === "REJECTED" ? "La foto no cumple las normas de contenido y no se publicó." : ""

/** Store private evidence first; only APPROVED provider decisions can be published automatically. */
export async function crearFotoMascotaModerada(
  supabase: SupabaseClient,
  input: MascotaSubmission & { propietarioId: string; image: File },
): Promise<{ mascotaId: number | null; decision: Evidence["decision"]; pointsAwarded: number; mensaje: string }> {
  const image = await prepararImagenReporte(input.image)
  const id = randomUUID()
  const privatePath = `${input.propietarioId}/${id}`
  const digest = hash(image.original)
  const { data, error } = await supabase.from("mascotas_fotos_moderacion").insert({
    id, propietario_id: input.propietarioId, path_privado: privatePath, path_publico: null,
    hash_sha256: digest, decision: "REVIEW", motivos: [], operaciones: 0,
    tipo_animal: input.tipoAnimal, descripcion: input.descripcion, lat: input.lat, lon: input.lon, telefono: input.telefono,
    estado: "pendiente", aprobado_at: null, estado_publicacion: "pendiente",
  }).select("*").single()
  if (error?.code === "23505") {
    const existing = await supabase.from("mascotas_fotos_moderacion").select("*").eq("propietario_id", input.propietarioId).eq("hash_sha256", digest).maybeSingle()
    if (existing.data) {
      const evidence = existing.data as Evidence
      if (evidence.decision === "APPROVED") {
        const retry = await publicarMascotaAprobada(supabase, evidence, input)
        return { ...retry, decision: "APPROVED", mensaje: retry.mascotaId ? "Mascota publicada." : "La foto fue aprobada, pero la publicación quedó pendiente. No la vuelvas a enviar; necesita revisión administrativa." }
      }
      return { mascotaId: evidence.mascota_id, decision: evidence.decision, pointsAwarded: 0, mensaje: resultadoSeguro(evidence.decision) }
    }
  }
  if (error || !data) throw new Error("No pudimos iniciar la revisión privada de la fotografía.")
  let evidence = data as Evidence

  const upload = await supabase.storage.from(PRIVATE_BUCKET).upload(privatePath, image.original, {
    upsert: false, contentType: "image/webp", cacheControl: "0",
  })
  if (upload.error) {
    await supabase.from("mascotas_fotos_moderacion").update({ motivos: ["carga_privada_pendiente"] }).eq("id", id)
    return { mascotaId: null, decision: "REVIEW", pointsAwarded: 0, mensaje: "No pudimos guardar la foto para revisión. La publicación no está disponible y necesita revisión administrativa." }
  }

  const reservation = await supabase.rpc("reservar_operaciones_moderacion", { p_solicitud: id, p_operaciones: 2 })
  let classification: ResultadoModeracion = {
    decision: "REVIEW", motivos: ["cuota_no_disponible"], operaciones: 0, proveedor: "ninguno",
  }
  if (!reservation.error && reservation.data === true) {
    try { classification = await moderarImagen(new Blob([new Uint8Array(image.original)], { type: "image/webp" })) }
    catch { classification = { decision: "REVIEW", motivos: ["operaciones_desconocidas"], operaciones: 0, proveedor: "ninguno" } }
    if (classification.operaciones !== 2 || classification.motivos.includes("operaciones_desconocidas")) classification.decision = "REVIEW"
    if (classification.operaciones > 2) {
      const reduced = await supabase.rpc("reducir_presupuesto_moderacion", { p_diario: 0, p_mensual: 0 })
      classification = { ...classification, decision: "REVIEW", motivos: [...classification.motivos, "operaciones_inesperadas"] }
      if (reduced.error) classification.motivos.push("presupuesto_requiere_revision")
    }
    if (!classification.motivos.includes("operaciones_desconocidas")) {
      const recorded = await supabase.rpc("registrar_operaciones_moderacion", { p_solicitud: id, p_operaciones: classification.operaciones })
      if (recorded.error || recorded.data !== true) {
        classification = { ...classification, decision: "REVIEW", motivos: [...classification.motivos, "registro_consumo_pendiente"] }
      }
    }
    await supabase.from("mascotas_fotos_moderacion").update({ operaciones: classification.operaciones }).eq("id", id)
  }

  const rejected = classification.decision === "REJECTED"
  const update = await supabase.from("mascotas_fotos_moderacion").update({
    decision: classification.decision,
    motivos: classification.motivos,
    ...(rejected ? { estado: "rechazada", estado_publicacion: "rechazada" } : {}),
  }).eq("id", id).eq("estado", "pendiente").eq("decision", "REVIEW").select("*").single()
  if (update.data) evidence = update.data as Evidence
  if (update.error || !update.data || classification.decision !== "APPROVED") {
    return { mascotaId: null, decision: evidence.decision, pointsAwarded: 0, mensaje: resultadoSeguro(evidence.decision) }
  }

  const published = await publicarMascotaAprobada(supabase, evidence, input)
  return { ...published, decision: "APPROVED", mensaje: published.mascotaId ? "Mascota publicada." : "La foto fue aprobada, pero la publicación quedó pendiente. No la vuelvas a enviar; necesita revisión administrativa." }
}

async function readPrivateBytes(supabase: SupabaseClient, evidence: Evidence) {
  const { data, error } = await supabase.storage.from(PRIVATE_BUCKET).download(evidence.path_privado)
  if (error || !data || data.size > 102400 || data.size < 12) throw new Error("evidencia_no_disponible")
  const bytes = new Uint8Array(await data.arrayBuffer())
  const buffer = Buffer.from(bytes)
  if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WEBP" || hash(bytes) !== evidence.hash_sha256) throw new Error("evidencia_invalida")
  return bytes
}

async function savePublicObject(supabase: SupabaseClient, path: string, bytes: Uint8Array) {
  const bucket = supabase.storage.from(PUBLIC_BUCKET)
  const existing = await bucket.download(path)
  if (existing.data) {
    if (existing.data.size !== bytes.length || hash(new Uint8Array(await existing.data.arrayBuffer())) !== hash(bytes)) throw new Error("public_object_mismatch")
    return
  }
  if (!await esObjetoAusente(existing.error)) throw new Error("public_object_unverifiable")
  const { error } = await bucket.upload(path, bytes, { upsert: false, contentType: "image/webp", cacheControl: "0" })
  if (error) {
    const retry = await bucket.download(path)
    if (!retry.data || retry.data.size !== bytes.length || hash(new Uint8Array(await retry.data.arrayBuffer())) !== hash(bytes)) throw new Error("public_upload_pending")
  }
}

/** Claims before upload, then CAS-finalizes; an already withdrawn pet is never republished. */
export async function publicarMascotaAprobada(
  supabase: SupabaseClient,
  evidenceInput: Evidence,
  fields?: MascotaSubmission,
): Promise<{ mascotaId: number | null; pointsAwarded: number }> {
  const { data: latest, error: latestError } = await supabase.from("mascotas_fotos_moderacion")
    .select("*").eq("id", evidenceInput.id).single()
  if (latestError || !latest) return { mascotaId: null, pointsAwarded: 0 }
  const evidence = latest as Evidence
  if (evidence.decision !== "APPROVED") throw new Error("La evidencia todavía no está aprobada.")

  const { data: existingPet, error: petError } = await supabase.from("mascotas_perdidas")
    .select("id,retirada_at").eq("foto_moderacion_id", evidence.id).maybeSingle()
  if (petError) return { mascotaId: null, pointsAwarded: 0 }
  if (existingPet) {
    return existingPet.retirada_at
      ? { mascotaId: null, pointsAwarded: 0 }
      : { mascotaId: Number(existingPet.id), pointsAwarded: 0 }
  }

  const path = `mascotas/${evidence.id}.webp`
  let token: string | null = null
  let uploadNeeded = false
  if (evidence.estado_publicacion === "pendiente") {
    const claim = await supabase.rpc("reclamar_publicacion_mascota", { p_foto_moderacion_id: evidence.id })
    if (claim.error || typeof claim.data !== "string") return { mascotaId: null, pointsAwarded: 0 }
    token = claim.data
    uploadNeeded = true
  } else if (evidence.estado_publicacion === "publicando") {
    token = evidence.publish_token
    if (!token) return { mascotaId: null, pointsAwarded: 0 }
  } else if (evidence.estado_publicacion !== "publicada" || evidence.path_publico !== path) {
    return { mascotaId: null, pointsAwarded: 0 }
  }

  const bytes = await readPrivateBytes(supabase, evidence)
  const publicObject = await supabase.storage.from(PUBLIC_BUCKET).download(path)
  const existsAndMatches = Boolean(publicObject.data && publicObject.data.size === bytes.length &&
    hash(new Uint8Array(await publicObject.data.arrayBuffer())) === hash(bytes))
  if (publicObject.data && !existsAndMatches) return { mascotaId: null, pointsAwarded: 0 }
  if (uploadNeeded && !publicObject.data) {
    try { await savePublicObject(supabase, path, bytes) }
    catch {
      // An upload with an uncertain outcome may still complete; retain its claim.
      return { mascotaId: null, pointsAwarded: 0 }
    }
  } else if (!existsAndMatches) {
    // A publish request may still be completing; never start another upload from a publishing claim.
    return { mascotaId: null, pointsAwarded: 0 }
  }

  if (evidence.estado_publicacion !== "publicada") {
    const stored = await supabase.from("mascotas_fotos_moderacion").update({
      path_publico: path, estado: "aprobada", aprobado_at: evidence.aprobado_at ?? new Date().toISOString(),
      estado_publicacion: "publicada", publish_token: null,
    }).eq("id", evidence.id).eq("decision", "APPROVED").eq("estado_publicacion", "publicando")
      .eq("publish_token", token).select("id").maybeSingle()
    if (stored.error || !stored.data) return { mascotaId: null, pointsAwarded: 0 }
  }

  if (!fields) return { mascotaId: null, pointsAwarded: 0 }
  const { data, error } = await supabase.rpc("crear_mascota_perdida", {
    p_propietario_id: evidence.propietario_id,
    p_foto_moderacion_id: evidence.id,
    p_tipo_animal: fields.tipoAnimal,
    p_descripcion: fields.descripcion,
    p_lat: fields.lat,
    p_lon: fields.lon,
    p_telefono: fields.telefono,
  })
  return error || !data ? { mascotaId: null, pointsAwarded: 0 } : { mascotaId: Number(data), pointsAwarded: 10 }
}

/** Admin-only caller supplies the fields already persisted with a pending publication. */
export async function publicarRevisionMascota(supabase: SupabaseClient, id: string) {
  const { data, error } = await supabase.from("mascotas_fotos_moderacion").select("*").eq("id", id).single()
  if (error || !data) throw new Error("Revisión de mascota no disponible.")
  const evidence = data as Evidence
  const { data: pet } = await supabase.from("mascotas_perdidas").select("id,tipo_animal,descripcion,lat,lon,telefono").eq("foto_moderacion_id", id).maybeSingle()
  if (!pet) {
    const { data: staged } = await supabase.from("mascotas_fotos_moderacion").select("tipo_animal,descripcion,lat,lon,telefono").eq("id", id).single()
    if (!staged) throw new Error("Datos de publicación no disponibles.")
    return publicarMascotaAprobada(supabase, evidence, {
      tipoAnimal: staged.tipo_animal,
      descripcion: staged.descripcion,
      lat: staged.lat,
      lon: staged.lon,
      telefono: staged.telefono,
    })
  }
  return publicarMascotaAprobada(supabase, evidence)
}

export async function obtenerImagenPrivadaMascota(supabase: SupabaseClient, id: string) {
  const { data, error } = await supabase.from("mascotas_fotos_moderacion").select("*").eq("id", id).single()
  if (error || !data) throw Object.assign(new Error("Imagen no disponible"), { estado: 404 })
  try { return await readPrivateBytes(supabase, data as Evidence) }
  catch { throw Object.assign(new Error("Imagen no disponible"), { estado: 404 }) }
}
