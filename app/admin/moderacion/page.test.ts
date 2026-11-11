import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  listarImagenes: vi.fn(),
  listarReportes: vi.fn(),
  listarEvidencias: vi.fn(),
  listarValidadas: vi.fn(),
  redirect: vi.fn(),
}))

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }))
vi.mock("@/lib/moderation/administracion.server", () => ({ listarImagenesAdministrativas: mocks.listarImagenes }))
vi.mock("@/lib/moderation/report-status-reviews.server", () => ({ listarRevisionesRechazoReportes: mocks.listarReportes }))
vi.mock("@/lib/moderation/evidencia-reparacion-admin.server", () => ({
  TAMANO_PAGINA_REPARACIONES: 20,
  listarEvidenciasEnVerificacion: mocks.listarEvidencias,
  listarEvidenciasValidadas: mocks.listarValidadas,
}))
vi.mock("@/lib/use-cases/reportes/evidencia-reparacion", () => ({ UMBRAL_CONFIRMACIONES_REPARACION: 3 }))
vi.mock("./cola-reportes", () => ({ ColaRevisionesReportes: () => createElement("div", null, "cola-reportes") }))
vi.mock("./cola-reparaciones", () => ({
  ColaEvidenciasEnVerificacion: ({ evidencias }: { evidencias: unknown[] }) => createElement("div", null, `cola-evidencias:${evidencias.length}`),
  ColaEvidenciasValidadas: ({ validadas }: { validadas: unknown[] }) => createElement("div", null, `cola-validadas:${validadas.length}`),
}))

import AdminModeracionPage from "./page"

beforeEach(() => {
  vi.clearAllMocks()
  mocks.listarImagenes.mockResolvedValue([])
  mocks.listarReportes.mockResolvedValue([])
  mocks.listarEvidencias.mockResolvedValue([])
  mocks.listarValidadas.mockResolvedValue([])
})

async function renderizar(searchParams: Record<string, string> = {}) {
  return renderToStaticMarkup(await AdminModeracionPage({ searchParams: Promise.resolve(searchParams) }))
}

describe("cola administrativa de reparaciones", () => {
  it("abre en evidencias en verificación y no ofrece impugnaciones", async () => {
    const html = await renderizar({ tipo: "reparaciones" })

    expect(mocks.listarEvidencias).toHaveBeenCalledWith(0)
    expect(html).toContain("En verificación")
    expect(html).not.toContain("Impugnaciones")
    expect(html).not.toContain("Impugnaciones pendientes")
  })

  it("conserva la vista de reparaciones validadas", async () => {
    mocks.listarValidadas.mockResolvedValue([{}])
    const html = await renderizar({ tipo: "reparaciones", vista: "validadas" })

    expect(mocks.listarValidadas).toHaveBeenCalledWith(0)
    expect(html).toContain("cola-validadas:1")
  })
})
