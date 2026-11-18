import { beforeEach, describe, expect, it, vi } from "vitest"

import MapaPage from "./page"

const mocks = vi.hoisted(() => ({
  getReportMapData: vi.fn(),
  getEstados: vi.fn(),
  getMascotasMapa: vi.fn(),
  capaCookie: { valor: undefined as string | undefined },
}))

vi.mock("./mapa-client", () => ({ MapaClient: () => null }))
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (nombre: string) => nombre === "reporty_capa" && mocks.capaCookie.valor ? { value: mocks.capaCookie.valor } : undefined }) }))
vi.mock("@/database/queries/mascotas/mapa", () => ({ getMascotasMapa: mocks.getMascotasMapa }))
vi.mock("@/database/queries/reportes/get-reportes", () => ({
  getReportMapData: mocks.getReportMapData,
  getCategorias: async () => ({ data: [] }),
  getEstados: mocks.getEstados,
  getPrioridades: async () => ({ data: [] }),
}))

describe("MapaPage", () => {
  beforeEach(() => {
    mocks.capaCookie.valor = undefined
    mocks.getReportMapData.mockReset().mockResolvedValue({ data: [], error: null })
    mocks.getMascotasMapa.mockReset().mockResolvedValue({ data: [], error: null })
  })

  it("loads only pending reports on the map, keeping the URL filters", async () => {
    await MapaPage({ searchParams: Promise.resolve({ search: "bache", categoria: "Baches" }) })

    expect(mocks.getReportMapData).toHaveBeenCalledWith({
      search: "bache",
      categoria: "Baches",
      estado: undefined,
      prioridad: undefined,
      limite: 100,
      soloPendientes: true,
    })
  })

  it("passes pet-query errors separately so they cannot replace incident data", async () => {
    mocks.getMascotasMapa.mockResolvedValue({ data: [], error: { message: "pet read denied" } })
    const page = await MapaPage({ searchParams: Promise.resolve({}) })
    expect(page.props.error).toBeNull()
    expect(page.props.petError).toBe("pet read denied")
  })

  it("does not offer a state filter, since every report on the map is pending", async () => {
    const page = await MapaPage({ searchParams: Promise.resolve({}) })

    expect(page.props.estados).toEqual([])
    expect(mocks.getEstados).not.toHaveBeenCalled()
  })

  it("opens with the last chosen layer", async () => {
    mocks.capaCookie.valor = "mascotas"
    const page = await MapaPage({ searchParams: Promise.resolve({}) })
    expect(page.props.capaInicial).toBe("mascotas")
    expect(page.props.focoReporte).toBeNull()
  })

  it("focuses the report from its detail and shows incidents even if pets were chosen", async () => {
    mocks.capaCookie.valor = "mascotas"
    const page = await MapaPage({ searchParams: Promise.resolve({ reporte: "42", lat: "-27.4", lon: "-55.9" }) })
    expect(page.props.capaInicial).toBe("reportes")
    expect(page.props.focoReporte).toEqual({ reporteId: 42, lat: -27.4, lon: -55.9 })
  })
})
