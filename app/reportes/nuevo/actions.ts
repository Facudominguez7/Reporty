"use server"

/** Entrada autenticada de creación con control de envíos previo al procesamiento de imágenes. */

import type { SupabaseClient, User } from "@supabase/supabase-js"
import { headers } from "next/headers"
import { ZodError, z } from "zod"

import { crearReporteWorkflow, mutationErrorMessage } from "@/lib/use-cases/reportes"
import { notificarOrganismosDeReporte } from "@/lib/use-cases/reportes/notificar-organismos"
import { canParticipateInCommunity, getUserRoleContext, isAnonymousUser } from "@/lib/authz/roles"
import { buscarDuplicado } from "@/database/queries/reportes/nuevo"
import { aAvisoDuplicado, type AvisoDuplicado } from "@/lib/reportes/duplicados"
import { isWithinReportCoverage } from "@/lib/map/report-coverage"
import {
  claimReportSubmission,
  hashClientIp,
  releaseReportSubmission,
  reportSubmissionClaimMessage,
} from "@/lib/security/report-submission-guard.server"
import { createAdminClient } from "@/utils/supabase/admin"
import { createClient } from "@/utils/supabase/server"
import { moderateReportText } from "@/lib/moderation/texto-determinista.server"

const createReportSchema = z.object({
  // Solo la categoría «Otros» envía título; en el resto lo arma el servidor.
  titulo: z.preprocess((valor) => (valor === null || valor === "" ? undefined : valor), z.string().trim().min(3).max(120).optional()),
  descripcion: z.string().trim().min(10).max(5000),
  categoriaId: z.coerce.number({ error: "Expected number, received nan" }).refine(Number.isInteger, "Expected integer, received float").positive("Seleccioná una categoría."),
  prioridadId: z.coerce.number({ error: "Expected number, received nan" }).refine(Number.isInteger, "Expected integer, received float").positive("Seleccioná una prioridad."),
  lat: z.coerce.number().min(-90, "Seleccioná una ubicación en el mapa." ).max(90, "Seleccioná una ubicación en el mapa."),
  lon: z.coerce.number().min(-180, "Seleccioná una ubicación en el mapa.").max(180, "Seleccioná una ubicación en el mapa."),
  // Zod 3 accepted generic UUID-shaped identifiers, not only RFC-versioned UUIDs.
  submissionId: z.guid("No pudimos identificar el envío. Recargá la página e intentá nuevamente."),
  // Decisión frente a un reporte parecido cercano; el servidor la vuelve a validar.
  confirmaDistinto: z.preprocess((valor) => valor === "true", z.boolean()),
  reemplazaReporteId: z.preprocess(
    (valor) => (valor === null || valor === "" ? null : valor),
    z.coerce.number().int().positive("No pudimos identificar el reporte a reemplazar.").nullable(),
  ),
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
function obtenerImagen(formData: FormData) {
  const imagen = formData.get("image")
  return imagen instanceof File && imagen.size > 0 ? imagen : null
}

/** Crea el reporte con sesión y claim válidos, sin confiar en miniaturas enviadas por el cliente. */
export async function avisarOrganismosAction(reporteId: number) {
  if (!Number.isSafeInteger(reporteId) || reporteId <= 0) return { success: false as const, error: "El reporte no es válido." }

  try {
    const sessionClient = await createClient()
    const actor = await resolveReportActor(sessionClient)
    if (!actor.success) return { success: false as const, error: actor.error }

    const adminClient = createAdminClient()
    const { data: reporte, error } = await adminClient.from("reportes")
      .select("usuario_id,deleted_at,estado_id,titulo,categoria_id,descripcion,lat,lon")
      .eq("id", reporteId).single()
    if (error || !reporte || reporte.usuario_id !== actor.user.id || reporte.deleted_at || reporte.estado_id !== 1) {
      return { success: false as const, error: "El reporte ya no está disponible para avisar al organismo." }
    }

    const { data: foto, error: fotoError } = await adminClient.from("fotos_reporte")
      .select("id").eq("reporte_id", reporteId).maybeSingle()
    if (fotoError || !foto) return { success: false as const, error: "La fotografía todavía no está publicada." }

    const correosEnviados = await notificarOrganismosDeReporte(adminClient, {
      reporteId, titulo: reporte.titulo, categoriaId: reporte.categoria_id,
      descripcion: reporte.descripcion, lat: reporte.lat, lon: reporte.lon,
    })
    return { success: true as const, correosEnviados }
  } catch {
    return { success: false as const, error: "No pudimos avisar al organismo. Intentá nuevamente." }
  }
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
      confirmaDistinto: formData.get("confirmaDistinto"),
      reemplazaReporteId: formData.get("reemplazaReporteId"),
    })

    const textModerationError = moderateReportText(parsedInput.titulo ?? "", parsedInput.descripcion)
    if (textModerationError) return { success: false as const, error: textModerationError }

    const image = obtenerImagen(formData)
    if (!image) {
      return { success: false as const, error: "Adjuntá una fotografía para crear el reporte." }
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
        image,
        confirmaDistinto: parsedInput.confirmaDistinto,
        reemplazaReporteId: parsedInput.reemplazaReporteId,
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

const busquedaDuplicadoSchema = z.object({
  categoriaId: z.number().int().positive(),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
}).refine(({ lat, lon }) => isWithinReportCoverage(lat, lon))

export type ResultadoBusquedaDuplicado = {
  aviso: AvisoDuplicado | null
  /** Si la sesión actual puede publicar una novedad en el reporte existente. */
  puedeAportar: boolean
}

/**
 * Busca un reporte abierto parecido mientras se completa el formulario. Funciona sin sesión
 * (nada cuenta como propio) y nunca lanza: ante cualquier fallo no muestra aviso.
 *
 * @param entrada - Categoría y punto elegidos en el formulario.
 * @returns El aviso a mostrar y si la sesión puede sumar una novedad al reporte existente.
 */
export async function buscarDuplicadoAction(entrada: { categoriaId: number; lat: number; lon: number }): Promise<ResultadoBusquedaDuplicado> {
  const parsed = busquedaDuplicadoSchema.safeParse(entrada)
  if (!parsed.success) return { aviso: null, puedeAportar: false }

  try {
    const sessionClient = await createClient()
    const { data: { user } } = await sessionClient.auth.getUser()
    let puedeAportar = false
    if (user) {
      const { data: contextoRol } = await getUserRoleContext(sessionClient, user.id)
      puedeAportar = canParticipateInCommunity(user, contextoRol?.roleId)
    }

    const coincidencia = await buscarDuplicado(createAdminClient(), { ...parsed.data, usuarioId: user?.id ?? null })
    return { aviso: coincidencia ? aAvisoDuplicado(coincidencia) : null, puedeAportar }
  } catch (error) {
    console.error("Error al buscar un reporte duplicado:", error)
    return { aviso: null, puedeAportar: false }
  }
}
