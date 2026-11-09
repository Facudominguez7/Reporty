import "server-only"

import {
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3"

import type { ConfiguracionArchivoAuditoria } from "./configuracion"
import { validarRutaArchivo } from "./rutas-objeto"
import { LIMITE_DESCARGA_BYTES, calcularHashSha256, descomprimirGzip, verificarHash } from "./serializacion"

/**
 * Cliente de Cloudflare R2 por su API compatible con S3.
 *
 * Reglas que este módulo garantiza:
 * - región `auto` y endpoint oficial por cuenta;
 * - bucket privado: nunca se pide ACL público;
 * - credenciales solo del entorno del servidor;
 * - reintentos acotados del SDK y errores envueltos sin filtrar credenciales
 *   ni cuerpos de respuesta.
 */

/** Códigos operativos de los errores del cliente; sirven para decidir sin logs. */
export type CodigoErrorArchivo = "consulta" | "subida" | "descarga" | "verificacion" | "conectividad"

/** Error operativo del cliente R2, con mensaje apto para logs. */
export class ErrorArchivoAuditoria extends Error {
  readonly codigo: CodigoErrorArchivo

  constructor(codigo: CodigoErrorArchivo, detalle: string) {
    super(`Archivo de auditoría (${codigo}): ${detalle}.`)
    this.name = "ErrorArchivoAuditoria"
    this.codigo = codigo
  }
}

/** El objeto remoto no coincide con lo que se subió: no se puede confirmar. */
export class ErrorIntegridadArchivo extends Error {
  constructor(detalle: string) {
    super(`Integridad del archivo de auditoría comprometida: ${detalle}.`)
    this.name = "ErrorIntegridadArchivo"
  }
}

/** Cliente mínimo que usan el servicio y las pruebas. */
export type ClienteR2 = Pick<S3Client, "send">

/** Cuerpo devuelto por `GetObjectCommand`. */
type CuerpoObjeto = {
  transformToByteArray?: () => Promise<Uint8Array>
  [Symbol.asyncIterator]?: () => AsyncIterator<Uint8Array>
}

/**
 * Configuración del `S3Client` para R2, separada para poder verificarla sin red.
 */
export function configuracionClienteR2(configuracion: ConfiguracionArchivoAuditoria): S3ClientConfig {
  return {
    region: "auto",
    endpoint: configuracion.endpoint,
    // R2 resuelve el bucket en el path: la misma URL sirve para cualquier bucket.
    forcePathStyle: true,
    credentials: {
      accessKeyId: configuracion.accessKeyId,
      secretAccessKey: configuracion.secretAccessKey,
    },
    // Reintentos acotados del SDK; el servicio además decide cuándo reintentar.
    maxAttempts: 3,
  }
}

/** Crea el cliente reutilizable de R2 a partir de la configuración validada. */
export function crearClienteR2(configuracion: ConfiguracionArchivoAuditoria): S3Client {
  return new S3Client(configuracionClienteR2(configuracion))
}

function esErrorAusente(error: unknown): boolean {
  const candidato = error as { name?: string; $metadata?: { httpStatusCode?: number } }
  return (
    candidato?.$metadata?.httpStatusCode === 404 ||
    candidato?.name === "NotFound" ||
    candidato?.name === "NoSuchKey" ||
    candidato?.name === "NoSuchBucket"
  )
}

/** Nombre técnico del error, sin mensaje ni cuerpo: no filtra credenciales. */
function nombreTecnico(error: unknown): string {
  const nombre = (error as { name?: string })?.name ?? (error as { Code?: string })?.Code
  return typeof nombre === "string" && nombre.length > 0 ? nombre : "ErrorDesconocido"
}

/**
 * Lee el cuerpo de un objeto acotando los bytes aceptados.
 *
 * Si el SDK expone el cuerpo como stream se recorre por partes; el total queda
 * acotado por `LIMITE_DESCARGA_BYTES` para no retener archivos arbitrarios.
 */
async function leerCuerpo(cuerpo: CuerpoObjeto | undefined, limiteBytes = LIMITE_DESCARGA_BYTES): Promise<Buffer> {
  if (!cuerpo) throw new ErrorArchivoAuditoria("descarga", "el objeto no tiene cuerpo")

  if (typeof cuerpo[Symbol.asyncIterator] === "function") {
    const partes: Buffer[] = []
    let total = 0
    for await (const parte of cuerpo as AsyncIterable<Uint8Array>) {
      const trozo = Buffer.from(parte)
      total += trozo.length
      if (total > limiteBytes) {
        throw new ErrorArchivoAuditoria("descarga", "el objeto supera el límite de descarga permitido")
      }
      partes.push(trozo)
    }
    return Buffer.concat(partes)
  }

  if (typeof cuerpo.transformToByteArray === "function") {
    const bytes = Buffer.from(await cuerpo.transformToByteArray())
    if (bytes.length > limiteBytes) {
      throw new ErrorArchivoAuditoria("descarga", "el objeto supera el límite de descarga permitido")
    }
    return bytes
  }

  throw new ErrorArchivoAuditoria("descarga", "el objeto no tiene cuerpo")
}

/**
 * Indica si el objeto ya existe en el bucket.
 *
 * Un objeto existente hace que el reintento de subida sea idempotente: el mismo
 * contenido produce la misma ruta, así que no se crean archivos duplicados.
 */
export async function existeArchivo(
  cliente: ClienteR2,
  configuracion: ConfiguracionArchivoAuditoria,
  ruta: string,
): Promise<boolean> {
  const clave = validarRutaArchivo(ruta)
  try {
    await cliente.send(new HeadObjectCommand({ Bucket: configuracion.bucket, Key: clave }))
    return true
  } catch (error) {
    if (esErrorAusente(error)) return false
    throw new ErrorArchivoAuditoria("consulta", `no se pudo consultar el objeto (${nombreTecnico(error)})`)
  }
}

/** Resultado de una subida idempotente. */
export type ResultadoSubida = {
  ruta: string
  tamano: number
  hash: string
  yaExistia: boolean
}

/**
 * Sube el archivo comprimido al bucket privado.
 *
 * No envía ACL: el bucket es privado y el objeto se sirve solo a través del
 * servidor. Si el objeto ya existe no se vuelve a subir.
 */
export async function subirArchivo(
  cliente: ClienteR2,
  configuracion: ConfiguracionArchivoAuditoria,
  entrada: { ruta: string; contenido: Buffer; hash: string },
): Promise<ResultadoSubida> {
  const clave = validarRutaArchivo(entrada.ruta)
  const tamano = entrada.contenido.length

  if (await existeArchivo(cliente, configuracion, clave)) {
    return { ruta: clave, tamano, hash: entrada.hash, yaExistia: true }
  }

  try {
    await cliente.send(new PutObjectCommand({
      Bucket: configuracion.bucket,
      Key: clave,
      Body: entrada.contenido,
      ContentType: "application/gzip",
      CacheControl: "no-store",
      Metadata: { sha256: entrada.hash, formattimestamp: "utc" },
    }))
  } catch (error) {
    throw new ErrorArchivoAuditoria("subida", `no se pudo subir el archivo (${nombreTecnico(error)})`)
  }

  return { ruta: clave, tamano, hash: entrada.hash, yaExistia: false }
}

/** Descarga un objeto del bucket y devuelve sus bytes comprimidos. */
export async function descargarArchivo(
  cliente: ClienteR2,
  configuracion: ConfiguracionArchivoAuditoria,
  ruta: string,
): Promise<Buffer> {
  const clave = validarRutaArchivo(ruta)
  try {
    const respuesta = await cliente.send(new GetObjectCommand({ Bucket: configuracion.bucket, Key: clave }))
    return await leerCuerpo(respuesta.Body as CuerpoObjeto | undefined)
  } catch (error) {
    if (error instanceof ErrorArchivoAuditoria) throw error
    throw new ErrorArchivoAuditoria("descarga", `no se pudo descargar el archivo (${nombreTecnico(error)})`)
  }
}

/** Resultado de la verificación de integridad de un objeto remoto. */
export type ResultadoVerificacion = {
  ok: true
  hash: string
  cantidad: number | null
}

/**
 * Verifica el objeto remoto descargándolo y recalculando su SHA-256.
 *
 * El ETag de R2 no se usa como checksum: para objetos multiparte ni siquiera es
 * el MD5 del contenido. Se compara el hash de los bytes descargados y, cuando se
 * pide, la cantidad de eventos dentro del GZIP.
 */
export async function verificarArchivo(
  cliente: ClienteR2,
  configuracion: ConfiguracionArchivoAuditoria,
  entrada: {
    ruta: string
    hashEsperado: string
    cantidadEsperada?: number | null
    contarEventos?: (texto: string) => number
  },
): Promise<ResultadoVerificacion> {
  const contenido = await descargarArchivo(cliente, configuracion, entrada.ruta)
  const hash = calcularHashSha256(contenido)

  if (!verificarHash(contenido, entrada.hashEsperado)) {
    throw new ErrorIntegridadArchivo("el archivo descargado no coincide con el hash registrado")
  }

  const necesitaCantidad = entrada.cantidadEsperada != null
  if (!necesitaCantidad && !entrada.contarEventos) {
    return { ok: true, hash, cantidad: null }
  }

  let cantidad: number | null = null
  try {
    const texto = (await descomprimirGzip(contenido)).toString("utf8")
    const contar = entrada.contarEventos ?? ((valor: string) => valor.split("\n").filter((linea) => linea.trim() !== "").length)
    cantidad = contar(texto)
  } catch (error) {
    if (error instanceof Error) {
      throw new ErrorIntegridadArchivo("el archivo descargado no es un GZIP legible")
    }
    throw error
  }

  if (entrada.cantidadEsperada != null && cantidad !== entrada.cantidadEsperada) {
    throw new ErrorIntegridadArchivo(
      `el archivo tiene ${cantidad} eventos y el lote reclamó ${entrada.cantidadEsperada}`,
    )
  }

  return { ok: true, hash, cantidad }
}

/** Estado de conectividad con el bucket privado. */
export type ResultadoConectividad = {
  ok: boolean
  bucket: string
  region: string
  detalle?: string
}

/**
 * Comprueba que las credenciales alcanzan el bucket configurado.
 *
 * Nunca lanza: el panel y el `dry-run` muestran el estado real en lugar de romper.
 */
export async function comprobarConectividad(
  cliente: ClienteR2,
  configuracion: ConfiguracionArchivoAuditoria,
): Promise<ResultadoConectividad> {
  try {
    await cliente.send(new HeadBucketCommand({ Bucket: configuracion.bucket }))
    return { ok: true, bucket: configuracion.bucket, region: "auto" }
  } catch (error) {
    return {
      ok: false,
      bucket: configuracion.bucket,
      region: "auto",
      detalle: `No se pudo alcanzar el bucket (${nombreTecnico(error)})`,
    }
  }
}
