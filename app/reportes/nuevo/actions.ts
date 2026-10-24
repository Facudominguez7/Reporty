"use server"

import type { SupabaseClient, User } from "@supabase/supabase-js"
import { headers } from "next/headers"
import { ZodError, z } from "zod"

import { crearReporteWorkflow, mutationErrorMessage } from "@/lib/use-cases/reportes"
import { isAcceptedReportImageType } from "@/lib/media/report-images"
import {
  validateUploadedReportImage,
  validateUploadedReportThumbnail,
} from "@/lib/media/report-image-validation.server"
import { isAnonymousUser } from "@/lib/authz/roles"
import { isWithinReportCoverage } from "@/lib/map/report-coverage"
import {
  claimReportSubmission,
  hashClientIp,
  releaseReportSubmission,
  reportSubmissionClaimMessage,
} from "@/lib/security/report-submission-guard.server"
import { createAdminClient } from "@/utils/supabase/admin"
import { createClient } from "@/utils/supabase/server"

const createReportSchema = z.object({
  titulo: z.string().trim().min(3).max(120),
  descripcion: z.string().trim().min(10).max(5000),
  categoriaId: z.coerce.number().int().positive("Seleccioná una categoría."),
  prioridadId: z.coerce.number().int().positive("Seleccioná una prioridad."),
  lat: z.coerce.number().min(-90, "Seleccioná una ubicación en el mapa." ).max(90, "Seleccioná una ubicación en el mapa."),
  lon: z.coerce.number().min(-180, "Seleccioná una ubicación en el mapa.").max(180, "Seleccioná una ubicación en el mapa."),
  submissionId: z.string().uuid("No pudimos identificar el envío. Recargá la página e intentá nuevamente."),
}).refine(({ lat, lon }) => isWithinReportCoverage(lat, lon), {
  path: ["lat"],
  message: "La ubicación debe estar dentro de Posadas, Garupá o Candelaria.",
})

type ReportActorResult =
  | { success: true; user: User }
  | { success: false; error: string }

/**
 * Resolves who is creating the report from the validated session. The anonymous guest
 * session is created by the browser (`signInAnonymously` in the new-report page) right
 * before calling this action, so Supabase Auth applies its per-IP anonymous sign-in
 * limit and CAPTCHA to the visitor's own IP instead of the server's shared egress IP.
 * This action never creates identities.
 */
async function resolveReportActor(sessionClient: SupabaseClient): Promise<ReportActorResult> {
  const {
    data: { user },
  } = await sessionClient.auth.getUser()

  if (!user) {
    return {
      success: false,
      error: "No encontramos tu sesión. Recargá la página e intentá enviar el reporte nuevamente.",
    }
  }

  return { success: true, user }
}

async function getOptionalImage(formData: FormData) {
  const image = formData.get("image")

  if (!(image instanceof File) || image.size === 0) {
    return null
  }

  if (!isAcceptedReportImageType(image.type)) {
    throw new Error("La imagen debe estar en formato JPG, PNG o WebP.")
  }

  const metadata = await validateUploadedReportImage(image)

  return { file: image, metadata }
}

async function getOptionalThumbnail(formData: FormData) {
  const thumbnail = formData.get("imageThumbnail")

  if (!(thumbnail instanceof File) || thumbnail.size === 0) {
    return null
  }

  const metadata = await validateUploadedReportThumbnail(thumbnail)

  return { file: thumbnail, metadata }
}

export async function crearReporteAction(formData: FormData) {
  try {
    const parsedInput = createReportSchema.parse({
      titulo: formData.get("titulo"),
      descripcion: formData.get("descripcion"),
      categoriaId: formData.get("categoriaId"),
      prioridadId: formData.get("prioridadId"),
      lat: formData.get("lat"),
      lon: formData.get("lon"),
      submissionId: formData.get("submissionId"),
    })

    const image = await getOptionalImage(formData)
    const imageThumbnail = await getOptionalThumbnail(formData)

    if (imageThumbnail && !image) {
      return {
        success: false as const,
        error: "No pudimos validar la miniatura sin la imagen principal.",
      }
    }

    if (
      image &&
      imageThumbnail &&
      (imageThumbnail.metadata.width > image.metadata.width ||
        imageThumbnail.metadata.height > image.metadata.height)
    ) {
      return {
        success: false as const,
        error: "La miniatura generada no coincide con la imagen principal.",
      }
    }

    const sessionClient = await createClient()
    const actor = await resolveReportActor(sessionClient)

    if (!actor.success) {
      return { success: false as const, error: actor.error }
    }

    const adminClient = createAdminClient()
    const claim = await claimReportSubmission(adminClient, {
      submissionId: parsedInput.submissionId,
      actorId: actor.user.id,
      ipHash: hashClientIp(await headers()),
    })

    if (claim !== "ok") {
      return { success: false as const, error: reportSubmissionClaimMessage(claim) }
    }

    try {
      const result = await crearReporteWorkflow(adminClient, {
        usuarioId: actor.user.id,
        actorIsAnonymous: isAnonymousUser(actor.user),
        titulo: parsedInput.titulo,
        descripcion: parsedInput.descripcion,
        categoriaId: parsedInput.categoriaId,
        prioridadId: parsedInput.prioridadId,
        lat: parsedInput.lat,
        lon: parsedInput.lon,
        image: image?.file ?? null,
        imageThumbnail: imageThumbnail?.file ?? null,
      })

      if (!result.success) {
        await releaseReportSubmission(adminClient, parsedInput.submissionId)
      }

      return result
    } catch (workflowError) {
      await releaseReportSubmission(adminClient, parsedInput.submissionId)
      throw workflowError
    }
  } catch (error) {
    if (error instanceof ZodError) {
      const messages = error.issues.map((issue) => {
        if (issue.path[0] === "titulo") {
          return "El título debe tener al menos 3 caracteres."
        }

        if (issue.path[0] === "descripcion") {
          return "La descripción debe tener al menos 10 caracteres."
        }

        return issue.message
      })

      return {
        success: false as const,
        error: messages.join(" "),
      }
    }

    return {
      success: false as const,
      error: mutationErrorMessage(error, "No pudimos crear el reporte."),
    }
  }
}
