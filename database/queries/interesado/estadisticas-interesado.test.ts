import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { getEstadisticasInteresado, getEstadoPorCategoria, getReportesPorBarrio } from "./estadisticas-interesado"

const mocks = vi.hoisted(() => ({ contarReportesEnProgreso: vi.fn() }))

vi.mock("@/database/queries/cuadrillas", () => ({ contarReportesEnProgreso: mocks.contarReportesEnProgreso }))

// Every count query resolves to 4 reports, enough to tell the stats apart from their defaults.
const countQuery: object = new Proxy(
  {},
  {
    get(_target, method) {
      if (method === "then") return (resolve: (value: unknown) => void) => resolve({ count: 4, error: null })
      return () => countQuery
    },
  },
)
const supabase = { from: () => countQuery } as never

describe("getEstadisticasInteresado", () => {
  beforeEach(() => {
    mocks.contarReportesEnProgreso.mockReset().mockResolvedValue(3)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("does not count crew work in progress while crews are turned off", async () => {
    vi.stubEnv("CUADRILLAS_ENABLED", undefined)

    const stats = await getEstadisticasInteresado(supabase)

    expect(mocks.contarReportesEnProgreso).not.toHaveBeenCalled()
    expect(stats).toMatchObject({ totalReportes: 4, reportesPendientes: 4, reportesEnProgreso: 0 })
  })

  it("counts crew work in progress when crews are turned on", async () => {
    vi.stubEnv("CUADRILLAS_ENABLED", "true")

    const stats = await getEstadisticasInteresado(supabase)

    expect(stats.reportesEnProgreso).toBe(3)
  })
})

describe("getReportesPorBarrio", () => {
  afterEach(() => vi.restoreAllMocks())

  it("le pide a la base los totales por barrio y separa los que no caen en ninguno (#302)", async () => {
    const geometria = { type: "Polygon", coordinates: [[[-55.9, -27.4]]] }
    const rpc = vi.fn().mockResolvedValue({
      data: [
        { barrio_id: "centro", nombre: "Centro", total: 182, pendientes: 136, reparados: 26, ultimos_30_dias: 40, geojson: geometria },
        { barrio_id: null, nombre: null, total: 139, pendientes: 100, reparados: 24, ultimos_30_dias: 28, geojson: null },
        { barrio_id: "vacio", nombre: "Vacío", total: 0, pendientes: 0, reparados: 0, ultimos_30_dias: 0, geojson: geometria },
      ],
      error: null,
    })
    const from = vi.fn()

    const metricas = await getReportesPorBarrio({ rpc, from } as never)

    expect(rpc).toHaveBeenCalledWith("reportes_por_barrio")
    expect(from).not.toHaveBeenCalled()
    expect(metricas).toEqual({
      barrios: [
        { id: "centro", nombre: "Centro", total: 182, pendientes: 136, reparados: 26, ultimos30Dias: 40, geometria },
        { id: "vacio", nombre: "Vacío", total: 0, pendientes: 0, reparados: 0, ultimos30Dias: 0, geometria },
      ],
      sinBarrio: { total: 139, pendientes: 100, reparados: 24, ultimos30Dias: 28 },
    })
  })

  it("si la consulta falla devuelve todo en cero y el panel se muestra igual", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "caída" } })
    expect(await getReportesPorBarrio({ rpc } as never)).toEqual({
      barrios: [],
      sinBarrio: { total: 0, pendientes: 0, reparados: 0, ultimos30Dias: 0 },
    })
  })
})

describe("getEstadoPorCategoria", () => {
  afterEach(() => vi.restoreAllMocks())

  it("le pide a la base cada categoría repartida por estado (#302)", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        { categoria: "Bache", total: 74, pendientes: 62, defensoria: 3, reparados: 6, rechazados: 3, espera_promedio_dias: 90.2, pendientes_mas_90_dias: 32 },
        { categoria: "Agua", total: 2, pendientes: 0, defensoria: 0, reparados: 2, rechazados: 0, espera_promedio_dias: null, pendientes_mas_90_dias: 0 },
      ],
      error: null,
    })

    const categorias = await getEstadoPorCategoria({ rpc } as never)

    expect(rpc).toHaveBeenCalledWith("reportes_por_categoria_y_estado")
    expect(categorias).toEqual([
      { categoria: "Bache", total: 74, pendientes: 62, defensoria: 3, reparados: 6, rechazados: 3, esperaPromedioDias: 90.2, pendientesMas90Dias: 32 },
      { categoria: "Agua", total: 2, pendientes: 0, defensoria: 0, reparados: 2, rechazados: 0, esperaPromedioDias: null, pendientesMas90Dias: 0 },
    ])
  })

  it("si la consulta falla devuelve una lista vacía", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "caída" } })
    expect(await getEstadoPorCategoria({ rpc } as never)).toEqual([])
  })
})
