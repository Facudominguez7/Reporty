import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"
import ReportesPage from "./page"

const calls = vi.hoisted(() => ({ reportes: vi.fn(), mascotas: vi.fn() }))
vi.mock("next/link", () => ({ default: ({ href, children, ...props }: { href: unknown; children: React.ReactNode }) =>
  React.createElement("a", { href: typeof href === "string" ? href : JSON.stringify(href), ...props }, children) }))
vi.mock("@/database/queries/reportes/get-reportes", () => ({
  getCategorias: async () => ({ data: [] }), getEstados: async () => ({ data: [] }), getPrioridades: async () => ({ data: [] }),
  getReportStatusCounts: async () => ({}), getReportCardData: calls.reportes,
}))
vi.mock("@/database/queries/mascotas/listado", () => ({ getMascotasListado: calls.mascotas }))
vi.mock("@/components/lista-reportes-client", () => ({ ListaReportesClient: () => React.createElement("div", { "data-testid": "incidents" }) }))
vi.mock("@/components/lista-mascotas-client", () => ({ ListaMascotasClient: () => React.createElement("div", { "data-testid": "pets" }) }))
vi.mock("@/components/filtros-mascotas", () => ({ FiltrosMascotas: () => React.createElement("div", { "data-testid": "pet-filters" }) }))
vi.mock("@/components/buscador-mascotas", () => ({ BuscadorMascotas: () => React.createElement("input", { "data-testid": "pet-search" }) }))
vi.mock("@/components/estado-mascotas", () => ({ EstadoMascotas: ({ search }: { search: string }) => React.createElement("nav", { "data-testid": "pet-status", "data-search": search }) }))
vi.mock("@/components/reportes-search", () => ({ ReportesSearch: ({ search }: { search: string }) => React.createElement("input", { "data-search": search }) }))
vi.mock("./estado-reportes", () => ({ EstadoReportes: ({ searchParams }: { searchParams: object }) => React.createElement("div", { "data-incident-filters": JSON.stringify(searchParams) }) }))
vi.mock("./reportes-client", () => ({ ReportesClientWrapper: () => null }))
vi.mock("@/components/page-title-bar", () => ({ PageTitleBar: ({ title, actions }: { title: string; actions?: React.ReactNode }) => React.createElement("header", null, React.createElement("h1", null, title), actions) }))

const incidentData = [{ id: 1, title: "Bache", description: "", category: "", priority: "", status: "Pendiente", location: "", author: "", createdAt: "", image: null, thumbnailImage: null }]
beforeEach(() => {
  calls.reportes.mockReset().mockResolvedValue({ data: incidentData, error: null, hasMore: false })
  calls.mascotas.mockReset().mockResolvedValue({ data: [{ id: 8 }], error: null, hasMore: false })
})

describe("/reportes publication tabs", () => {
  it("keeps the incident view and its current filters as the default", async () => {
    const params = { search: "bache", categoria: "otros", estado: "pendiente", prioridad: "alta" }
    const html = renderToStaticMarkup(await ReportesPage({ searchParams: Promise.resolve(params) }))
    expect(html).toContain("Incidentes reportados")
    expect(html).toContain("data-testid=\"incidents\"")
    expect(html).not.toContain("data-testid=\"pets\"")
    expect(html).toContain("data-incident-filters=\"{&quot;search&quot;:&quot;bache&quot;")
    expect(calls.reportes).toHaveBeenCalledWith(expect.objectContaining(params), { includeAuthors: false })
    expect(calls.mascotas).toHaveBeenCalledWith(expect.objectContaining({ tipo: undefined, estado: undefined }))
  })

  it("renders only the pet listing and keeps incident filters out of pet filters", async () => {
    const params = { vista: "mascotas", search: "bache", searchMascota: "collar azul", categoria: "otros", estado: "pendiente", prioridad: "alta", tipo: "gato", estadoMascota: "encontrada" }
    const html = renderToStaticMarkup(await ReportesPage({ searchParams: Promise.resolve(params) }))
    expect(html).toContain("Mascotas perdidas")
    expect(html).toContain("data-testid=\"pets\"")
    expect(html).toContain("data-testid=\"pet-status\"")
    expect(html.indexOf("data-testid=\"pet-filters\"")).toBeGreaterThan(html.indexOf("Mascotas perdidas"))
    expect(html.indexOf("data-testid=\"pet-filters\"")).toBeLessThan(html.indexOf("data-testid=\"pet-status\""))
    expect(html.indexOf("data-testid=\"pet-search\"")).toBeGreaterThan(html.indexOf("data-testid=\"pet-filters\""))
    expect(html.indexOf("data-testid=\"pet-search\"")).toBeLessThan(html.indexOf("data-testid=\"pet-status\""))
    expect(html.match(/data-testid=\"pet-filters\"/g)).toHaveLength(1)
    expect(html).not.toContain("data-testid=\"incidents\"")
    expect(calls.mascotas).toHaveBeenCalledWith(expect.objectContaining({ tipo: "gato", estado: "encontrada", search: "collar azul" }))
    expect(calls.reportes).toHaveBeenCalledWith(expect.objectContaining({ search: "bache", categoria: "otros", estado: "pendiente", prioridad: "alta" }), { includeAuthors: false })
    expect(calls.reportes.mock.calls[0][0]).not.toHaveProperty("tipo")
    expect(calls.reportes.mock.calls[0][0]).not.toHaveProperty("estadoMascota")
    expect(calls.reportes.mock.calls[0][0].search).toBe("bache")
    const petTab = html.match(/<a href="([^"]+)"[^>]*>Mascotas<\/a>/)?.[1]
    expect(petTab).toContain("&quot;search&quot;:&quot;bache&quot;")
    expect(petTab).toContain("&quot;tipo&quot;:&quot;gato&quot;")
    const incidentTab = html.match(/<a href="([^"]+)"[^>]*>Incidentes<\/a>/)?.[1]
    expect(incidentTab).toContain("&quot;estado&quot;:&quot;pendiente&quot;")
    expect(incidentTab).not.toContain("estadoMascota")
    expect(html).toContain("Incidentes")
    expect(html.indexOf("aria-label=\"Tipo de publicaciones\"")).toBeLessThan(html.indexOf("data-testid=\"pet-status\""))
    expect(html).toContain("rounded-[var(--radius-pill)]")
    expect(html).toContain("justify-center")
    expect(html).toContain("mx-auto")
  })
})
