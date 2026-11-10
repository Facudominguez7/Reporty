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

  it("anuncia las apps móviles como próximas, sin enlaces a tiendas que todavía no existen", () => {
    const html = renderToStaticMarkup(createElement(HomePage))
    expect(html).toContain("Próximamente en Android y iOS")
    expect(html).toContain('data-plataforma="android"')
    expect(html).toContain('data-plataforma="ios"')
    expect(html).not.toContain("play.google.com")
    expect(html).not.toContain("apps.apple.com")
  })
})
