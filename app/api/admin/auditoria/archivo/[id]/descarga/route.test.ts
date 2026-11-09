import { gzipSync } from "node:zlib"

import { beforeEach, describe, expect, it, vi } from "vitest"

const getUser = vi.hoisted(() => vi.fn())
const prepararDescargaArchivada = vi.hoisted(() => vi.fn())

vi.mock("@/utils/supabase/server", () => ({ createClient: async () => ({ auth: { getUser } }) }))
vi.mock("@/lib/auditoria-archivo/servicio-recuperacion", () => ({ prepararDescargaArchivada }))

import { GET } from "./route"

const usuario = { id: "00000000-0000-4000-8000-0000000000a1" }
const loteId = "11111111-1111-4111-8111-111111111111"
const contenido = gzipSync(Buffer.from('{"version":1}\n'))

function contexto(id: string) {
  return { params: Promise.resolve({ id }) }
}

beforeEach(() => {
  getUser.mockReset().mockResolvedValue({ data: { user: usuario } })
  prepararDescargaArchivada.mockReset()
})

describe("descarga administrativa de un lote archivado", () => {
  it("rechaza sin sesión y no consulta el lote", async () => {
    getUser.mockResolvedValueOnce({ data: { user: null } })

    const respuesta = await GET(new Request("https://reporty.com.ar/api/admin/auditoria/archivo/x/descarga"), contexto(loteId))

    expect(respuesta.status).toBe(401)
    expect(prepararDescargaArchivada).not.toHaveBeenCalled()
  })

  it("responde 403 cuando el rol no alcanza", async () => {
    prepararDescargaArchivada.mockResolvedValueOnce({ unauthorized: true, descarga: null, error: null })

    const respuesta = await GET(new Request("https://reporty.com.ar/api/admin/auditoria/archivo/x/descarga"), contexto(loteId))

    expect(respuesta.status).toBe(403)
    expect(await respuesta.json()).toEqual({ error: "No autorizado." })
  })

  it("responde 404 cuando el lote no existe o el identificador es inválido", async () => {
    prepararDescargaArchivada.mockResolvedValueOnce({ unauthorized: false, descarga: null, error: null })

    const respuesta = await GET(new Request("https://reporty.com.ar/api/admin/auditoria/archivo/x/descarga"), contexto("../../otro"))

    expect(respuesta.status).toBe(404)
    expect(prepararDescargaArchivada).toHaveBeenCalledWith(expect.anything(), usuario.id, "../../otro")
  })

  it("responde 502 cuando el objeto no se puede leer desde R2", async () => {
    prepararDescargaArchivada.mockResolvedValueOnce({
      unauthorized: false,
      descarga: null,
      error: new Error("Archivo de auditoría (descarga): no se pudo descargar el archivo (AccessDenied)."),
    })

    const respuesta = await GET(new Request("https://reporty.com.ar/api/admin/auditoria/archivo/x/descarga"), contexto(loteId))

    expect(respuesta.status).toBe(502)
    expect(await respuesta.json()).toEqual({ error: "No pudimos leer el lote archivado." })
  })

  it("entrega el .jsonl.gz como adjunto sin caché", async () => {
    prepararDescargaArchivada.mockResolvedValueOnce({
      unauthorized: false,
      descarga: {
        nombre: "audit-41-42-aaaaaaaaaaaaaaaa.jsonl.gz",
        contenido,
        tamano: contenido.length,
      },
      error: null,
    })

    const respuesta = await GET(new Request("https://reporty.com.ar/api/admin/auditoria/archivo/x/descarga"), contexto(loteId))

    expect(respuesta.status).toBe(200)
    expect(respuesta.headers.get("content-type")).toBe("application/gzip")
    expect(respuesta.headers.get("content-disposition")).toBe('attachment; filename="audit-41-42-aaaaaaaaaaaaaaaa.jsonl.gz"')
    expect(respuesta.headers.get("content-length")).toBe(String(contenido.length))
    expect(respuesta.headers.get("cache-control")).toBe("no-store, private")
    expect(respuesta.headers.get("x-content-type-options")).toBe("nosniff")
    expect(Buffer.from(await respuesta.arrayBuffer()).equals(contenido)).toBe(true)
  })
})
