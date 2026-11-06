import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { GET } from "./route"

const mocks = vi.hoisted(() => ({ getMascotasListado: vi.fn() }))
vi.mock("@/database/queries/mascotas/listado", () => ({ getMascotasListado: mocks.getMascotasListado }))

beforeEach(() => mocks.getMascotasListado.mockReset().mockResolvedValue({ data: [{ id: 3 }], hasMore: true, error: null }))

describe("GET /api/mascotas", () => {
  it("forwards pet-only filters and pagination and returns a page", async () => {
    const response = await GET(new NextRequest("http://localhost/api/mascotas?tipo=gato&estadoMascota=encontrada&searchMascota=collar%25azul&offset=24&limite=12&estado=pendiente&categoria=bache"))
    expect(mocks.getMascotasListado).toHaveBeenCalledWith({ tipo: "gato", estado: "encontrada", search: "collar%azul", offset: 24, limite: 12 })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: [{ id: 3 }], hasMore: true })
  })

  it("returns a server error when the public query fails", async () => {
    mocks.getMascotasListado.mockResolvedValue({ data: [], hasMore: false, error: new Error("query failed") })
    const response = await GET(new NextRequest("http://localhost/api/mascotas"))
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: "Error al obtener mascotas" })
  })
})
