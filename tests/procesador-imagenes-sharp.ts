/**
 * Doble de prueba del procesador de Cloudflare Images implementado con sharp (solo devDependency).
 * Reproduce el contrato del binding: decodificación completa estricta, salida WebP estática,
 * sin metadatos, con rotación EXIF aplicada y miniatura `scale-down`.
 */
import sharp from "sharp"

import type { ProcesadorImagenes } from "@/lib/media/procesador-imagenes.server"

const opciones = { failOn: "warning" as const }

/** Procesador sharp con el mismo comportamiento observable que el binding IMAGES. */
export const procesadorImagenesSharp: ProcesadorImagenes = {
  async info(bytes) {
    const metadatos = await sharp(bytes, opciones).metadata()
    if (!metadatos.width || !metadatos.height) throw new Error("No pudimos leer las dimensiones de la imagen.")
    return { formato: `image/${metadatos.format}`, ancho: metadatos.width, alto: metadatos.height }
  },
  async codificarWebp(bytes, { calidad, ladoMaximo }) {
    let imagen = sharp(bytes, opciones).rotate()
    if (ladoMaximo) imagen = imagen.resize({ width: ladoMaximo, height: ladoMaximo, fit: "inside", withoutEnlargement: true })
    return new Uint8Array(await imagen.webp({ quality: calidad }).toBuffer())
  },
}
