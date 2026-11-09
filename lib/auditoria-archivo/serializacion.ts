import "server-only"

import { createHash, timingSafeEqual } from "node:crypto"
import { gunzip, gzip } from "node:zlib"
import { promisify } from "node:util"
import { z } from "zod"

/**
 * Serialización, compresión e integridad del archivo de auditoría.
 *
 * Formato: JSON Lines comprimido con GZIP (`*.jsonl.gz`), una versión explícita
 * por archivo y SHA-256 calculado sobre los bytes comprimidos que se suben.
 */

const ejecutarGzip = promisify(gzip)
const ejecutarGunzip = promisify(gunzip)

/** Versión del formato de cada línea; viaja en el archivo y en cada evento. */
export const VERSION_FORMATO = 1
/** Tope de líneas por archivo: coincide con el lote máximo reclamable. */
export const LIMITE_LINEAS_JSONL = 5000
/** Tope de bytes descomprimidos al leer un archivo del bucket. */
export const LIMITE_DESCOMPRESION_BYTES = 64 * 1024 * 1024
/** Tope de bytes comprimidos que se aceptan al descargar un archivo. */
export const LIMITE_DESCARGA_BYTES = 32 * 1024 * 1024

/** Error de formato del archivo archivado (serialización, GZIP o validación). */
export class ErrorFormatoArchivado extends Error {
  constructor(detalle: string) {
    super(`Formato de archivo de auditoría inválido: ${detalle}.`)
    this.name = "ErrorFormatoArchivado"
  }
}

/** Evento de auditoría tal como vive en `public.audit_events`. */
export type EventoAuditoria = {
  id: number
  occurred_at: string
  actor_id: string | null
  report_id: number | null
  report_title: string | null
  action: string
}

/** Evento con la versión del formato que lo contiene. */
export type EventoArchivado = EventoAuditoria & { version: number }

const esquemaEvento = z.strictObject({
  id: z.number().int().positive(),
  occurred_at: z.string().refine((valor) => !Number.isNaN(Date.parse(valor)), "fecha inválida"),
  actor_id: z.string().uuid().nullable(),
  report_id: z.number().int().positive().nullable(),
  report_title: z.string().max(500).nullable(),
  action: z.string().min(1).max(64),
})

/**
 * Serializa los eventos como JSON Lines.
 *
 * El orden de las claves es fijo, así que el mismo lote produce siempre los
 * mismos bytes (y por lo tanto el mismo hash y la misma ruta de objeto).
 *
 * @throws {ErrorFormatoArchivado} si el lote está vacío o repite identificadores.
 */
export function serializarJsonl(eventos: EventoAuditoria[]): string {
  if (eventos.length === 0) throw new ErrorFormatoArchivado("el lote no puede estar vacío")

  const vistos = new Set<number>()
  const lineas = eventos.map((evento) => {
    if (vistos.has(evento.id)) throw new ErrorFormatoArchivado(`el evento ${evento.id} está repetido`)
    vistos.add(evento.id)

    const validado = esquemaEvento.safeParse(evento)
    if (!validado.success) {
      throw new ErrorFormatoArchivado(`el evento ${evento.id} no tiene la forma esperada`)
    }

    return JSON.stringify({
      version: VERSION_FORMATO,
      id: validado.data.id,
      occurred_at: validado.data.occurred_at,
      actor_id: validado.data.actor_id,
      report_id: validado.data.report_id,
      report_title: validado.data.report_title,
      action: validado.data.action,
    })
  })

  return `${lineas.join("\n")}\n`
}

/**
 * Separa la versión del resto de la línea: la versión se valida aparte para poder
 * dar un mensaje propio cuando el archivo viene de un formato desconocido.
 */
function restoSinVersion(crudo: object): Record<string, unknown> {
  const { version: _version, ...resto } = crudo as Record<string, unknown>
  return resto
}

/**
 * Reconstruye los eventos de un archivo JSON Lines y valida cada línea.
 *
 * @throws {ErrorFormatoArchivado} si hay líneas inválidas, versiones desconocidas
 * o más líneas que el límite aceptado.
 */
export function leerEventosJsonl(texto: string, limiteLineas: number = LIMITE_LINEAS_JSONL): EventoArchivado[] {
  if (typeof texto !== "string" || texto.trim() === "") {
    throw new ErrorFormatoArchivado("el archivo está vacío")
  }

  const lineas = texto.split("\n").filter((linea) => linea.trim() !== "")
  if (lineas.length > limiteLineas) {
    throw new ErrorFormatoArchivado(`el archivo supera el límite de ${limiteLineas} eventos`)
  }

  return lineas.map((linea, indice) => {
    let crudo: unknown
    try {
      crudo = JSON.parse(linea)
    } catch {
      throw new ErrorFormatoArchivado(`la línea ${indice + 1} no es JSON válido`)
    }

    if (typeof crudo !== "object" || crudo === null || !("version" in crudo)) {
      throw new ErrorFormatoArchivado(`la línea ${indice + 1} no declara la versión del formato`)
    }
    const version = (crudo as { version: unknown }).version
    if (version !== VERSION_FORMATO) {
      throw new ErrorFormatoArchivado(`la línea ${indice + 1} usa una versión de formato desconocida`)
    }

    const validado = esquemaEvento.safeParse(restoSinVersion(crudo))
    if (!validado.success) {
      throw new ErrorFormatoArchivado(`la línea ${indice + 1} no tiene la forma esperada`)
    }

    return { ...validado.data, version: VERSION_FORMATO }
  })
}

/** Comprime bytes con GZIP de forma determinística (sin marca de tiempo). */
export async function comprimirGzip(datos: Buffer): Promise<Buffer> {
  try {
    return await ejecutarGzip(datos, { level: 9 })
  } catch {
    throw new ErrorFormatoArchivado("no se pudo comprimir el lote")
  }
}

/**
 * Descomprime un archivo GZIP acotando la salida para no aceptar bombas de
 * descompresión ni objetos manipulados.
 */
export async function descomprimirGzip(datos: Buffer, limiteBytes: number = LIMITE_DESCOMPRESION_BYTES): Promise<Buffer> {
  try {
    return await ejecutarGunzip(datos, { maxOutputLength: limiteBytes })
  } catch {
    throw new ErrorFormatoArchivado("el contenido no es un GZIP válido o supera el límite permitido")
  }
}

/** Calcula el SHA-256 hexadecimal de los bytes comprimidos. */
export function calcularHashSha256(datos: Buffer): string {
  return createHash("sha256").update(datos).digest("hex")
}

/**
 * Compara el hash calculado con el esperado en tiempo constante.
 *
 * Un hash con formato inválido nunca coincide: no se lanza error para que el
 * llamador decida cómo tratarlo.
 */
export function verificarHash(datos: Buffer, esperado: string): boolean {
  if (typeof esperado !== "string" || !/^[a-f0-9]{64}$/.test(esperado)) return false
  const calculado = calcularHashSha256(datos)
  return timingSafeEqual(Buffer.from(calculado, "hex"), Buffer.from(esperado, "hex"))
}

/**
 * Cuenta los eventos de un archivo GZIP sin confiar en el nombre ni en el ETag.
 * Devuelve también el texto ya descomprimido para no descomprimir dos veces.
 */
export async function leerArchivoComprimido(
  datos: Buffer,
  limiteBytes: number = LIMITE_DESCOMPRESION_BYTES,
): Promise<{ texto: string; cantidad: number }> {
  const texto = (await descomprimirGzip(datos, limiteBytes)).toString("utf8")
  const cantidad = texto.split("\n").filter((linea) => linea.trim() !== "").length
  return { texto, cantidad }
}
