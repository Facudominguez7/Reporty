import { createElement, type ReactElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { expect, it, vi } from "vitest"
import { ReporteDetalleClient, type ReporteDetalleInicial } from "./reporte-detalle-client"

const mocks = vi.hoisted(() => ({ back: vi.fn(), leading: null as ReactElement | null, returnTo: "/reportes?estado=Reparado&prioridad=Alta&search=farola" }))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: mocks.back }),
  useSearchParams: () => new URLSearchParams({ returnTo: mocks.returnTo }),
}))
vi.mock("@/components/report-detail/comments-section", () => ({ CommentsSection: () => null }))
vi.mock("@/components/page-title-bar", () => ({ PageTitleBar: ({ leading }: { leading: ReactElement }) => {
  mocks.leading = leading
  return leading
} }))

it("returns to the exact filtered report list from the title bar", () => {
  const props = {
    reporte: {
      id: 5, titulo: "Reporte", descripcion: "Detalle", created_at: "2026-11-01T12:00:00Z",
      usuario_id: "user", categoria_id: 1, prioridad_id: 1,
      estado_id: 1, estados: { id: 1, nombre: "Pendiente" }, categorias: { nombre: "Otros" },
      prioridades: { nombre: "Baja" }, fotos_reporte: [], lat: null, lon: null,
      votos: { noExiste: { count: 0, hasVoted: false }, reparado: { count: 0, hasVoted: false } },
    },
    currentUser: null, isAdmin: false, puedeContactar: false, puedeVotar: false,
    estados: [], categoriasDisponibles: [], prioridadesDisponibles: [], comentarios: [], historialEstados: [],
    fechaCambioEstado: null, gestionOperativa: null,
  } as ReporteDetalleInicial
  const html = renderToStaticMarkup(createElement(ReporteDetalleClient, props))
  expect(html.match(/aria-label="Volver"/g)).toHaveLength(1)
  expect(html).toContain('href="/reportes?estado=Reparado&amp;prioridad=Alta&amp;search=farola"')
  expect(mocks.leading?.props).toMatchObject({ asChild: true, variant: "ghost", size: "icon" })
  expect(mocks.back).not.toHaveBeenCalled()
})
