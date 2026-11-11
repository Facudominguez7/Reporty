"use server"

import { ZodError } from "zod"
import { getUserRoleContext, isGuestRole } from "@/lib/authz/roles"
import { validatePetSubmission } from "@/lib/security/mascota-submission-guard.server"
import { crearMascotaWorkflow } from "@/lib/use-cases/mascotas/create-pet"
import { limpiarFotoMascotaRetirada } from "@/lib/moderation/mascotas-withdrawal.server"
import { moderatePetText } from "@/lib/moderation/texto-determinista.server"
import { createAdminClient } from "@/utils/supabase/admin"
import { createClient } from "@/utils/supabase/server"

function numeroFormulario(value: FormDataEntryValue | null) {
  return typeof value === "string" && value.trim() !== "" ? Number(value) : Number.NaN
}

function obtenerFoto(formData: FormData) {
  const value = formData.get("image")
  return value instanceof File && value.size > 0 ? value : null
}

/** The session is the sole source of ownership; a pet photo is mandatory. */
export async function retirarMascotaPropiaAction(mascotaId: number) {
  if (!Number.isSafeInteger(mascotaId) || mascotaId <= 0) {
    return { success: false as const, error: "La publicación no está disponible." }
  }
  try {
    const session = await createClient()
    const { data: { user }, error: authError } = await session.auth.getUser()
    if (authError || !user || user.is_anonymous) {
      return { success: false as const, error: "Necesitás una cuenta registrada para retirar la publicación." }
    }
    const service = createAdminClient()
    const role = await getUserRoleContext(service, user.id)
    if (role.error || !role.data?.roleId || isGuestRole(role.data.roleId)) {
      return { success: false as const, error: "Necesitás una cuenta registrada para retirar la publicación." }
    }

    const { data: retirada, error } = await session.rpc("retirar_mascota_propia", { p_mascota_id: mascotaId })
    if (error) return { success: false as const, error: "No pudimos retirar la publicación." }
    if (retirada !== true) {
      const { data: propia, error: lookupError } = await service.from("mascotas_perdidas")
        .select("id,retirada_at,foto_limpieza_estado").eq("id", mascotaId)
        .eq("propietario_id", user.id).maybeSingle()
      if (lookupError || !propia?.retirada_at || propia.foto_limpieza_estado === "completada") {
        return { success: false as const, error: "La publicación no está disponible, no te pertenece o ya fue marcada como encontrada." }
      }
    }

    let cleanup
    try { cleanup = await limpiarFotoMascotaRetirada(service, mascotaId) }
    catch { cleanup = { removed: false, pending: true, publiclyAccessible: true } }
    return {
      success: true as const,
      data: {
        retirada: true,
        cleanupPending: cleanup.pending,
        publiclyAccessible: cleanup.publiclyAccessible,
        message: cleanup.publiclyAccessible
          ? "La publicación fue retirada, pero su foto todavía puede verse mediante su URL pública. La limpieza quedó pendiente y administración puede reintentarlo."
          : "La publicación fue retirada y se confirmó que la foto ya no está accesible.",
      },
    }
  } catch {
    return { success: false as const, error: "No pudimos retirar la publicación." }
  }
}

export async function crearMascotaAction(formData: FormData) {
  try {
    const input = validatePetSubmission({
      tipoAnimal: formData.get("tipoAnimal"),
      descripcion: formData.get("descripcion"),
      lat: numeroFormulario(formData.get("lat")),
      lon: numeroFormulario(formData.get("lon")),
      telefono: formData.get("telefono"),
    })
    const textModerationError = moderatePetText(input.descripcion)
    if (textModerationError) return { success: false as const, error: textModerationError }

    const image = obtenerFoto(formData)
    if (!image) return { success: false as const, error: "Adjuntá una fotografía para publicar la mascota." }

    const session = await createClient()
    const { data: { user }, error } = await session.auth.getUser()
    if (error || !user || user.is_anonymous) {
      return { success: false as const, error: "Necesitás una cuenta registrada para publicar una mascota." }
    }

    const service = createAdminClient()
    const role = await getUserRoleContext(service, user.id)
    if (role.error || !role.data?.roleId || isGuestRole(role.data.roleId)) {
      return { success: false as const, error: "Necesitás una cuenta registrada para publicar una mascota." }
    }

    return await crearMascotaWorkflow(service, { ...input, propietarioId: user.id, image })
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof ZodError ? "Revisá los datos de la publicación y volvé a intentar." : "No pudimos procesar la publicación de la mascota.",
    }
  }
}
