import { beforeEach, describe, expect, it, vi } from "vitest"

import { buscarCercanos } from "./cercanos"

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock("server-only", () => ({}))
vi.mock("@/utils/supabase/public", () => ({ createPublicClient: () => ({ rpc: mocks.rpc }) }))

beforeEach(() => {
  mocks.rpc.mockReset().mockResolvedValue({
    data: [
      { tipo: "reporte", id: 7, titulo: "Bache", metros: 90.4 },
      { tipo: "mascota", id: 3, titulo: "perro", metros: 200 },
    ],
    error: null,
  })
})

describe("buscarCercanos", () => {
  it("llama a cerca_de por POST, con los estados del mapa, para que la coordenada no quede en la URL", async () => {
    await buscarCercanos({ lat: -27.3679, lon: -55.8964, radio: 500 })

    expect(mocks.rpc).toHaveBeenCalledTimes(1)
    const [funcion, parametros, opciones] = mocks.rpc.mock.calls[0]
    expect(funcion).toBe("cerca_de")
    expect(parametros).toEqual({ lat: -27.3679, lon: -55.8964, radio_m: 500, estados: [1, 4, 2] })
    // Con { get: true } PostgREST recibiría los parámetros en la URL, que queda en los logs.
    expect(opciones?.get).not.toBe(true)
  })

  it("devuelve los elementos con su tipo, id, título y metros", async () => {
    const { data, error } = await buscarCercanos({ lat: -27.3679, lon: -55.8964, radio: 500 })

    expect(error).toBeNull()
    expect(data).toEqual([
      { tipo: "reporte", id: 7, titulo: "Bache", metros: 90.4 },
      { tipo: "mascota", id: 3, titulo: "perro", metros: 200 },
    ])
  })

  it("descarta filas con un tipo desconocido y devuelve el error de la consulta", async () => {
    mocks.rpc.mockResolvedValue({ data: [{ tipo: "otro", id: 1, titulo: "x", metros: 1 }], error: null })
    expect((await buscarCercanos({ lat: -27.37, lon: -55.9, radio: 500 })).data).toEqual([])

    const fallo = { code: "57014", message: "timeout" }
    mocks.rpc.mockResolvedValue({ data: null, error: fallo })
    expect(await buscarCercanos({ lat: -27.37, lon: -55.9, radio: 500 })).toEqual({ data: [], error: fallo })
  })
})
