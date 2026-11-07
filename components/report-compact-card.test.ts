import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { expect, it } from "vitest"
import { ReportCompactCard } from "./report-compact-card"

it("keeps incident filters in its detail link", () => {
  const html = renderToStaticMarkup(createElement(ReportCompactCard, {
    id: 17, title: "Farola apagada", description: "Esquina", priority: "Alta", status: "Reparado",
    createdAt: "2026-11-01T12:00:00Z", image: null, category: "Alumbrado",
    returnTo: "/reportes?estado=Reparado&prioridad=Alta&search=farola",
  }))
  expect(html).toContain('href="/reportes/17?returnTo=%2Freportes%3Festado%3DReparado%26prioridad%3DAlta%26search%3Dfarola"')
})
