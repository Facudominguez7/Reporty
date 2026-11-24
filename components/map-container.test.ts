import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { expect, it, vi } from "vitest"

import { MapContainer } from "./map-container"

vi.mock("@/components/leaflet-map", () => ({ default: () => null }))

it("explica el aro en la misma leyenda, separado de la prioridad", () => {
  const html = renderToStaticMarkup(createElement(MapContainer, { reports: [] }))
  expect(html.match(/aria-label="Leyenda del mapa"/g)).toHaveLength(1)
  const leyenda = html.match(/<aside[^>]+>[\s\S]*?<\/aside>/)?.[0]
  expect(leyenda).toMatch(/<ul[^>]*>[\s\S]*Alta[\s\S]*Media[\s\S]*Baja[\s\S]*<\/ul>[\s\S]*Tomado por Defensoría/)
  expect(leyenda).not.toContain("Aro violeta y escudo")
})

it("no muestra la leyenda en Mascotas ni en mapas sin leyenda", () => {
  for (const props of [{ layer: "mascotas" as const }, { showLegend: false }]) {
    const html = renderToStaticMarkup(createElement(MapContainer, { reports: [], ...props }))
    expect(html).not.toContain('aria-label="Leyenda del mapa"')
    expect(html).not.toContain("Tomado por Defensoría")
  }
})
