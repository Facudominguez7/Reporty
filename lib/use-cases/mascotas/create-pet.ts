import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import { getUserRoleContext, isGuestRole } from "@/lib/authz/roles"
import { isAcceptedReportImageType, REPORT_IMAGE_MAX_BYTES, REPORT_IMAGE_MAX_BYTES_LABEL } from "@/lib/media/report-images"
import { validateUploadedReportImage } from "@/lib/media/report-image-validation.server"
import { validatePetSubmission, type MascotaSubmission } from "@/lib/security/mascota-submission-guard.server"
import { crearFotoMascotaModerada } from "@/lib/moderation/mascotas-imagen.server"

type Result = { success: true; data: { mascotaId: number | null; moderation: "APPROVED" | "PENDING" | "REVIEW" | "REJECTED"; pointsAwarded: number; message: string } } | { success: false; error: string }

/** Create only from the verified session owner and after image moderation has a durable result. */
export async function crearMascotaWorkflow(
  supabase: SupabaseClient,
  input: MascotaSubmission & { propietarioId: string; image: File },
): Promise<Result> {
  const role = await getUserRoleContext(supabase, input.propietarioId)
  if (role.error || !role.data?.roleId || isGuestRole(role.data.roleId)) {
    return { success: false, error: "Necesitás una cuenta registrada para publicar una mascota." }
  }
  const fields = validatePetSubmission({
    tipoAnimal: input.tipoAnimal,
    descripcion: input.descripcion,
    lat: input.lat,
    lon: input.lon,
    telefono: input.telefono,
  })
  if (!(input.image instanceof File) || input.image.size < 1) return { success: false, error: "Adjuntá una fotografía para publicar la mascota." }
  if (!isAcceptedReportImageType(input.image.type)) return { success: false, error: "La imagen debe estar en formato JPG, PNG o WebP." }
  if (input.image.size > REPORT_IMAGE_MAX_BYTES) return { success: false, error: `La imagen optimizada no puede superar los ${REPORT_IMAGE_MAX_BYTES_LABEL}.` }
  await validateUploadedReportImage(input.image)

  const result = await crearFotoMascotaModerada(supabase, {
    propietarioId: input.propietarioId,
    image: input.image,
    ...fields,
  })
  return {
    success: true,
    data: {
      mascotaId: result.mascotaId,
      moderation: result.decision === "APPROVED" && (!Number.isSafeInteger(result.mascotaId) || result.mascotaId! <= 0) ? "PENDING" : result.decision,
      pointsAwarded: result.pointsAwarded,
      message: result.mensaje,
    },
  }
}
