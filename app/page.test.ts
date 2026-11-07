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
})
