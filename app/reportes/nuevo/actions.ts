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
import { verificarTurnstile } from "@/lib/security/turnstile.server"
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

/**
 * Turnstile action bound to every report creation. `components/turnstile-widget.tsx` renders
 * the challenge with the same value through `app/reportes/nuevo/page.tsx`, so a token issued
 * for another protected form can never be replayed here; a test asserts both sides match.
 */
const ACCION_CAPTCHA_CREACION = "crear_reporte"

/**
 * Same copy as `MENSAJE_CAPTCHA_NO_DISPONIBLE` in `components/turnstile-widget.tsx`;
 * `tests/reportes/turnstile-report.test.ts` asserts both are identical.
 */
const MENSAJE_CAPTCHA_NO_DISPONIBLE =
  "La verificación de seguridad no está disponible en este momento. Por seguridad no podemos procesar el formulario; si el problema continúa, contactá a la administración de Reporty."

/** Production must never accept a report submission with the challenge silently off. */
const esProduccion = () => process.env.NODE_ENV === "production"

/** Mirrors the browser: the widget only renders a challenge when this public key exists. */
const captchaConfigurado = () => (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "").trim().length > 0

const secretoConfigurado = () => (process.env.TURNSTILE_SECRET_KEY ?? "").trim().length > 0

/** Reads the single-use token the form attached to this submission. */
function obtenerCaptcha(formData: FormData): string | undefined {
  const token = formData.get("captcha_token")
  return typeof token === "string" && token.length > 0 && token.length <= 2048 ? token : undefined
}

/**
 * Proves that a person, not a script, is submitting the report. It runs before the
 * submission is claimed and before any costly image work, so a rejected token neither
 * consumes the idempotency key nor the hourly limits: the retry only solves a new
 * challenge. Both registered and guest identities go through it, and the token consumed
 * by the guest `signInAnonymously()` call can never be reused here.
 *
 * @param formData - Submission carrying the single-use `captcha_token`.
 * @returns Error copy to return, or `null` when the creation may continue.
 */
async function verificarCaptchaDeCreacion(formData: FormData): Promise<string | null> {
  if (!esProduccion() && !captchaConfigurado()) {
    // Without a site key the form cannot render a challenge at all (development and
    // tests). Production never reaches this branch: it fails closed below.
    return null
  }

  if (!captchaConfigurado() || !secretoConfigurado()) {
    // Never degrade silently: the private key stays server-side, so an incomplete setup
    // blocks the protected operation instead of trusting the client token.
    console.error(
      "Turnstile no está configurado: la creación de reportes quedó bloqueada hasta completar NEXT_PUBLIC_TURNSTILE_SITE_KEY y TURNSTILE_SECRET_KEY.",
    )
    return MENSAJE_CAPTCHA_NO_DISPONIBLE
  }

  const verificacion = await verificarTurnstile({
    token: obtenerCaptcha(formData),
    expectedAction: ACCION_CAPTCHA_CREACION,
  })

  return verificacion.ok ? null : verificacion.mensaje
}

/** Extrae el archivo sin leer bytes; toda validación costosa ocurre después de autorizar el rol. */
function obtenerImagen(formData: FormData) {
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

    const image = obtenerImagen(formData)
    if (!image) {
      return { success: false as const, error: "Adjuntá una fotografía para crear el reporte." }
    }

    const sessionClient = await createClient()
    const actor = await resolveReportActor(sessionClient)

    if (!actor.success) {
      return { success: false as const, error: actor.error }
    }

    const captchaError = await verificarCaptchaDeCreacion(formData)
    if (captchaError) {
      return { success: false as const, error: captchaError }
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
        image,
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
