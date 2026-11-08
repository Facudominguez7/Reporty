import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const ejecutarArchivado = vi.hoisted(() => vi.fn())
const crearDependenciasArchivado = vi.hoisted(() => vi.fn(() => ({ dependencias: true })))

vi.mock("@/lib/auditoria-archivo/datos-archivado", () => ({ crearDependenciasArchivado }))
vi.mock("@/lib/auditoria-archivo/servicio-archivado", () => ({ ejecutarArchivado }))

import { GET, POST } from "./route"

const secreto = "secreto-de-cron-con-mas-de-32-caracteres"
const resumen = {
  modo: "real",
  ok: true,
  elegibles: 2,
  previsualizacion: null,
  lote: null,
  archivo: null,
  verificado: false,
  purgado: 0,
  purgasPrevias: 0,
  duracionMs: 1,
  mensaje: "Lote archivado.",
  error: null,
  errores: [],
}

function pedido(metodo: "GET" | "POST", ruta = "https://reporty.com.ar/api/cron/auditoria-archivo", token?: string) {
  return new Request(ruta, {
    method: metodo,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  })
}

beforeEach(() => {
  ejecutarArchivado.mockReset()
  ejecutarArchivado.mockResolvedValue(resumen)
  crearDependenciasArchivado.mockClear()
  vi.stubEnv("AUDIT_ARCHIVE_CRON_SECRET", secreto)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("ejecución programada del archivo de auditoría", () => {
  it("rechaza el pedido sin token sin ejecutar nada", async () => {
    const respuesta = await POST(pedido("POST"))

    expect(respuesta.status).toBe(401)
    expect(await respuesta.json()).toEqual({ error: "No autorizado." })
    expect(ejecutarArchivado).not.toHaveBeenCalled()
  })

  it("rechaza un token incorrecto o de otra longitud", async () => {
    expect((await POST(pedido("POST", undefined, "otro-secreto-cualquiera"))).status).toBe(401)
    expect((await POST(pedido("POST", undefined, `${secreto}x`))).status).toBe(401)
    expect(ejecutarArchivado).not.toHaveBeenCalled()
  })

  it("responde 503 y no ejecuta cuando el secreto no está configurado", async () => {
    vi.stubEnv("AUDIT_ARCHIVE_CRON_SECRET", "")

    const respuesta = await POST(pedido("POST", undefined, secreto))

    expect(respuesta.status).toBe(503)
    expect(await respuesta.json()).toEqual({ error: "El archivo de auditoría no está configurado." })
    expect(ejecutarArchivado).not.toHaveBeenCalled()
  })

  it("GET autorizado siempre simula: no archiva ni elimina", async () => {
    const respuesta = await GET(pedido("GET", undefined, secreto))

    expect(respuesta.status).toBe(200)
    expect(ejecutarArchivado).toHaveBeenCalledWith(
      { modo: "dry-run", ejecutor: "cron", limite: undefined },
      { dependencias: true },
    )
    expect(respuesta.headers.get("cache-control")).toBe("no-store")
  })

  it("POST autorizado ejecuta la corrida real con el límite pedido", async () => {
    const respuesta = await POST(pedido("POST", "https://reporty.com.ar/api/cron/auditoria-archivo?limite=250", secreto))

    expect(respuesta.status).toBe(200)
    expect(ejecutarArchivado).toHaveBeenCalledWith(
      { modo: "real", ejecutor: "cron", limite: 250 },
      { dependencias: true },
    )
    expect(await respuesta.json()).toMatchObject({ ok: true })
  })

  it("ignora un límite inválido y deja el valor del entorno", async () => {
    await POST(pedido("POST", "https://reporty.com.ar/api/cron/auditoria-archivo?limite=abc", secreto))
    await POST(pedido("POST", "https://reporty.com.ar/api/cron/auditoria-archivo?limite=-5", secreto))

    for (const llamada of ejecutarArchivado.mock.calls) {
      expect(llamada[0].limite).toBeUndefined()
    }
  })

  it("informa 502 cuando la corrida no pudo completarse, sin filtrar detalles internos", async () => {
    ejecutarArchivado.mockResolvedValueOnce({ ...resumen, ok: false, error: "ErrorArchivoAuditoria: subida" })

    const respuesta = await POST(pedido("POST", undefined, secreto))
    const cuerpo = await respuesta.json()

    expect(respuesta.status).toBe(502)
    expect(cuerpo.ok).toBe(false)
    expect(JSON.stringify(cuerpo)).not.toMatch(/secret|accessKey/i)
  })

  it("informa 500 si la corrida lanza un error inesperado", async () => {
    ejecutarArchivado.mockRejectedValueOnce(Object.assign(new Error("boom"), { name: "ErrorConfiguracionArchivo" }))

    const respuesta = await POST(pedido("POST", undefined, secreto))

    expect(respuesta.status).toBe(500)
    expect(await respuesta.json()).toEqual({
      error: "La corrida del archivo no pudo ejecutarse.",
      detalle: "ErrorConfiguracionArchivo",
    })
  })
})
