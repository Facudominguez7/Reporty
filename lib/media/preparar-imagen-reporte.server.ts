/** Decodificación completa y normalización confiable, exclusivamente en servidor. */
import "server-only"
import { imagenAnimada, imagenCompleta } from "./estructura-imagen"
import { obtenerProcesadorImagenes, type ProcesadorImagenes } from "./procesador-imagenes.server"
import { REPORT_IMAGE_MAX_BYTES, REPORT_IMAGE_MAX_DIMENSION, REPORT_IMAGE_MAX_BYTES_LABEL, REPORT_IMAGE_THUMBNAIL_MAX_DIMENSION, isAcceptedReportImageType } from "./report-images"
import { validateUploadedReportImage } from "./report-image-validation.server"

export type ImagenReportePreparada = { original: Buffer; miniatura: Buffer }

/**
 * Rechaza entradas peligrosas antes de decodificar y recodifica a WebP sin metadatos.
 * El procesador por defecto es Cloudflare Images; se puede inyectar otro con el mismo contrato.
 */
export async function prepararImagenReporte(archivo: File, procesador?: ProcesadorImagenes): Promise<ImagenReportePreparada> {
  if (archivo.size > REPORT_IMAGE_MAX_BYTES) throw new Error(`La imagen optimizada no puede superar los ${REPORT_IMAGE_MAX_BYTES_LABEL}.`)
  if (!isAcceptedReportImageType(archivo.type)) throw new Error("La imagen debe estar en formato JPG, PNG o WebP.")
  await validateUploadedReportImage(archivo)
  const bytes = new Uint8Array(await archivo.arrayBuffer())
  if (!imagenCompleta(bytes, archivo.type)) throw new Error("La imagen está dañada o incompleta.")
  if (imagenAnimada(bytes, archivo.type)) throw new Error("La imagen no puede ser animada.")
  const imagenes = procesador ?? (await obtenerProcesadorImagenes())
  // El decodificador confirma las dimensiones reales; el encabezado ya se validó arriba.
  const info = await imagenes.info(bytes)
  if (info.ancho > REPORT_IMAGE_MAX_DIMENSION || info.alto > REPORT_IMAGE_MAX_DIMENSION) {
    throw new Error("La imagen optimizada supera las dimensiones permitidas.")
  }
  for (const calidad of [80, 65, 45, 25]) {
    const original = await imagenes.codificarWebp(bytes, { calidad })
    const miniatura = await imagenes.codificarWebp(bytes, { calidad, ladoMaximo: REPORT_IMAGE_THUMBNAIL_MAX_DIMENSION })
    if (original.length <= REPORT_IMAGE_MAX_BYTES && miniatura.length <= REPORT_IMAGE_MAX_BYTES) {
      return { original: Buffer.from(original), miniatura: Buffer.from(miniatura) }
    }
  }
  throw new Error("No pudimos optimizar la imagen a 100 KB.")
}
