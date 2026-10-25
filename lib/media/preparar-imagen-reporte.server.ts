/** Decodificación completa y normalización confiable, exclusivamente en servidor. */
import "server-only"
import sharp from "sharp"
import { REPORT_IMAGE_MAX_BYTES, REPORT_IMAGE_MAX_DIMENSION, REPORT_IMAGE_MAX_BYTES_LABEL, REPORT_IMAGE_THUMBNAIL_MAX_DIMENSION, isAcceptedReportImageType } from "./report-images"
import { validateUploadedReportImage } from "./report-image-validation.server"

export type ImagenReportePreparada = { original: Buffer; miniatura: Buffer }

/** Rechaza entradas peligrosas antes de decodificar; elimina metadatos al recodificar. */
export async function prepararImagenReporte(archivo: File): Promise<ImagenReportePreparada> {
  if (archivo.size > REPORT_IMAGE_MAX_BYTES) throw new Error(`La imagen optimizada no puede superar los ${REPORT_IMAGE_MAX_BYTES_LABEL}.`)
  if (!isAcceptedReportImageType(archivo.type)) throw new Error("La imagen debe estar en formato JPG, PNG o WebP.")
  await validateUploadedReportImage(archivo)
  const bytes = Buffer.from(await archivo.arrayBuffer())
  const opciones = { limitInputPixels: REPORT_IMAGE_MAX_DIMENSION ** 2, failOn: "warning" as const, animated: true }
  const metadatos = await sharp(bytes, opciones).metadata()
  if ((metadatos.pages ?? 1) !== 1 || !metadatos.width || !metadatos.height || metadatos.width > REPORT_IMAGE_MAX_DIMENSION || metadatos.height > REPORT_IMAGE_MAX_DIMENSION) {
    throw new Error("La imagen optimizada supera las dimensiones permitidas.")
  }
  // La salida raw obliga a decodificar todos los píxeles antes de crear ambos derivados.
  const { data: pixeles, info } = await sharp(bytes, opciones).rotate().raw().toBuffer({ resolveWithObject: true })
  const base = sharp(pixeles, { raw: { width: info.width, height: info.height, channels: info.channels } })
  for (const calidad of [80, 65, 45, 25]) {
    const original = await base.clone().webp({ quality: calidad }).toBuffer()
    const miniatura = await base.clone().resize({ width: REPORT_IMAGE_THUMBNAIL_MAX_DIMENSION, height: REPORT_IMAGE_THUMBNAIL_MAX_DIMENSION, fit: "inside", withoutEnlargement: true }).webp({ quality: calidad }).toBuffer()
    if (original.length <= REPORT_IMAGE_MAX_BYTES && miniatura.length <= REPORT_IMAGE_MAX_BYTES) return { original, miniatura }
  }
  throw new Error("No pudimos optimizar la imagen a 100 KB.")
}
