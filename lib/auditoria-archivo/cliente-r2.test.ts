import type { S3Client } from "@aws-sdk/client-s3"
import { HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3"
import { describe, expect, it, vi } from "vitest"

import type { ConfiguracionArchivoAuditoria } from "./configuracion"
import {
  ErrorArchivoAuditoria,
  ErrorIntegridadArchivo,
  comprobarConectividad,
  configuracionClienteR2,
  crearClienteR2,
  descargarArchivo,
  existeArchivo,
  subirArchivo,
  verificarArchivo,
} from "./cliente-r2"
import { calcularHashSha256 } from "./serializacion"

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
const ruta = "audit/v1/2025/11/audit-41-42-aaaaaaaaaaaaaaaa.jsonl.gz"
const contenido = Buffer.from([0x1f, 0x8b, 0x08, 0x00])
const hash = calcularHashSha256(contenido)

function errorAusente() {
  return Object.assign(new Error("NotFound"), { name: "NotFound", $metadata: { httpStatusCode: 404 } })
}

/**
 * Cliente falso: responde `HeadObject` según `existe` y consume `respuestas` en
 * orden para el resto de los comandos.
 */
function clienteFalso(opciones: { existe?: boolean; respuestas?: Array<unknown | Error> } = {}) {
  const pendientes = [...(opciones.respuestas ?? [])]
  const enviados: unknown[] = []
  const send = vi.fn(async (comando: unknown) => {
    enviados.push(comando)
    if (comando instanceof HeadObjectCommand) {
      if (!opciones.existe) throw errorAusente()
      return { ContentLength: contenido.length }
    }
    const respuesta = pendientes.shift()
    if (respuesta instanceof Error) throw respuesta
    return respuesta ?? {}
  })
  return { cliente: { send } as unknown as Pick<S3Client, "send">, send, enviados }
}

function comandoEnviado<T>(enviados: unknown[], tipo: new (...argumentos: never[]) => T): T | undefined {
  return enviados.find((comando) => comando instanceof tipo) as T | undefined
}

describe("configuracionClienteR2", () => {
  it("usa la región auto, el endpoint oficial y reintentos acotados", () => {
    const config = configuracionClienteR2(configuracion)

    expect(config.region).toBe("auto")
    expect(config.endpoint).toBe(configuracion.endpoint)
    expect(config.maxAttempts).toBe(3)
    expect(config.forcePathStyle).toBe(true)
    expect(config.credentials).toEqual({
      accessKeyId: configuracion.accessKeyId,
      secretAccessKey: configuracion.secretAccessKey,
    })
    expect(crearClienteR2(configuracion)).toBeTruthy()
  })

  it("no publica el bucket: el cliente no pide ACL públicos ni endpoints alternativos", () => {
    const config = configuracionClienteR2(configuracion)
    expect(JSON.stringify(config).includes("public-read")).toBe(false)
    expect(config.endpoint).toMatch(/^https:\/\/[a-f0-9]{32}\.r2\.cloudflarestorage\.com$/)
  })
})

describe("existeArchivo", () => {
  it("trata un 404 como ausencia y no propaga el error del SDK", async () => {
    const { cliente } = clienteFalso()
    await expect(existeArchivo(cliente, configuracion, ruta)).resolves.toBe(false)
  })

  it("rechaza rutas fuera del contrato antes de hablar con R2", async () => {
    const { send } = clienteFalso()
    await expect(existeArchivo({ send } as unknown as Pick<S3Client, "send">, configuracion, "../secreto.jsonl.gz"))
      .rejects.toThrow(/ruta/i)
    expect(send).not.toHaveBeenCalled()
  })
})

describe("subirArchivo", () => {
  it("sube el objeto a un bucket privado con su hash en los metadatos", async () => {
    const { cliente, enviados } = clienteFalso({ respuestas: [{ ETag: '"etag-falso"' }] })

    const resultado = await subirArchivo(cliente, configuracion, { ruta, contenido, hash })

    const comando = comandoEnviado(enviados, PutObjectCommand)
    expect(comando?.input).toMatchObject({
      Bucket: configuracion.bucket,
      Key: ruta,
      Body: contenido,
      ContentType: "application/gzip",
      CacheControl: "no-store",
      Metadata: { sha256: hash },
    })
    expect(comando?.input.ACL).toBeUndefined()
    expect(resultado).toEqual({ ruta, tamano: contenido.length, hash, yaExistia: false })
  })

  it("no vuelve a subir un objeto que ya existe con el mismo nombre: el reintento no duplica", async () => {
    const { cliente, enviados } = clienteFalso({ existe: true })

    const resultado = await subirArchivo(cliente, configuracion, { ruta, contenido, hash })

    expect(enviados).toHaveLength(1)
    expect(resultado.yaExistia).toBe(true)
  })

  it("envuelve el error de R2 sin filtrar credenciales y sin borrar nada", async () => {
    const { cliente } = clienteFalso({ respuestas: [new Error(`AccessDenied ${configuracion.secretAccessKey}`)] })

    let capturado: unknown
    try {
      await subirArchivo(cliente, configuracion, { ruta, contenido, hash })
    } catch (error) {
      capturado = error
    }

    expect(capturado).toBeInstanceOf(ErrorArchivoAuditoria)
    expect((capturado as Error).message).not.toContain(configuracion.secretAccessKey)
    expect((capturado as ErrorArchivoAuditoria).codigo).toBe("subida")
  })
})

describe("descargarArchivo", () => {
  it("devuelve el cuerpo del objeto como bytes", async () => {
    const { cliente } = clienteFalso({ respuestas: [{ Body: { transformToByteArray: async () => contenido } }] })
    await expect(descargarArchivo(cliente, configuracion, ruta)).resolves.toEqual(contenido)
  })

  it("acepta un cuerpo en streaming sin cargarlo de una sola vez", async () => {
    async function* partes() {
      yield contenido.subarray(0, 2)
      yield contenido.subarray(2)
    }
    const { cliente } = clienteFalso({ respuestas: [{ Body: { [Symbol.asyncIterator]: partes } }] })

    await expect(descargarArchivo(cliente, configuracion, ruta)).resolves.toEqual(contenido)
  })

  it("falla con un error de verificación cuando el objeto no tiene cuerpo", async () => {
    const { cliente } = clienteFalso({ respuestas: [{}] })
    await expect(descargarArchivo(cliente, configuracion, ruta)).rejects.toBeInstanceOf(ErrorArchivoAuditoria)
  })
})

describe("verificarArchivo", () => {
  it("confirma la integridad comparando el hash del objeto descargado, no el ETag", async () => {
    const { cliente } = clienteFalso({
      respuestas: [{ Body: { transformToByteArray: async () => contenido }, ETag: '"no-confiable"' }],
    })

    await expect(verificarArchivo(cliente, configuracion, { ruta, hashEsperado: hash }))
      .resolves.toEqual({ ok: true, hash, cantidad: null })
  })

  it("rechaza un objeto con hash distinto y no lo deja confirmar", async () => {
    const { cliente } = clienteFalso({ respuestas: [{ Body: { transformToByteArray: async () => Buffer.from("otra cosa") } }] })

    await expect(verificarArchivo(cliente, configuracion, { ruta, hashEsperado: hash }))
      .rejects.toBeInstanceOf(ErrorIntegridadArchivo)
  })

  it("rechaza un archivo con menos eventos que los reclamados", async () => {
    const { comprimirGzip } = await import("./serializacion")
    const comprimido = await comprimirGzip(Buffer.from('{"version":1}\n{"version":1}\n'))
    const { cliente } = clienteFalso({
      respuestas: [{ Body: { transformToByteArray: async () => comprimido } }],
    })

    await expect(verificarArchivo(cliente, configuracion, {
      ruta,
      hashEsperado: calcularHashSha256(comprimido),
      cantidadEsperada: 3,
    })).rejects.toBeInstanceOf(ErrorIntegridadArchivo)
  })
})

describe("comprobarConectividad", () => {
  it("informa el bucket y la región sin usar un objeto sensible", async () => {
    const { cliente, enviados } = clienteFalso({ respuestas: [{}] })

    await expect(comprobarConectividad(cliente, configuracion)).resolves.toEqual({
      ok: true,
      bucket: "reporty-audit-archive",
      region: "auto",
    })
    expect(enviados).toHaveLength(1)
  })

  it("devuelve un fallo operativo en lugar de romper el panel", async () => {
    const { cliente } = clienteFalso({ respuestas: [Object.assign(new Error("NoSuchBucket"), { name: "NoSuchBucket" })] })

    await expect(comprobarConectividad(cliente, configuracion)).resolves.toMatchObject({
      ok: false,
      bucket: "reporty-audit-archive",
    })
  })
})
