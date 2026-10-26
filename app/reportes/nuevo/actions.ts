"use server"

/** Entrada autenticada de creación con control de envíos previo al procesamiento de imágenes. */

import type { SupabaseClient, User } from "@supabase/supabase-js"
import { headers } from "next/headers"
import { ZodError, z } from "zod"

import { crearReporteWorkflow, mutationErrorMessage } from "@/lib/use-cases/reportes"
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
  categoriaId: z.coerce.number({ error: "Expected number, received nan" }).refine(Number.isInteger, "Expected integer, received float").positive("Seleccioná una categoría."),
  prioridadId: z.coerce.number({ error: "Expected number, received nan" }).refine(Number.isInteger, "Expected integer, received float").positive("Seleccioná una prioridad."),
  lat: z.coerce.number().min(-90, "Seleccioná una ubicación en el mapa." ).max(90, "Seleccioná una ubicación en el mapa."),
  lon: z.coerce.number().min(-180, "Seleccioná una ubicación en el mapa.").max(180, "Seleccioná una ubicación en el mapa."),
  // Zod 3 accepted generic UUID-shaped identifiers, not only RFC-versioned UUIDs.
  submissionId: z.guid("No pudimos identificar el envío. Recargá la página e intentá nuevamente."),
}).refine(({ lat, lon }) => isWithinReportCoverage(lat, lon), {
  path: ["lat"],
  message: "La ubicación debe estar dentro de Posadas, Garupá o Candelaria.",
})

type ReportActorResult =
  | { success: true; user: User }
  | { success: false; error: string }

/** Verifica la sesión existente; las identidades invitadas se crean desde el navegador con CAPTCHA. */
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

/** Extrae el archivo sin leer bytes; toda validación costosa ocurre después de autorizar el rol. */
function obtenerImagenOpcional(formData: FormData) {
  const imagen = formData.get("image")
  return imagen instanceof File && imagen.size > 0 ? imagen : null
}

/** Crea el reporte con sesión y claim válidos, sin confiar en miniaturas enviadas por el cliente. */
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
        image: obtenerImagenOpcional(formData),
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
