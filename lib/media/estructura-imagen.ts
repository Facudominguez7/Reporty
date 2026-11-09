/**
 * Chequeos estructurales de bytes de imagen que no dependen del decodificador: detectan
 * archivos truncados y formatos animados antes de enviar la imagen a procesar.
 */
import type { REPORT_IMAGE_ACCEPTED_TYPES } from "./report-images"

type TipoAceptado = (typeof REPORT_IMAGE_ACCEPTED_TYPES)[number]

const FIN_PNG = [0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82] as const

/** Busca una secuencia ASCII de cuatro letras a partir de `desde`. */
function contieneEtiqueta(bytes: Uint8Array, etiqueta: string, desde = 0, hasta = bytes.length) {
  const codigos = Array.from(etiqueta, (letra) => letra.charCodeAt(0))
  for (let i = desde; i + codigos.length <= hasta; i += 1) {
    if (codigos.every((codigo, j) => bytes[i + j] === codigo)) return i
  }
  return -1
}

/** Indica si el archivo llega completo hasta su marcador de fin según el formato declarado. */
export function imagenCompleta(bytes: Uint8Array, tipo: TipoAceptado) {
  if (tipo === "image/jpeg") {
    let fin = bytes.length
    while (fin > 2 && bytes[fin - 1] === 0x00) fin -= 1
    return fin >= 4 && bytes[fin - 2] === 0xff && bytes[fin - 1] === 0xd9
  }
  if (tipo === "image/png") {
    return bytes.length >= 12 && FIN_PNG.every((valor, i) => bytes[bytes.length - 8 + i] === valor)
  }
  if (bytes.length < 12) return false
  const tamanoRiff = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(4, true)
  return bytes.length >= tamanoRiff + 8
}

/** Indica si la imagen declara más de un cuadro: APNG (`acTL`) o WebP animado. */
export function imagenAnimada(bytes: Uint8Array, tipo: TipoAceptado) {
  if (tipo === "image/png") {
    const inicioDatos = contieneEtiqueta(bytes, "IDAT")
    return contieneEtiqueta(bytes, "acTL", 8, inicioDatos === -1 ? bytes.length : inicioDatos) !== -1
  }
  if (tipo === "image/webp") {
    const extendido = contieneEtiqueta(bytes, "VP8X", 12, 16) === 12
    if (extendido && (bytes[20] & 0x02) !== 0) return true
    return contieneEtiqueta(bytes, "ANIM", 12) !== -1 || contieneEtiqueta(bytes, "ANMF", 12) !== -1
  }
  return false
}
