import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"

const PUBLIC_BUCKET = "reportes"
const PHOTO_PATH = /^mascotas\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$/i

type CleanupResult = { removed: boolean; pending: boolean; publiclyAccessible: boolean }

async function notFound(error: unknown) {
  if (!error || typeof error !== "object") return false
  const detail = error as { name?: unknown; originalError?: unknown }
  const response = error instanceof Response ? error : detail.name === "StorageUnknownError" ? detail.originalError : null
  if (!(response instanceof Response) || response.status !== 400) return false
  try {
    const body = await response.clone().json()
    return (body?.statusCode === "404" || body?.statusCode === 404) && body?.code === "NoSuchKey" && body?.error === "not_found"
  } catch { return false }
}

async function recordPending(supabase: SupabaseClient, evidenceId: string, reasons: string[]) {
  if (reasons.includes("limpieza_publica_pendiente")) return
  await supabase.from("mascotas_fotos_moderacion").update({ motivos: [...reasons, "limpieza_publica_pendiente"] }).eq("id", evidenceId)
}

/** Deletes only a durably withdrawn photo and reports success only after Storage confirms absence. */
export async function limpiarFotoMascotaRetirada(supabase: SupabaseClient, mascotaId: number): Promise<CleanupResult> {
  if (!Number.isSafeInteger(mascotaId) || mascotaId <= 0) throw new Error("Publicación no disponible.")
  const { data: pet, error: petError } = await supabase.from("mascotas_perdidas")
    .select("id,propietario_id,foto_moderacion_id,foto_path,retirada_at,foto_limpieza_estado")
    .eq("id", mascotaId).single()
  if (petError || !pet) throw new Error("Publicación no disponible.")
  if (!pet.retirada_at) return { removed: false, pending: false, publiclyAccessible: true }

  const { data: evidence, error: evidenceError } = await supabase.from("mascotas_fotos_moderacion")
    .select("id,propietario_id,mascota_id,decision,estado_publicacion,path_publico,motivos")
    .eq("id", pet.foto_moderacion_id).single()
  if (evidenceError || !evidence || evidence.propietario_id !== pet.propietario_id ||
      evidence.mascota_id !== mascotaId || evidence.decision !== "APPROVED" ||
      evidence.estado_publicacion !== "publicada" || evidence.path_publico !== pet.foto_path ||
      !PHOTO_PATH.test(pet.foto_path)) {
    return { removed: false, pending: true, publiclyAccessible: true }
  }
  if (pet.foto_limpieza_estado === "completada") {
    await supabase.from("mascotas_fotos_moderacion").update({
      motivos: (evidence.motivos ?? []).filter((reason: string) => reason !== "limpieza_publica_pendiente"),
    }).eq("id", evidence.id).eq("mascota_id", mascotaId)
    return { removed: true, pending: false, publiclyAccessible: false }
  }

  try { await supabase.storage.from(PUBLIC_BUCKET).remove([pet.foto_path]) } catch { /* Verify the public object below. */ }
  let absent = false
  try {
    const current = await supabase.storage.from(PUBLIC_BUCKET).download(pet.foto_path)
    const publicUrl = supabase.storage.from(PUBLIC_BUCKET).getPublicUrl(pet.foto_path).data.publicUrl
    const response = await fetch(publicUrl, { method: "GET", cache: "no-store", signal: AbortSignal.timeout(5000) })
    const publicUrlInaccessible = [401, 403, 404, 410].includes(response.status) || await notFound(response)
    absent = !current.data && publicUrlInaccessible && await notFound(current.error)
  } catch { /* Unknown Storage outcomes must never be reported as private. */ }
  if (!absent) {
    await recordPending(supabase, evidence.id, evidence.motivos ?? [])
    return { removed: false, pending: true, publiclyAccessible: true }
  }

  const { data: settled, error: settleError } = await supabase.from("mascotas_perdidas")
    .update({ foto_limpieza_estado: "completada" })
    .eq("id", mascotaId).eq("retirada_at", pet.retirada_at).eq("foto_limpieza_estado", "pendiente")
    .select("id").maybeSingle()
  if (settleError) {
    await recordPending(supabase, evidence.id, evidence.motivos ?? [])
    return { removed: true, pending: true, publiclyAccessible: false }
  }
  if (!settled) {
    const { data: after } = await supabase.from("mascotas_perdidas").select("foto_limpieza_estado").eq("id", mascotaId).single()
    if (after?.foto_limpieza_estado !== "completada") {
      await recordPending(supabase, evidence.id, evidence.motivos ?? [])
      return { removed: true, pending: true, publiclyAccessible: false }
    }
  }
  await supabase.from("mascotas_fotos_moderacion").update({
    motivos: (evidence.motivos ?? []).filter((reason: string) => reason !== "limpieza_publica_pendiente"),
  }).eq("id", evidence.id).eq("mascota_id", mascotaId)
  return { removed: true, pending: false, publiclyAccessible: false }
}
