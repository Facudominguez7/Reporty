/**
 * Chequeos estructurales de bytes de imagen que no dependen del decodificador: detectan
 * archivos truncados y formatos animados antes de enviar la imagen a procesar.
 * Recorren los bloques de cada formato, así que el texto dentro de los metadatos no cuenta,
 * y aceptan datos después del marcador de fin (algunas cámaras agregan bloques propios).
 */
import type { REPORT_IMAGE_ACCEPTED_TYPES } from "./report-images"

type TipoAceptado = (typeof REPORT_IMAGE_ACCEPTED_TYPES)[number]

type BloquesPng = { completo: boolean; animado: boolean }

/** Lee cuatro bytes como texto ASCII. */
function etiqueta(bytes: Uint8Array, desde: number) {
  return String.fromCharCode(bytes[desde], bytes[desde + 1], bytes[desde + 2], bytes[desde + 3])
}

/** Recorre los chunks PNG hasta IEND: `acTL` antes de `IDAT` marca un APNG. */
function recorrerPng(bytes: Uint8Array): BloquesPng {
  const vista = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let animado = false
  let posicion = 8
  while (posicion + 12 <= bytes.length) {
    const largo = vista.getUint32(posicion)
    const tipo = etiqueta(bytes, posicion + 4)
    const fin = posicion + 12 + largo
    if (fin > bytes.length) break
    if (tipo === "acTL") animado = true
    if (tipo === "IEND") return { completo: true, animado }
    posicion = fin
  }
  return { completo: false, animado }
}

/** Recorre los chunks RIFF de un WebP: un VP8X con el bit de animación o `ANIM`/`ANMF` lo marcan animado. */
function webpAnimado(bytes: Uint8Array) {
  const vista = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const finRiff = Math.min(bytes.length, vista.getUint32(4, true) + 8)
  let posicion = 12
  while (posicion + 8 <= finRiff) {
    const tipo = etiqueta(bytes, posicion)
    const largo = vista.getUint32(posicion + 4, true)
    if (tipo === "ANIM" || tipo === "ANMF") return true
    if (tipo === "VP8X" && (bytes[posicion + 8] & 0x02) !== 0) return true
    posicion += 8 + largo + (largo % 2)
  }
  return false
}

/** Indica si el JPEG tiene un fin de imagen (FFD9) después del inicio del escaneo (FFDA). */
function jpegCompleto(bytes: Uint8Array) {
  let inicioEscaneo = -1
  for (let i = 2; i + 1 < bytes.length; i += 1) {
    if (bytes[i] !== 0xff) continue
    if (inicioEscaneo === -1 && bytes[i + 1] === 0xda) inicioEscaneo = i
    else if (inicioEscaneo !== -1 && bytes[i + 1] === 0xd9) return true
  }
  return false
}

/** Indica si el archivo llega completo hasta su marcador de fin según el formato declarado. */
export function imagenCompleta(bytes: Uint8Array, tipo: TipoAceptado) {
  if (tipo === "image/jpeg") return jpegCompleto(bytes)
  if (tipo === "image/png") return recorrerPng(bytes).completo
  if (bytes.length < 12) return false
  const tamanoRiff = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(4, true)
  return bytes.length >= tamanoRiff + 8
}

/** Indica si la imagen declara más de un cuadro: APNG (`acTL`) o WebP animado. */
export function imagenAnimada(bytes: Uint8Array, tipo: TipoAceptado) {
  if (tipo === "image/png") return recorrerPng(bytes).animado
  if (tipo === "image/webp") return bytes.length >= 12 && webpAnimado(bytes)
  return false
}
