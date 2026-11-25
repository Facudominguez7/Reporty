import type { SupabaseClient } from "@supabase/supabase-js"
import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { getBarriosDeReportes } from "./barrios"

/** Cliente falso: `rpc` responde lo indicado y registra con qué se llamó. */
function clienteFalso(respuesta: { data: unknown; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(respuesta)
  return { cliente: { rpc } as unknown as SupabaseClient, rpc }
}

describe("getBarriosDeReportes", () => {
  it("devuelve el barrio de cada reporte, nulo si cae fuera de todos", async () => {
    const { cliente, rpc } = clienteFalso({
      data: [{ reporte_id: 7, barrio: "Centro" }, { reporte_id: 9, barrio: null }],
      error: null,
    })

    const barrios = await getBarriosDeReportes(cliente, [7, 9])

    expect(rpc).toHaveBeenCalledWith("barrios_de_reportes", { ids: [7, 9] })
    expect(barrios.get(7)).toBe("Centro")
    expect(barrios.get(9)).toBeNull()
  })

  it("no consulta la base si no hay reportes", async () => {
    const { cliente, rpc } = clienteFalso({ data: [], error: null })

    expect((await getBarriosDeReportes(cliente, [])).size).toBe(0)
    expect(rpc).not.toHaveBeenCalled()
  })

  it("si la consulta falla, no rompe la pantalla: devuelve un mapa vacío", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    const { cliente } = clienteFalso({ data: null, error: { message: "boom" } })

    expect((await getBarriosDeReportes(cliente, [7])).size).toBe(0)
    expect(error).toHaveBeenCalled()
    error.mockRestore()
  })

  it("si el pedido lanza (por ejemplo, sin red), tampoco rompe la pantalla", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    const cliente = { rpc: vi.fn().mockRejectedValue(new Error("sin red")) } as unknown as SupabaseClient

    expect((await getBarriosDeReportes(cliente, [7])).size).toBe(0)
    error.mockRestore()
  })
})
