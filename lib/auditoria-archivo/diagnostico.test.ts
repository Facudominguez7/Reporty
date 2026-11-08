import { describe, expect, it, vi } from "vitest"

import { GetObjectCommand, HeadBucketCommand, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3"

import type { ClienteR2 } from "./cliente-r2"
import { diagnosticarR2, RUTA_SONDA } from "./diagnostico"
import type { ConfiguracionArchivoAuditoria } from "./configuracion"

const configuracion: ConfiguracionArchivoAuditoria = {
  cuentaR2: "0123456789abcdef0123456789abcdef",
  accessKeyId: "abcdef0123456789abcdef0123456789",
  secretAccessKey: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  bucket: "reporty-audit-archive",
  diasRetencion: 180,
  limitePorLote: 1000,
  purgaHabilitada: false,
  endpoint: "https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com",
}

/** R2 falso que guarda lo que se sube y permite manipular lo que se lee. */
function r2Falso(opciones: { fallarSubida?: boolean; alterarLectura?: boolean; fallarBorrado?: boolean } = {}) {
  const objetos = new Map<string, Buffer>()
  const enviados: string[] = []
  const enviar = async (comando: unknown) => {
    enviados.push((comando as { constructor: { name: string } }).constructor.name)

    if (comando instanceof HeadBucketCommand) return {}
    if (comando instanceof PutObjectCommand) {
      if (opciones.fallarSubida) throw Object.assign(new Error("Denegado"), { name: "AccessDenied" })
      const entrada = comando.input as { Key: string; Body: Buffer }
      objetos.set(entrada.Key, Buffer.from(entrada.Body))
      return { ETag: '"ignorado"' }
    }
    if (comando instanceof GetObjectCommand) {
      const cuerpo = objetos.get((comando.input as { Key: string }).Key)
      if (!cuerpo) throw Object.assign(new Error("NotFound"), { name: "NotFound", $metadata: { httpStatusCode: 404 } })
      const bytes = opciones.alterarLectura ? Buffer.concat([cuerpo, Buffer.from("x")]) : cuerpo
      return { Body: { transformToByteArray: async () => bytes } }
    }
    if (comando instanceof DeleteObjectCommand) {
      if (opciones.fallarBorrado) throw Object.assign(new Error("Denegado"), { name: "AccessDenied" })
      objetos.delete((comando.input as { Key: string }).Key)
      return {}
    }
    return {}
  }

  return { cliente: { send: enviar } as unknown as ClienteR2, objetos, enviados }
}

describe("diagnosticarR2", () => {
  it("comprueba permiso de lectura y escritura y verifica el hash del objeto de prueba", async () => {
    const r2 = r2Falso()

    const resultado = await diagnosticarR2(r2.cliente, configuracion, () => 1_000)

    expect(resultado).toMatchObject({
      ok: true,
      bucket: "reporty-audit-archive",
      region: "auto",
      hashCoincide: true,
      sondaEliminada: true,
    })
    expect(resultado.latenciaMs).toBeGreaterThanOrEqual(0)
    expect(r2.enviados).toEqual(["HeadBucketCommand", "PutObjectCommand", "GetObjectCommand", "DeleteObjectCommand"])
    // La sonda no queda en el bucket.
    expect(r2.objetos.size).toBe(0)
    expect(RUTA_SONDA).toMatch(/^diagnostico\//)
  })

  it("falla cuando el token no puede escribir y no deja basura", async () => {
    const r2 = r2Falso({ fallarSubida: true })

    const resultado = await diagnosticarR2(r2.cliente, configuracion)

    expect(resultado.ok).toBe(false)
    expect(resultado.detalle).toMatch(/escritura|subida/i)
    expect(resultado.hashCoincide).toBe(false)
    expect(r2.objetos.size).toBe(0)
    // Nunca se imprime el secreto.
    expect(JSON.stringify(resultado)).not.toContain(configuracion.secretAccessKey)
  })

  it("detecta un objeto de prueba alterado al leerlo", async () => {
    const r2 = r2Falso({ alterarLectura: true })

    const resultado = await diagnosticarR2(r2.cliente, configuracion)

    expect(resultado.ok).toBe(false)
    expect(resultado.hashCoincide).toBe(false)
    expect(resultado.detalle).toMatch(/integridad|hash/i)
  })

  it("informa si la sonda no se pudo borrar, sin romper el diagnóstico", async () => {
    const r2 = r2Falso({ fallarBorrado: true })

    const resultado = await diagnosticarR2(r2.cliente, configuracion)

    expect(resultado.ok).toBe(true)
    expect(resultado.sondaEliminada).toBe(false)
    expect(resultado.detalle).toMatch(/sonda/i)
  })
})
