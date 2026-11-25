import { afterEach, describe, expect, it, vi } from "vitest"

import { RADIO_DUPLICADO_METROS } from "@/lib/reportes/duplicados"

import { buscarDuplicado, buscarReportesCercanos } from "./buscar-cercanos"

/** Fila tal como la devuelve `reportes_duplicados_cerca`, ya ordenada por distancia. */
const fila = (id: number, usuario_id: string, metros: number) => ({
  id,
  usuario_id,
  titulo: `Reporte ${id}`,
  descripcion: null,
  created_at: "2026-11-14T16:29:31",
  metros,
})

/** Cliente con solo `rpc`: la búsqueda ya no consulta la tabla `reportes` directamente. */
function clienteConRpc(respuesta: { data: unknown; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(respuesta)
  return { cliente: { rpc } as never, rpc }
}

const busqueda = { categoriaId: 1, lat: -27.4313728, lon: -55.9460344 }

afterEach(() => vi.restoreAllMocks())

describe("buscarReportesCercanos", () => {
  it("le pide a PostGIS los reportes a 100 m de la categoría, con la distancia medida", async () => {
    const { cliente, rpc } = clienteConRpc({ data: [fila(7, "otra", 20.4), fila(8, "yo", 89.6)], error: null })

    const cercanos = await buscarReportesCercanos(cliente, busqueda)

    expect(rpc).toHaveBeenCalledWith("reportes_duplicados_cerca", {
      lat: -27.4313728,
      lon: -55.9460344,
      categoria_id: 1,
      radio_m: RADIO_DUPLICADO_METROS,
    })
    expect(cercanos).toEqual([
      { id: 7, usuarioId: "otra", titulo: "Reporte 7", descripcion: null, createdAt: "2026-11-14T16:29:31", metros: 20.4 },
      { id: 8, usuarioId: "yo", titulo: "Reporte 8", descripcion: null, createdAt: "2026-11-14T16:29:31", metros: 89.6 },
    ])
  })

  it("lanza si la consulta falla", async () => {
    const { cliente } = clienteConRpc({ data: null, error: { message: "caída" } })
    await expect(buscarReportesCercanos(cliente, busqueda)).rejects.toThrow("No pudimos buscar reportes cercanos.")
  })
})

describe("buscarDuplicado", () => {
  it("clasifica con la distancia de la base: el propio a menos de 25 m gana", async () => {
    const { cliente } = clienteConRpc({ data: [fila(7, "otra", 3), fila(8, "yo", 12.2)], error: null })
    expect(await buscarDuplicado(cliente, { ...busqueda, usuarioId: "yo" })).toMatchObject({
      tipo: "propio_mismo_punto",
      reporte: { id: 8 },
      metros: 12,
    })
  })

  it("si la búsqueda falla devuelve null y se puede reportar igual", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const { cliente } = clienteConRpc({ data: null, error: { message: "caída" } })
    expect(await buscarDuplicado(cliente, { ...busqueda, usuarioId: "yo" })).toBeNull()
  })
})
