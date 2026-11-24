import { describe, expect, it, vi } from "vitest"

import { getReporteSeo } from "./seo"

const mocks = vi.hoisted(() => ({ leerFilaReporte: vi.fn() }))

vi.mock("server-only", () => ({}))
vi.mock("@/database/queries/reportes/[id]/get-reporte-detalle", () => ({
  leerFilaReporte: mocks.leerFilaReporte,
}))
vi.mock("@/utils/supabase/public", () => ({
  createPublicClient: () => {
    throw new Error("el SEO debe reutilizar la lectura del detalle, no hacer otra")
  },
}))

describe("getReporteSeo", () => {
  it("arma la metadata con la misma lectura de la fila que usa el detalle", async () => {
    mocks.leerFilaReporte.mockResolvedValue({
      data: {
        id: 7,
        titulo: "Bache",
        descripcion: "Grande",
        created_at: "2026-11-01T00:00:00Z",
        categorias: { nombre: "Calles" },
        estados: [{ id: 1, nombre: "Pendiente" }],
        fotos_reporte: [],
      },
      error: null,
    })

    const { reporte, error } = await getReporteSeo("7")

    expect(mocks.leerFilaReporte).toHaveBeenCalledWith("7")
    expect(error).toBeNull()
    expect(reporte).toEqual({
      id: 7,
      titulo: "Bache",
      descripcion: "Grande",
      created_at: "2026-11-01T00:00:00Z",
      categoria: "Calles",
      estado: "Pendiente",
      imageUrl: null,
    })
  })

  it("distingue un reporte que no existe de una lectura que falló", async () => {
    mocks.leerFilaReporte.mockResolvedValueOnce({ data: null, error: null })
    expect(await getReporteSeo("8")).toEqual({ reporte: null, error: null })

    mocks.leerFilaReporte.mockResolvedValueOnce({ data: null, error: { message: "caída" } })
    expect(await getReporteSeo("9")).toEqual({ reporte: null, error: { message: "caída" } })
  })

  it("no consulta nada con un id que no es numérico", async () => {
    mocks.leerFilaReporte.mockClear()
    expect(await getReporteSeo("abc")).toEqual({ reporte: null, error: null })
    expect(mocks.leerFilaReporte).not.toHaveBeenCalled()
  })
})
