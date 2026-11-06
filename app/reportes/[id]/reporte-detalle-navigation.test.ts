import { createElement, type ReactElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { expect, it, vi } from "vitest"
import { ReporteDetalleClient, type ReporteDetalleInicial } from "./reporte-detalle-client"

const mocks = vi.hoisted(() => ({ back: vi.fn(), leading: null as ReactElement | null }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ back: mocks.back }) }))
vi.mock("@/components/report-detail/comments-section", () => ({ CommentsSection: () => null }))
vi.mock("@/components/page-title-bar", () => ({ PageTitleBar: ({ leading }: { leading: ReactElement }) => {
  mocks.leading = leading
  return leading
} }))

it("places the history back button in the report title bar", () => {
  const props = {
    reporte: {
      id: 5, titulo: "Reporte", descripcion: "Detalle", created_at: "2026-11-01T12:00:00Z",
      estado_id: 1, estados: { nombre: "Pendiente" }, categorias: { nombre: "Otros" },
      prioridades: { nombre: "Baja" }, fotos_reporte: [], lat: null, lon: null,
      votos: { noExiste: { count: 0, hasVoted: false }, reparado: { count: 0, hasVoted: false } },
    },
    currentUser: null, isAdmin: false, puedeContactar: false, puedeVotar: false,
    estados: [], categoriasDisponibles: [], prioridadesDisponibles: [], comentarios: [], historialEstados: [],
    fechaCambioEstado: null, gestionOperativa: null,
  } as ReporteDetalleInicial
  const html = renderToStaticMarkup(createElement(ReporteDetalleClient, props))
  expect(html.match(/aria-label="Volver"/g)).toHaveLength(1)
  expect(mocks.leading?.props).toMatchObject({ variant: "ghost", size: "icon" })
  ;(mocks.leading?.props as { onClick: () => void }).onClick()
  expect(mocks.back).toHaveBeenCalledOnce()
})
