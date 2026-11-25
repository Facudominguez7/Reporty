import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

import { POST } from "./route"

const mocks = vi.hoisted(() => ({ buscarCercanos: vi.fn() }))
vi.mock("@/database/queries/mapa/cercanos", () => ({ buscarCercanos: mocks.buscarCercanos }))

/** Arma un pedido al endpoint con el cuerpo dado. */
function pedir(cuerpo: unknown) {
  return POST(
    new NextRequest("http://localhost/api/mapa/cerca", {
      method: "POST",
      body: typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo),
      headers: { "content-type": "application/json" },
    }),
  )
}

const cercanos = [
  { tipo: "reporte", id: 7, titulo: "Bache", metros: 90 },
  { tipo: "mascota", id: 3, titulo: "perro", metros: 200 },
]

beforeEach(() => {
  mocks.buscarCercanos.mockReset().mockResolvedValue({ data: cercanos, error: null })
})

describe("POST /api/mapa/cerca", () => {
  it("busca con la coordenada redondeada a 4 decimales y responde sin caché", async () => {
    const respuesta = await pedir({ lat: -27.367891, lon: -55.896449, radio: 500 })

    expect(mocks.buscarCercanos).toHaveBeenCalledWith({ lat: -27.3679, lon: -55.8964, radio: 500 })
    expect(respuesta.status).toBe(200)
    expect(respuesta.headers.get("Cache-Control")).toBe("no-store")
    expect(await respuesta.json()).toEqual({ cercanos })
  })

  it.each([
    ["fuera de Posadas", { lat: -34.6037, lon: -58.3816, radio: 500 }],
    ["con un radio menor que 100 m", { lat: -27.37, lon: -55.9, radio: 99 }],
    ["con un radio mayor que 2000 m", { lat: -27.37, lon: -55.9, radio: 2001 }],
    ["con un radio no entero", { lat: -27.37, lon: -55.9, radio: 500.5 }],
    ["sin radio", { lat: -27.37, lon: -55.9 }],
    ["con la latitud como texto", { lat: "-27.37", lon: -55.9, radio: 500 }],
    ["con un cuerpo que no es JSON", "lat=-27.37"],
  ])("responde 400 %s, sin consultar ni guardar caché", async (_caso, cuerpo) => {
    const respuesta = await pedir(cuerpo)

    expect(respuesta.status).toBe(400)
    expect(respuesta.headers.get("Cache-Control")).toBe("no-store")
    expect(mocks.buscarCercanos).not.toHaveBeenCalled()
  })

  it("responde 500 sin escribir la coordenada en los logs si falla la consulta", async () => {
    const consola = vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.buscarCercanos.mockResolvedValue({ data: [], error: { code: "57014", message: "canceling statement due to statement timeout" } })

    const respuesta = await pedir({ lat: -27.367891, lon: -55.896449, radio: 500 })

    expect(respuesta.status).toBe(500)
    expect(respuesta.headers.get("Cache-Control")).toBe("no-store")
    const escrito = JSON.stringify(consola.mock.calls)
    expect(escrito).toContain("57014")
    expect(escrito).not.toMatch(/27\.36|55\.89/)
    consola.mockRestore()
  })

  it("tampoco escribe la coordenada si la consulta lanza una excepción", async () => {
    const consola = vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.buscarCercanos.mockRejectedValue(new Error("fetch failed"))

    const respuesta = await pedir({ lat: -27.367891, lon: -55.896449, radio: 500 })

    expect(respuesta.status).toBe(500)
    expect(JSON.stringify(consola.mock.calls)).not.toMatch(/27\.36|55\.89/)
    consola.mockRestore()
  })
})
