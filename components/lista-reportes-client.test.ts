import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { expect, it, vi } from "vitest"

const search = vi.hoisted(() => ({ query: "estado=Reparado&prioridad=Alta&search=farola" }))
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(search.query) }))
import { ListaReportesClient } from "./lista-reportes-client"

it("passes all active incident filters into each detail link", () => {
  const html = renderToStaticMarkup(createElement(ListaReportesClient, {
    initialReports: [{
      id: 17, title: "Farola apagada", description: "Esquina", category: "Alumbrado", priority: "Alta",
      status: "Reparado", location: "", author: "", createdAt: "2026-11-01T12:00:00Z", image: null,
      thumbnailImage: null,
    }], initialHasMore: false, variant: "compact",
  }))
  expect(html).toContain('href="/reportes/17?returnTo=%2Freportes%3Festado%3DReparado%26prioridad%3DAlta%26search%3Dfarola"')
})
