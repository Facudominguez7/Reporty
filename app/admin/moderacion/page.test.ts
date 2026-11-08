import { createElement, type ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  listarImagenes: vi.fn(),
  listarReportes: vi.fn(),
  listarImpugnaciones: vi.fn(),
  listarEvidencias: vi.fn(),
  listarValidadas: vi.fn(),
  redirect: vi.fn(),
}))
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => createElement("a", { href, ...props }, children),
}))
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }))
vi.mock("@/app/dashboard/moderacion/cola-moderacion", () => ({
  ColaModeracion: ({ imagenes }: { imagenes: unknown[] }) => createElement("div", null, `cola-fotos:${imagenes.length}`),
}))
vi.mock("./cola-reportes", () => ({
  ColaRevisionesReportes: ({ revisiones }: { revisiones: unknown[] }) => createElement("div", null, `cola-reportes:${revisiones.length}`),
}))
vi.mock("./cola-reparaciones", () => ({
  ColaImpugnaciones: ({ impugnaciones }: { impugnaciones: unknown[] }) => createElement("div", null, `cola-impugnaciones:${impugnaciones.length}`),
  ColaEvidenciasEnVerificacion: ({ evidencias, umbral }: { evidencias: unknown[]; umbral: number }) => createElement("div", null, `cola-evidencias:${evidencias.length}:${umbral}`),
  ColaEvidenciasValidadas: ({ validadas, umbral }: { validadas: unknown[]; umbral: number }) => createElement("div", null, `cola-validadas:${validadas.length}:${umbral}`),
}))
vi.mock("@/lib/moderation/administracion.server", () => ({ listarImagenesAdministrativas: mocks.listarImagenes }))
vi.mock("@/lib/moderation/report-status-reviews.server", () => ({ listarRevisionesRechazoReportes: mocks.listarReportes }))
vi.mock("@/lib/moderation/evidencia-reparacion-admin.server", () => ({
  TAMANO_PAGINA_REPARACIONES: 20,
  listarImpugnacionesPendientes: mocks.listarImpugnaciones,
  listarEvidenciasEnVerificacion: mocks.listarEvidencias,
  listarEvidenciasValidadas: mocks.listarValidadas,
}))
vi.mock("@/lib/use-cases/reportes/evidencia-reparacion", () => ({ UMBRAL_CONFIRMACIONES_REPARACION: 3 }))

import AdminModeracionPage from "./page"

/** Renderiza la página del servidor con los parámetros de búsqueda pedidos. */
async function renderizar(params: Record<string, string> = {}) {
  return renderToStaticMarkup(await AdminModeracionPage({ searchParams: Promise.resolve(params) }))
}

const impugnacion = { verificacionId: "v-1", evidenciaId: "e-1", reporteId: 9, titulo: "Bache", comentario: "Reparado", motivo: "Sigue roto", creadoAt: "2026-11-01T10:00:00Z", confirmaciones: 1, impugnaciones: 1, impugnacionesPendientes: 1 }
const evidencia = { evidenciaId: "e-1", reporteId: 9, titulo: "Bache", comentario: "Reparado", publicadaAt: "2026-11-02T10:00:00Z", confirmaciones: 2, impugnaciones: 0, impugnacionesPendientes: 0 }
const validada = { ...evidencia, confirmaciones: 3 }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.listarImagenes.mockResolvedValue([])
  mocks.listarReportes.mockResolvedValue([])
  mocks.listarImpugnaciones.mockResolvedValue([])
  mocks.listarEvidencias.mockResolvedValue([])
  mocks.listarValidadas.mockResolvedValue([])
  mocks.redirect.mockImplementation((url: string) => { throw new Error(`redirect:${url}`) })
})

