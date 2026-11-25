/** Creación autorizada del reporte; la fotografía tiene un resultado independiente. */
import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { PUNTOS } from "@/database/queries/puntos"
import {
  buscarDuplicado,
  crearReporte,
  type CrearReporteParams,
} from "@/database/queries/reportes/nuevo"
import { aAvisoDuplicado, type AvisoDuplicado, type CoincidenciaDuplicado } from "@/lib/reportes/duplicados"
import { eliminarReportePropioWorkflow } from "./detail-mutations"
import { obtenerDireccion } from "@/lib/geocodificacion/direccion-inversa"
import { TITULO_REPORTE_MAX, armarTituloReporte, requiereTituloManual } from "@/lib/reportes/titulo-automatico"
import { canCreateReports, getUserRoleContext, isGuestRole } from "@/lib/authz/roles"
import { moderarYGuardarImagenReporte, type ResultadoImagenReporte } from "@/lib/moderation/imagenes-reporte.server"
import { isAcceptedReportImageType, REPORT_IMAGE_MAX_BYTES, REPORT_IMAGE_MAX_BYTES_LABEL } from "@/lib/media/report-images"
import { validateUploadedReportImage } from "@/lib/media/report-image-validation.server"
import { moderateReportText } from "@/lib/moderation/texto-determinista.server"

type MutationResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; requiereTitulo?: true; duplicado?: AvisoDuplicado }

/** Respuesta cuando falta la dirección: el formulario muestra el campo título y se reenvía. */
const MENSAJE_TITULO_SIN_DIRECCION =
  "No pudimos obtener la dirección de ese punto. Escribí un título para el reporte y volvé a enviarlo."

const MENSAJE_MISMO_PUNTO_PROPIO =
  "Ya reportaste este punto y tu reporte sigue abierto. Agregale una novedad o reemplazalo."

const MENSAJE_REEMPLAZO_INVALIDO = "Solo podés reemplazar tu reporte abierto de ese mismo lugar."

type DecisionDuplicado =
  | { permitido: true; reemplazaReporteId: number | null }
  | { permitido: false; error: string; duplicado?: AvisoDuplicado }

/**
 * Aplica la decisión de quien carga frente al posible duplicado encontrado en el servidor.
 * Un reporte propio a menos de 25 m solo admite reemplazo; el resto admite reemplazo (si es
 * propio) o la confirmación explícita de que es otro problema.
 *
 * @param coincidencia - Posible duplicado, o `null` si no hay ninguno.
 * @param confirmaDistinto - Quien carga confirmó que es otro problema.
 * @param reemplazaReporteId - Reporte propio que se pidió reemplazar.
 * @returns Si se puede crear y qué reporte eliminar después, o el error con el aviso a mostrar.
 */
function decidirDuplicado(
  coincidencia: CoincidenciaDuplicado | null,
  confirmaDistinto: boolean,
  reemplazaReporteId: number | null,
): DecisionDuplicado {
  if (reemplazaReporteId !== null) {
    const esPropia = coincidencia !== null && coincidencia.tipo !== "ajeno"
    return esPropia && coincidencia.reporte.id === reemplazaReporteId
      ? { permitido: true, reemplazaReporteId }
      : { permitido: false, error: MENSAJE_REEMPLAZO_INVALIDO }
  }

  if (!coincidencia) return { permitido: true, reemplazaReporteId: null }

  if (coincidencia.tipo === "propio_mismo_punto") {
    return { permitido: false, error: MENSAJE_MISMO_PUNTO_PROPIO, duplicado: aAvisoDuplicado(coincidencia) }
  }

  if (confirmaDistinto) return { permitido: true, reemplazaReporteId: null }

  return {
    permitido: false,
    error: `Ya hay un reporte parecido a ${coincidencia.metros} m. Si es el mismo problema, sumale una novedad; si no, confirmá que es otro.`,
    duplicado: aAvisoDuplicado(coincidencia),
  }
}

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
  /** Quien carga confirmó que no es el mismo problema que el reporte cercano. */
  confirmaDistinto?: boolean
  /** Reporte propio cercano que se elimina después de crear este. */
  reemplazaReporteId?: number | null
}

export type CreateReportWorkflowResult = {
  reportId: number
  /** Título con el que quedó guardado el reporte. */
  titulo: string
  imageUploaded: boolean
  imageModeration: ResultadoImagenReporte | null
  pointsAwarded: number
  isGuest: boolean
  /** Conservado por compatibilidad; los avisos se solicitan mediante acción posterior. */
  correosEnviados: string[]
  /** Reporte propio eliminado al reemplazarlo; `null` si no se pidió o no se pudo eliminar. */
  reporteReemplazadoId: number | null
  /** Calle y altura guardadas («Bolívar 1450, Posadas»); `null` si no se encontró. */
  direccion: string | null
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

  // El formulario ya avisó del duplicado; acá se vuelve a validar para que no se pueda saltear.
  const coincidencia = input.lat !== null && input.lon !== null
    ? await buscarDuplicado(supabase, { categoriaId: input.categoriaId, lat: input.lat, lon: input.lon, usuarioId: input.usuarioId })
    : null
  const decision = decidirDuplicado(coincidencia, input.confirmaDistinto === true, input.reemplazaReporteId ?? null)
  if (!decision.permitido) {
    return decision.duplicado
      ? { success: false, error: decision.error, duplicado: decision.duplicado }
      : { success: false, error: decision.error }
  }

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

  // El anterior se elimina solo si el nuevo quedó en pie: si la foto lo retiró, se conserva el viejo.
  let reporteReemplazadoId: number | null = null
  if (decision.reemplazaReporteId !== null && imageModeration?.estado !== "REJECTED") {
    const eliminado = await eliminarReportePropioWorkflow(supabase, decision.reemplazaReporteId, input.usuarioId)
    if (eliminado.success) reporteReemplazadoId = decision.reemplazaReporteId
    else console.error("No pudimos eliminar el reporte reemplazado:", eliminado.error)
  }

  if (imageModeration?.estado !== "REJECTED") {
    return {
      success: true,
      data: {
        reportId: reporte.id,
        titulo,
        imageUploaded,
        imageModeration,
        pointsAwarded,
        isGuest,
        correosEnviados: [],
        reporteReemplazadoId,
        direccion,
      },
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
      correosEnviados: [],
      reporteReemplazadoId,
      direccion,
    },
  }
}
