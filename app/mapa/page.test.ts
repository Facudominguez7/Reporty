import { beforeEach, describe, expect, it, vi } from "vitest"

import MapaPage from "./page"

const mocks = vi.hoisted(() => ({
  cargarZonaMapa: vi.fn(),
  getEstados: vi.fn(),
  getMascotasMapa: vi.fn(),
  capaCookie: { valor: undefined as string | undefined },
}))

vi.mock("./mapa-client", () => ({ MapaClient: () => null }))
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (nombre: string) => nombre === "reporty_capa" && mocks.capaCookie.valor ? { value: mocks.capaCookie.valor } : undefined }) }))
vi.mock("@/database/queries/mascotas/mapa", () => ({ getMascotasMapa: mocks.getMascotasMapa }))
vi.mock("@/database/queries/reportes/mapa-por-zona", () => ({ cargarZonaMapa: mocks.cargarZonaMapa }))
vi.mock("@/database/queries/reportes/get-reportes", () => ({
  getCategorias: async () => ({ data: [] }),
  getEstados: mocks.getEstados,
  getPrioridades: async () => ({ data: [] }),
}))

describe("MapaPage", () => {
  beforeEach(() => {
    mocks.capaCookie.valor = undefined
    mocks.cargarZonaMapa.mockReset().mockResolvedValue({ data: { tipo: "puntos", reportes: [] }, error: null })
    mocks.getMascotasMapa.mockReset().mockResolvedValue({ data: [], error: null })
  })

  it("carga toda Posadas por zona, sin límite global, con los filtros de la URL (#281)", async () => {
    const contenido = { tipo: "puntos", reportes: [{ id: 42, status: "Reparado" }] }
    mocks.cargarZonaMapa.mockResolvedValue({ data: contenido, error: null })
    const pagina = await MapaPage({ searchParams: Promise.resolve({ search: "bache", categoria: "Baches" }) })

    expect(mocks.cargarZonaMapa).toHaveBeenCalledWith({
      zona: { oeste: -56.06, sur: -27.59, este: -55.6, norte: -27.32 },
      zoom: 13,
      filtros: { search: "bache", categoria: "Baches", estado: undefined, prioridad: undefined },
    })
    expect(pagina.props.contenidoInicial).toEqual(contenido)
    expect(pagina.props.error).toBeNull()
  })

  it("al llegar desde un reporte carga la zona de ese reporte, para poder abrir su popup", async () => {
    await MapaPage({ searchParams: Promise.resolve({ reporte: "42", lat: "-27.4", lon: "-55.9" }) })

    const { zona, zoom } = mocks.cargarZonaMapa.mock.calls[0][0]
    expect(zoom).toBe(17)
    expect(zona.oeste).toBeLessThan(-55.9)
    expect(zona.este).toBeGreaterThan(-55.9)
    expect(zona.sur).toBeLessThan(-27.4)
    expect(zona.norte).toBeGreaterThan(-27.4)
    expect(zona.este - zona.oeste).toBeLessThan(0.05)
  })

  it("si falla la carga de reportes muestra el error del mapa", async () => {
    mocks.cargarZonaMapa.mockResolvedValue({ data: { tipo: "puntos", reportes: [] }, error: new Error("sin conexión") })
    const pagina = await MapaPage({ searchParams: Promise.resolve({}) })

    expect(pagina.props.error).toBe("sin conexión")
  })

  it("passes pet-query errors separately so they cannot replace incident data", async () => {
    mocks.getMascotasMapa.mockResolvedValue({ data: [], error: { message: "pet read denied" } })
    const page = await MapaPage({ searchParams: Promise.resolve({}) })
    expect(page.props.error).toBeNull()
    expect(page.props.petError).toBe("pet read denied")
  })

  it("mantiene oculto el selector de estado en el mapa", async () => {
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
