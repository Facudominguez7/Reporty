import "server-only"

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3"

import type { ClienteR2 } from "./cliente-r2"
import type { ConfiguracionArchivoAuditoria } from "./configuracion"
import { calcularHashSha256, verificarHash } from "./serializacion"

/**
 * Diagnóstico de la conexión con Cloudflare R2.
 *
 * Sirve para validar credenciales, endpoint, permiso de escritura y verificación
 * de integridad **sin tocar el archivo de auditoría**: sube un objeto de sonda con
 * un prefijo propio, lo vuelve a leer, compara su hash y lo borra.
 *
 * Nunca informa credenciales ni el contenido de los objetos.
 */

/** Prefijo reservado para la sonda: no colisiona con `audit/v1/...`. */
export const RUTA_SONDA = "diagnostico/r2-check.json"

/** Resultado del diagnóstico, apto para consola y para el panel. */
export type DiagnosticoR2 = {
  ok: boolean
  bucket: string
  region: string
  latenciaMs: number
  /** El objeto de sonda se leyó con el mismo hash que se subió. */
  hashCoincide: boolean
  /** La sonda se borró al terminar (si no, hay que limpiarla a mano). */
  sondaEliminada: boolean
  detalle: string
}

function nombreTecnico(error: unknown): string {
  const nombre = (error as { name?: string })?.name
  return typeof nombre === "string" && nombre.length > 0 ? nombre : "ErrorDesconocido"
}

/**
 * Ejecuta el diagnóstico completo contra el bucket configurado.
 *
 * @param cliente cliente S3 de R2 (real o inyectado en pruebas).
 * @param configuracion configuración ya validada.
 * @param ahora reloj inyectable para medir la latencia en pruebas.
 */
export async function diagnosticarR2(
  cliente: ClienteR2,
  configuracion: ConfiguracionArchivoAuditoria,
  ahora: () => number = () => Date.now(),
): Promise<DiagnosticoR2> {
  const inicio = ahora()
  const sonda = Buffer.from(JSON.stringify({ proposito: "diagnostico", version: 1 }), "utf8")
  const hashEsperado = calcularHashSha256(sonda)
  const base = {
    bucket: configuracion.bucket,
    region: "auto",
    latenciaMs: 0,
    hashCoincide: false,
    sondaEliminada: false,
  }

  try {
    await cliente.send(new HeadBucketCommand({ Bucket: configuracion.bucket }))
  } catch (error) {
    return {
      ...base,
      ok: false,
      latenciaMs: ahora() - inicio,
      detalle: `No se pudo alcanzar el bucket (${nombreTecnico(error)}).`,
    }
  }

  try {
    await cliente.send(new PutObjectCommand({
      Bucket: configuracion.bucket,
      Key: RUTA_SONDA,
      Body: sonda,
      ContentType: "application/json",
      CacheControl: "no-store",
      Metadata: { sha256: hashEsperado, proposito: "diagnostico" },
    }))
  } catch (error) {
    return {
      ...base,
      ok: false,
      latenciaMs: ahora() - inicio,
      detalle: `El token no tiene permiso de escritura (${nombreTecnico(error)}).`,
    }
  }

  let contenido: Buffer
  try {
    const respuesta = await cliente.send(new GetObjectCommand({ Bucket: configuracion.bucket, Key: RUTA_SONDA }))
    const cuerpo = respuesta.Body as { transformToByteArray?: () => Promise<Uint8Array> } | undefined
    if (!cuerpo?.transformToByteArray) throw new Error("sin cuerpo")
    contenido = Buffer.from(await cuerpo.transformToByteArray())
  } catch (error) {
    return {
      ...base,
      ok: false,
      latenciaMs: ahora() - inicio,
      detalle: `El token no pudo leer el objeto de prueba (${nombreTecnico(error)}).`,
    }
  }

  const hashCoincide = verificarHash(contenido, hashEsperado)

  let sondaEliminada = true
  try {
    await cliente.send(new DeleteObjectCommand({ Bucket: configuracion.bucket, Key: RUTA_SONDA }))
  } catch {
    sondaEliminada = false
  }

  const latenciaMs = ahora() - inicio
  if (!hashCoincide) {
    return {
      ...base,
      latenciaMs,
      hashCoincide,
      sondaEliminada,
      ok: false,
      detalle: "La integridad del objeto de prueba no coincide; revisá el bucket y el token.",
    }
  }

  return {
    ...base,
    latenciaMs,
    hashCoincide,
    sondaEliminada,
    ok: true,
    detalle: sondaEliminada
      ? "Lectura, escritura e integridad verificadas."
      : `Lectura y escritura verificadas, pero la sonda quedó en el bucket: eliminala a mano (${RUTA_SONDA}).`,
  }
}
