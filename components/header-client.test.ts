import { describe, expect, it, vi } from "vitest"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

import { HeaderClient } from "./header-client"

const path = vi.hoisted(() => ({ value: "/crear" }))
vi.mock("next/navigation", () => ({ usePathname: () => path.value }))

describe("HeaderClient create navigation", () => {
  it("routes Crear to the selection page and marks it active there", () => {
    const markup = renderToStaticMarkup(createElement(HeaderClient, { user: null }))
    expect(markup).toContain('href="/crear"')
    expect(markup).toContain('aria-current="page" aria-label="Crear"')
    expect(markup).toContain("size-[3.25rem]")
    expect(markup).toContain("border-2 border-secondary shadow-xl")
  })

  it("keeps Crear active on the existing report creation route", () => {
    path.value = "/reportes/nuevo"
    const markup = renderToStaticMarkup(createElement(HeaderClient, { user: null }))
    expect(markup).toContain('aria-current="page" aria-label="Crear"')
    path.value = "/crear"
  })

  it("keeps the global header without a back button on report details and other routes", () => {
    for (const route of ["/reportes/5", "/reportes/nuevo", "/crear"]) {
      path.value = route
      const markup = renderToStaticMarkup(createElement(HeaderClient, { user: null }))
      expect(markup).not.toContain('aria-label="Volver"')
      expect(markup).toContain('aria-label="Reporty, ir al inicio"')
    }
    path.value = "/crear"
  })

  it("muestra el botón Donar en el encabezado y lo marca activo en /donar", () => {
    path.value = "/reportes"
    const enReportes = renderToStaticMarkup(createElement(HeaderClient, { user: null }))
    expect(enReportes).toMatch(/<a [^>]*href="\/donar"[^>]*>(?:(?!<\/a>).)*Donar<\/a>/)
    expect(enReportes).not.toMatch(/<a (?=[^>]*href="\/donar")(?=[^>]*aria-current)/)
    path.value = "/donar"
    expect(renderToStaticMarkup(createElement(HeaderClient, { user: null }))).toMatch(/<a (?=[^>]*href="\/donar")(?=[^>]*aria-current="page")/)
    path.value = "/crear"
  })
})
