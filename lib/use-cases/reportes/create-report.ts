/** Creación autorizada del reporte; la fotografía tiene un resultado independiente. */
import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { PUNTOS, sumarPuntos } from "@/database/queries/puntos"
import {
  crearReporte,
  type CrearReporteParams,
} from "@/database/queries/reportes/nuevo"
import { canCreateReports, getUserRoleContext, isGuestRole } from "@/lib/authz/roles"
import { moderarYGuardarImagenReporte, type ResultadoImagenReporte } from "@/lib/moderation/imagenes-reporte.server"
import { isAcceptedReportImageType, REPORT_IMAGE_MAX_BYTES, REPORT_IMAGE_MAX_BYTES_LABEL } from "@/lib/media/report-images"
import { validateUploadedReportImage } from "@/lib/media/report-image-validation.server"

type MutationResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

export type CreateReportWorkflowInput = CrearReporteParams & {
  image?: File | null
  imageThumbnail?: File | null
  /** Identidad anónima verificada en sesión; se combina con el rol de base de datos. */
  actorIsAnonymous?: boolean
}

export type CreateReportWorkflowResult = {
  reportId: number
  imageUploaded: boolean
  imageModeration: ResultadoImagenReporte | null
  pointsAwarded: number
  isGuest: boolean
}

/** Conserva puntos e invitados aunque la fotografía requiera revisión o sea rechazada. */
export async function crearReporteWorkflow(
  supabase: SupabaseClient,
  input: CreateReportWorkflowInput,
): Promise<MutationResult<CreateReportWorkflowResult>> {
  const roleResult = await getUserRoleContext(supabase, input.usuarioId)

  if (roleResult.error || !canCreateReports(roleResult.data?.roleId)) {
    return { success: false, error: "No tenés permisos para crear reportes." }
  }

  // Validación histórica después de sesión, claim y rol; no se lee la miniatura ajena.
  if (input.image) {
    if (!isAcceptedReportImageType(input.image.type)) throw new Error("La imagen debe estar en formato JPG, PNG o WebP.")
    if (input.image.size > REPORT_IMAGE_MAX_BYTES) throw new Error(`La imagen optimizada no puede superar los ${REPORT_IMAGE_MAX_BYTES_LABEL}.`)
    await validateUploadedReportImage(input.image)
  }
  const reporte = await crearReporte(supabase, input)

  const imageModeration = input.image
    ? await moderarYGuardarImagenReporte(supabase, { reporteId: reporte.id, propietarioId: input.usuarioId, image: input.image })
    : null
  const imageUploaded = imageModeration?.publicada === true

  // Los invitados nunca reciben puntos; la RPC de base de datos también lo impide.
  const isGuest = input.actorIsAnonymous === true || isGuestRole(roleResult.data?.roleId)
  let pointsAwarded = 0

  if (!isGuest) {
    const pointsResult = await sumarPuntos(
      supabase,
      input.usuarioId,
      PUNTOS.CREAR_REPORTE,
      "Crear nuevo reporte",
    )

    if (pointsResult.success) {
      pointsAwarded = PUNTOS.CREAR_REPORTE
    } else {
      console.error("No pudimos acreditar puntos tras crear el reporte:", pointsResult.error)
    }
  }

  return {
    success: true,
    data: {
      reportId: reporte.id,
      imageUploaded,
      imageModeration,
      pointsAwarded,
      isGuest,
    },
  }
}