describe("pestañas existentes de Revisiones", () => {
  it("la vista por defecto sigue siendo la cola de fotos", async () => {
    const html = await renderizar()

    expect(mocks.listarImagenes).toHaveBeenCalledWith(0, false)
    expect(mocks.listarReportes).not.toHaveBeenCalled()
    expect(mocks.listarImpugnaciones).not.toHaveBeenCalled()
    expect(html).toContain("Revisión de fotografías")
    expect(html).toContain('href="/admin/moderacion" aria-current="page"')
  })

  it("la pestaña de reportes conserva su consulta y su paginación", async () => {
    mocks.listarReportes.mockResolvedValue(Array.from({ length: 20 }, (_, indice) => ({
      reporteId: indice + 1, titulo: `Reporte ${indice + 1}`, descripcion: null,
      reportCreatedAt: "2026-10-20T12:00:00Z", reviewCreatedAt: "2026-10-28T12:00:00Z", noExisteVotes: 5,
    })))

    const html = await renderizar({ tipo: "reportes", pagina: "1" })

    expect(mocks.listarReportes).toHaveBeenCalledWith(1)
    expect(mocks.listarImagenes).not.toHaveBeenCalled()
    expect(html).toContain("Revisión de reportes")
    expect(html).toContain("cola-reportes:20")
    expect(html).toContain('href="/admin/moderacion?tipo=reportes" aria-current="page"')
    expect(html).toContain('href="/admin/moderacion?tipo=reportes&amp;pagina=2"')
    expect(html).toContain('href="/admin/moderacion?tipo=reportes"')
  })
})

describe("tercera pestaña de reparaciones", () => {
  it("ofrece la pestaña Reparaciones y abre las impugnaciones pendientes por defecto", async () => {
    mocks.listarImpugnaciones.mockResolvedValue([impugnacion])

    const html = await renderizar({ tipo: "reparaciones" })

    expect(mocks.listarImpugnaciones).toHaveBeenCalledWith(0)
    expect(mocks.listarEvidencias).not.toHaveBeenCalled()
    expect(mocks.listarValidadas).not.toHaveBeenCalled()
    expect(mocks.listarImagenes).not.toHaveBeenCalled()
    expect(mocks.listarReportes).not.toHaveBeenCalled()
    expect(html).toContain('href="/admin/moderacion?tipo=reparaciones" aria-current="page"')
    expect(html).toContain("Impugnaciones pendientes")
    expect(html).toContain("cola-impugnaciones:1")
  })

  it("consulta solo las evidencias en verificación en su sub-vista", async () => {
    mocks.listarEvidencias.mockResolvedValue([evidencia])

    const html = await renderizar({ tipo: "reparaciones", vista: "evidencias" })

    expect(mocks.listarEvidencias).toHaveBeenCalledWith(0)
    expect(mocks.listarImpugnaciones).not.toHaveBeenCalled()
    expect(mocks.listarValidadas).not.toHaveBeenCalled()
    expect(html).toContain("cola-evidencias:1:3")
  })

  it("consulta las reparaciones validadas para poder revertirlas", async () => {
    mocks.listarValidadas.mockResolvedValue([validada])

    const html = await renderizar({ tipo: "reparaciones", vista: "validadas" })

    expect(mocks.listarValidadas).toHaveBeenCalledWith(0)
    expect(mocks.listarEvidencias).not.toHaveBeenCalled()
    expect(html).toContain("cola-validadas:1:3")
    expect(html).toContain("Reparaciones validadas")
  })

  it("pagina la sub-vista activa sin perder el tipo ni la vista", async () => {
    mocks.listarImpugnaciones.mockResolvedValue(Array.from({ length: 20 }, () => impugnacion))

    const html = await renderizar({ tipo: "reparaciones", pagina: "0" })

    expect(html).toContain('href="/admin/moderacion?tipo=reparaciones&amp;pagina=1"')

    mocks.listarEvidencias.mockResolvedValue(Array.from({ length: 20 }, () => evidencia))
    const conVista = await renderizar({ tipo: "reparaciones", vista: "evidencias" })
    expect(conVista).toContain('href="/admin/moderacion?tipo=reparaciones&amp;vista=evidencias&amp;pagina=1"')
  })
})

describe("acceso a la cola de reparaciones", () => {
  it("un rol sin permiso no ve la cola: la guarda redirige al mapa", async () => {
    mocks.listarImpugnaciones.mockRejectedValue(Object.assign(new Error("Operación no disponible"), { estado: 403 }))

    await expect(renderizar({ tipo: "reparaciones" })).rejects.toThrow("redirect:/mapa")
    expect(mocks.redirect).toHaveBeenCalledWith("/mapa")
  })

  it("una sesión vencida va al inicio de sesión", async () => {
    mocks.listarValidadas.mockRejectedValue(Object.assign(new Error("Operación no disponible"), { estado: 401 }))

    await expect(renderizar({ tipo: "reparaciones", vista: "validadas" })).rejects.toThrow("redirect:/auth")
  })
})
