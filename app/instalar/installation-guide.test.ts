import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import AndroidPage from "./android/page"
import IosPage from "./ios/page"

describe("installation pages", () => {
  it.each([[AndroidPage, "Chrome", "Android", "Instalar"], [IosPage, "Safari", "iPhone", "Añadir a pantalla de inicio"]] as const)("shows platform-specific steps and navigation", (Page, browser, name, instruction) => {
    const html = renderToStaticMarkup(createElement(Page))
    expect(html).toContain(browser)
    expect(html).toContain(name)
    expect(html).toContain(instruction)
    expect(html.match(/<li /g)).toHaveLength(3)
    expect(html).toContain('href="/"')
    expect(html).toContain('href="/mapa"')
    expect(html).toContain("Explorar el mapa")
    expect(html).toContain("page-container")
    expect(html).toContain('aria-hidden="true"')
    expect(html).not.toContain("welcome-screen")
  })
})
