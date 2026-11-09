import "server-only"

/**
 * Rutas de objeto del archivo de auditoría dentro del bucket privado.
 *
 * La forma es parte del contrato: `audit/v1/{año}/{mes}/audit-{primerId}-{ultimoId}-{hashCorto}.jsonl.gz`.
 * Cualquier ruta que no la cumpla se rechaza antes de hablar con R2, lo que
 * también protege la descarga administrativa contra IDOR y traversal.
 */

/** Nombre del prefijo versionado dentro del bucket. */
export const PREFIJO_ARCHIVO = "audit"
/** Versión del layout de almacenamiento; subirla solo si cambia la forma. */
export const VERSION_RUTA = "v1"

/** Patrón exacto de una ruta válida; sin `..`, sin barras iniciales, sin query. */
export const PATRON_RUTA_ARCHIVO = /^audit\/v1\/\d{4}\/\d{2}\/audit-\d+-\d+-[a-f0-9]{16}\.jsonl\.gz$/

const PATRON_HASH = /^[a-f0-9]{64}$/

/** Error de ruta de objeto inválida. */
export class ErrorRutaArchivo extends Error {
  constructor(detalle: string) {
    super(`Ruta de archivo inválida: ${detalle}.`)
    this.name = "ErrorRutaArchivo"
  }
}

/**
 * Toma los primeros 16 caracteres hexadecimales de un SHA-256 para el nombre del
 * archivo: suficiente para hacer el nombre content-addressed sin dominar la ruta.
 */
export function hashCorto(hash: string): string {
  if (!PATRON_HASH.test(hash)) throw new ErrorRutaArchivo("el hash debe ser SHA-256 en hexadecimal minúscula")
  return hash.slice(0, 16)
}

/**
 * Construye la ruta determinística del archivo.
 *
 * El año y el mes salen del primer evento en UTC, y el nombre incluye el rango de
 * identificadores y el hash corto: dos reintentos del mismo contenido producen la
 * misma ruta, así que reintentar nunca duplica objetos.
 */
export function construirRutaArchivo(entrada: {
  primerId: number
  ultimoId: number
  primeraFecha: string
  hash: string
}): string {
  const { primerId, ultimoId, primeraFecha, hash } = entrada
  if (!Number.isSafeInteger(primerId) || primerId < 1 || !Number.isSafeInteger(ultimoId) || ultimoId < 1) {
    throw new ErrorRutaArchivo("los identificadores deben ser enteros positivos")
  }
  if (primerId > ultimoId) throw new ErrorRutaArchivo("el rango de identificadores está invertido")

  const fecha = new Date(primeraFecha)
  if (Number.isNaN(fecha.getTime())) throw new ErrorRutaArchivo("la fecha del primer evento no es válida")

  const anio = String(fecha.getUTCFullYear()).padStart(4, "0")
  const mes = String(fecha.getUTCMonth() + 1).padStart(2, "0")
  return `${PREFIJO_ARCHIVO}/${VERSION_RUTA}/${anio}/${mes}/audit-${primerId}-${ultimoId}-${hashCorto(hash)}.jsonl.gz`
}

/** Indica si la ruta respeta exactamente el contrato de almacenamiento. */
export function esRutaArchivoValida(ruta: string): boolean {
  return typeof ruta === "string" && PATRON_RUTA_ARCHIVO.test(ruta)
}

/**
 * Valida una ruta de objeto y la devuelve tal cual.
 *
 * @throws {ErrorRutaArchivo} si la ruta no cumple el contrato.
 */
export function validarRutaArchivo(ruta: string): string {
  if (!esRutaArchivoValida(ruta)) throw new ErrorRutaArchivo("la ruta no cumple el formato audit/v1/AAAA/MM/audit-*-*.jsonl.gz")
  return ruta
}

/** Nombre de archivo (sin prefijo) que se ofrece en la descarga administrativa. */
export function nombreDescarga(ruta: string): string {
  return validarRutaArchivo(ruta).split("/").pop() as string
}
