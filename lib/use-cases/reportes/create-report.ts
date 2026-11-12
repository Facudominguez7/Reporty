/** Creación autorizada del reporte; la fotografía tiene un resultado independiente. */
import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { PUNTOS } from "@/database/queries/puntos"
import {
  crearReporte,
  type CrearReporteParams,
} from "@/database/queries/reportes/nuevo"
import { obtenerDireccion } from "@/lib/geocodificacion/direccion-inversa"
import { TITULO_REPORTE_MAX, armarTituloReporte, requiereTituloManual } from "@/lib/reportes/titulo-automatico"
import { canCreateReports, getUserRoleContext, isGuestRole } from "@/lib/authz/roles"
import { moderarYGuardarImagenReporte, type ResultadoImagenReporte } from "@/lib/moderation/imagenes-reporte.server"
import { isAcceptedReportImageType, REPORT_IMAGE_MAX_BYTES, REPORT_IMAGE_MAX_BYTES_LABEL } from "@/lib/media/report-images"
import { validateUploadedReportImage } from "@/lib/media/report-image-validation.server"
import { moderateReportText } from "@/lib/moderation/texto-determinista.server"

type MutationResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; requiereTitulo?: true }

/** Respuesta cuando falta la dirección: el formulario muestra el campo título y se reenvía. */
const MENSAJE_TITULO_SIN_DIRECCION =
  "No pudimos obtener la dirección de ese punto. Escribí un título para el reporte y volvé a enviarlo."

/**
 * Indica si un título escrito por la persona tiene un largo aceptable.
 *
 * @param titulo - Título ya recortado.
 * @returns `true` si tiene entre 3 y el máximo de caracteres.
 */
function tituloEscritoValido(titulo: string): boolean {
  return titulo.length >= 3 && titulo.length <= TITULO_REPORTE_MAX
}

export type CreateReportWorkflowInput = Omit<CrearReporteParams, "titulo" | "direccion"> & {
  /** Se usa en la categoría «Otros» o cuando no se encuentra la dirección; si no, el título se arma solo. */
  titulo?: string | null
  image?: File | null
  imageThumbnail?: File | null
  /** Identidad anónima verificada en sesión; se combina con el rol de base de datos. */
  actorIsAnonymous?: boolean
}

export type CreateReportWorkflowResult = {
  reportId: number
  /** Título con el que quedó guardado el reporte. */
  titulo: string
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
 *
 * El título se arma con la categoría y la dirección («Bache en Bolívar 1450, Posadas»);
 * se usa el título que escribió la persona en la categoría «Otros» o cuando no hay dirección.
 * Sin dirección ni título escrito, el reporte no se crea y se pide el título (`requiereTitulo`).
 */
export async function crearReporteWorkflow(
  supabase: SupabaseClient,
  input: CreateReportWorkflowInput,
): Promise<MutationResult<CreateReportWorkflowResult>> {
  const roleResult = await getUserRoleContext(supabase, input.usuarioId)

  if (roleResult.error || !canCreateReports(roleResult.data?.roleId)) {
    return { success: false, error: "No tenés permisos para crear reportes." }
  }

  const tituloEscrito = (input.titulo ?? "").trim()
  const esOtros = requiereTituloManual(input.categoriaId)
  if (esOtros && !tituloEscritoValido(tituloEscrito)) {
    return { success: false, error: "En la categoría Otros escribí un título de al menos 3 caracteres." }
  }
  if (!esOtros && armarTituloReporte(input.categoriaId, null) === null) {
    return { success: false, error: "Seleccioná una categoría válida." }
  }

  // El título escrito puede terminar publicado (Otros o sin dirección): siempre se modera.
  const textModerationError = moderateReportText(tituloEscrito, input.descripcion)
  if (textModerationError) return { success: false, error: textModerationError }

  // Arranca ya para no sumar su espera a la validación de la foto; nunca lanza.
  const direccionPendiente = input.lat !== null && input.lon !== null
    ? obtenerDireccion(input.lat, input.lon)
    : Promise.resolve(null)

  // Validación histórica después de sesión, claim y rol; no se lee la miniatura ajena.
  if (input.image) {
    if (!isAcceptedReportImageType(input.image.type)) throw new Error("La imagen debe estar en formato JPG, PNG o WebP.")
    if (input.image.size > REPORT_IMAGE_MAX_BYTES) throw new Error(`La imagen optimizada no puede superar los ${REPORT_IMAGE_MAX_BYTES_LABEL}.`)
    await validateUploadedReportImage(input.image)
  }
  const direccion = await direccionPendiente
  let titulo: string
  if (esOtros) titulo = tituloEscrito
  else if (direccion) titulo = armarTituloReporte(input.categoriaId, direccion) as string
  else if (tituloEscritoValido(tituloEscrito)) titulo = tituloEscrito
  else return { success: false, requiereTitulo: true, error: MENSAJE_TITULO_SIN_DIRECCION }
  const reporte = await crearReporte(supabase, { ...input, titulo, direccion })

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
      titulo,
      imageUploaded,
      imageModeration,
      pointsAwarded,
      isGuest,
    },
  }
}
