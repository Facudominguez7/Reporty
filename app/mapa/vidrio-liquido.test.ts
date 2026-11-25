import { readFileSync } from "node:fs"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { HowToUseDialog } from "@/components/how-to-use-dialog"

/** Lee un archivo fuente del proyecto. */
const leer = (ruta: string) => readFileSync(ruta, "utf8")

describe("Liquid Glass en los controles flotantes del mapa", () => {
  const css = leer("app/globals.css")
  const mapa = leer("app/mapa/mapa-client.tsx")

  it("centraliza el efecto en una sola clase con desenfoque y saturación", () => {
    expect(css).toMatch(/\.vidrio-liquido,\s*\.mapa-vidrio \.leaflet-control-zoom \{[^}]*backdrop-filter: blur\(14px\) saturate\(150%\)/)
    expect(css).toMatch(/@media \(prefers-reduced-transparency: reduce\), \(prefers-contrast: more\)/)
  })

  it("se aplica al selector de capa, la ayuda, los términos, la leyenda y cerca tuyo", () => {
    expect(mapa).toMatch(/className="vidrio-liquido[^"]*" role="group" aria-label="Capa del mapa"/)
    expect(mapa).toMatch(/className="vidrio-liquido relative transition-transform duration-300"/)
    expect(mapa.match(/<HowToUseDialog layer=\{layer\} className="vidrio-liquido" \/>/g)).toHaveLength(2)
    expect(mapa).toMatch(/href="\/terminos"\s*className="[^"]*vidrio-liquido/)
    expect(leer("components/map-container.tsx")).toMatch(/className="map-legend-card vidrio-liquido absolute bottom-/)
    expect(leer("components/map/panel-cercanos.tsx")).toMatch(/"vidrio-liquido pointer-events-auto border/)
  })

  it("no se aplica al botón Cómo usar del encabezado", () => {
    const encabezado = renderToStaticMarkup(createElement(HowToUseDialog))
    expect(encabezado).not.toContain("vidrio-liquido")
    expect(renderToStaticMarkup(createElement(HowToUseDialog, { className: "vidrio-liquido" }))).toContain("vidrio-liquido")
  })
})
