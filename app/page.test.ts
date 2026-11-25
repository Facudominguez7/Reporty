import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import HomePage from "./page"

describe("HomePage", () => {
  it("introduces both city reports and lost-pet publications", () => {
    const html = renderToStaticMarkup(createElement(HomePage))
    expect(html).toContain("problemas de la ciudad")
    expect(html).toContain("mascotas perdidas")
    expect(html).toContain('href="/mapa"')
  })

  it("enlaza las guías de instalación sin anunciar tiendas inexistentes", () => {
    const html = renderToStaticMarkup(createElement(HomePage))
    expect(html).toContain('href="/instalar/android"')
    expect(html).toContain('href="/instalar/ios"')
    expect(html).toContain("Descargar Reporty")
    expect(html).toContain('data-plataforma="android"')
    expect(html).toContain('data-plataforma="ios"')
    expect(html).not.toContain("play.google.com")
    expect(html).not.toContain("apps.apple.com")
  })
})
