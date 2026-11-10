/** Creación autorizada del reporte; la fotografía tiene un resultado independiente. */
import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { PUNTOS } from "@/database/queries/puntos"
import {
  crearReporte,
  type CrearReporteParams,
} from "@/database/queries/reportes/nuevo"
import { obtenerDireccion } from "@/lib/geocodificacion/direccion-inversa"
import { canCreateReports, getUserRoleContext, isGuestRole } from "@/lib/authz/roles"
import { moderarYGuardarImagenReporte, type ResultadoImagenReporte } from "@/lib/moderation/imagenes-reporte.server"
import { isAcceptedReportImageType, REPORT_IMAGE_MAX_BYTES, REPORT_IMAGE_MAX_BYTES_LABEL } from "@/lib/media/report-images"
import { validateUploadedReportImage } from "@/lib/media/report-image-validation.server"
import { moderateText } from "@/lib/moderation/textos.server"

type MutationResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; errorKind?: "moderation" | "verification" | "timeout" }

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

/**
 * Crea el reporte con su dirección y su foto. Acredita creación sólo por ledger
 * serializado con retiro; nunca compensa fallos por fuera.
 *
 * La dirección se busca en paralelo con la validación de la imagen y nunca bloquea:
 * si Nominatim falla o tarda, el reporte se crea con `direccion` en null.
 */
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
  const { data: category, error: categoryError } = await supabase.from("categorias").select("nombre").eq("id", input.categoriaId).single()
  if (categoryError || typeof category?.nombre !== "string") {
    console.warn("[text-moderation] reporte CATEGORY_LOOKUP_FAILED")
    return { success: false, error: "No pudimos verificar el texto. Intentá nuevamente más tarde.", errorKind: "verification" }
  }

  try {
    const { data, error } = await supabase.rpc("reservar_presupuesto_texto", { p_usuario_id: input.usuarioId })
    if (error || data !== true) {
      console.warn(error ? "[text-moderation] reporte BUDGET_RPC_ERROR" : data === false ? "[text-moderation] reporte BUDGET_DENIED" : "[text-moderation] reporte BUDGET_INVALID_RESPONSE")
      return { success: false, error: "No pudimos verificar el texto. Intentá nuevamente más tarde.", errorKind: "verification" }
    }
  } catch {
    console.warn("[text-moderation] reporte BUDGET_RPC_ERROR")
    return { success: false, error: "No pudimos verificar el texto. Intentá nuevamente más tarde.", errorKind: "verification" }
  }
  const textResult = await moderateText({ tipo: "reporte", categoria: category.nombre, titulo: input.titulo, descripcion: input.descripcion })
  if (textResult.decision !== "APPROVED") return {
    success: false,
    error: textResult.error,
    errorKind: textResult.decision === "UNAVAILABLE" && textResult.motivo === "TIMEOUT" ? "timeout"
      : textResult.decision === "UNAVAILABLE" && textResult.motivo === "SERVICE_UNAVAILABLE" ? "verification" : "moderation",
  }

  // Only resolve coordinates after approval; rejected content should not reach external geocoding.
  const direccionPendiente = input.lat !== null && input.lon !== null
    ? obtenerDireccion(input.lat, input.lon)
    : Promise.resolve(null)
  const reporte = await crearReporte(supabase, { ...input, direccion: await direccionPendiente })

  let imageModeration = input.image
    ? await moderarYGuardarImagenReporte(supabase, { reporteId: reporte.id, propietarioId: input.usuarioId, image: input.image })
    : null
  let imageUploaded = imageModeration?.publicada === true

  // Los invitados nunca reciben puntos; la RPC de base de datos también lo impide.
  const isGuest = input.actorIsAnonymous === true || isGuestRole(roleResult.data?.roleId)
  let pointsAwarded = 0

  if (!isGuest && imageModeration?.estado !== "REJECTED") {
    try {
      const { data, error } = await supabase.rpc("acreditar_puntos_reporte", { p_reporte_id: reporte.id })
      if (!error && data === true) pointsAwarded = PUNTOS.CREAR_REPORTE
    } catch {
      // La creación ya ocurrió. Sin fallback agregado ni repetir premios inciertos.
    }
  }

  // Una decisión administrativa pudo retirar el reporte entre moderación y premio.
  // La RPC serializa el saldo; esta lectura evita anunciar una publicación ya retirada.
  if (input.image && imageModeration?.estado !== "REJECTED") {
    const { data: actual } = await supabase.from("reportes").select("deleted_at").eq("id", reporte.id).single()
    if (actual?.deleted_at) {
      pointsAwarded = 0
      imageUploaded = false
      imageModeration = {
        estado: "REJECTED", publicada: false,
        motivos: ["Tu reporte fue retirado porque la fotografía adjunta incumple nuestras normas de contenido. Evitá volver a publicar este tipo de material"],
        advertencias: [],
      }
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
