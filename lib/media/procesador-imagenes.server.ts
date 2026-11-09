/** Decodificación y recodificación de imágenes con el binding IMAGES de Cloudflare Images. */
import "server-only"

/** Formato y dimensiones reales de una imagen, leídos por el decodificador. */
export type InfoImagen = { formato: string; ancho: number; alto: number }

/** Parámetros de una recodificación a WebP. Sin `ladoMaximo` se conserva el tamaño original. */
export type OpcionesWebp = { calidad: number; ladoMaximo?: number }

/** Operaciones de imagen que necesita la preparación de fotos de reportes y mascotas. */
export interface ProcesadorImagenes {
  /** Decodifica el encabezado y devuelve formato y dimensiones; falla si la imagen es inválida. */
  info(bytes: Uint8Array): Promise<InfoImagen>
  /** Decodifica la imagen completa y la recodifica a WebP estático, sin metadatos. */
  codificarWebp(bytes: Uint8Array, opciones: OpcionesWebp): Promise<Uint8Array>
}

type ManejadorImagen = {
  transform(opciones: { width?: number; height?: number; fit?: "scale-down" }): ManejadorImagen
  output(opciones: { format: "image/webp"; quality: number; anim: boolean }): Promise<{ response(): Response }>
}

/** Subconjunto del binding `IMAGES` de Workers que usa la app. */
export type BindingImagenes = {
  info(flujo: ReadableStream<Uint8Array>): Promise<{ format: string; fileSize?: number; width?: number; height?: number }>
  input(flujo: ReadableStream<Uint8Array>): ManejadorImagen
}

/** Convierte bytes en el flujo que espera el binding. */
function aFlujo(bytes: Uint8Array) {
  return new Blob([new Uint8Array(bytes)]).stream()
}

/**
 * Adapta el binding de Cloudflare Images al contrato `ProcesadorImagenes`.
 * La salida WebP descarta siempre todos los metadatos (EXIF, GPS) y aplica la rotación EXIF,
 * y `anim: false` garantiza un único cuadro estático.
 */
export function crearProcesadorCloudflare(binding: BindingImagenes): ProcesadorImagenes {
  return {
    async info(bytes) {
      const info = await binding.info(aFlujo(bytes))
      if (!info.width || !info.height) throw new Error("No pudimos leer las dimensiones de la imagen.")
      return { formato: info.format, ancho: info.width, alto: info.height }
    },
    async codificarWebp(bytes, { calidad, ladoMaximo }) {
      let manejador = binding.input(aFlujo(bytes))
      if (ladoMaximo) manejador = manejador.transform({ width: ladoMaximo, height: ladoMaximo, fit: "scale-down" })
      const resultado = await manejador.output({ format: "image/webp", quality: calidad, anim: false })
      return new Uint8Array(await resultado.response().arrayBuffer())
    },
  }
}

/** Obtiene el procesador del binding `IMAGES` del Worker en ejecución. */
export async function obtenerProcesadorImagenes(): Promise<ProcesadorImagenes> {
  const { getCloudflareContext } = await import("@opennextjs/cloudflare")
  const { env } = await getCloudflareContext({ async: true })
  const binding = (env as { IMAGES?: BindingImagenes }).IMAGES
  if (!binding) throw new Error("El procesamiento de imágenes no está disponible en este momento.")
  return crearProcesadorCloudflare(binding)
}
