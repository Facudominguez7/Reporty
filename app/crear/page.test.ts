import { createElement } from "react"
import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"

import CrearPage from "./page"

describe("CrearPage", () => {
  it("offers report and lost-pet creation destinations", () => {
    const markup = renderToStaticMarkup(createElement(CrearPage))
    expect(markup).toContain('href="/reportes/nuevo"')
    expect(markup).toContain('href="/mascotas/nueva"')
    expect(markup).toContain("Crear reporte/incidencia")
    expect(markup).toContain("Cargar mascota perdida")
    expect(markup).toContain("<h1")
    expect(markup.match(/size-12 sm:size-28/g) ?? []).toHaveLength(2)
    expect(markup.match(/min-h-44/g) ?? []).toHaveLength(2)
    expect(markup.indexOf("size-12 sm:size-28")).toBeLessThan(markup.indexOf("Crear reporte/incidencia"))
    expect(markup).not.toContain("lucide-arrow-up-right")
    expect(markup).toContain('class="flex flex-1 items-stretch"')
    expect(markup).toContain("grid-rows-2")
    expect(markup).toContain("max-w-4xl")
    expect(markup).toContain("sm:max-w-none")
    expect(markup).toContain("sm:grid-rows-1 sm:grid-cols-2")
    expect(markup).toContain("Contá qué está pasando en tu zona")
    expect(markup).toContain("Ayudá a encontrar una mascota")
  })
})
