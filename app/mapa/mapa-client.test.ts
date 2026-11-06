import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { PetLayerError } from "./mapa-client"

describe("PetLayerError", () => {
  it("shows pet query failures as a visible alert only when a failure exists", () => {
    const markup = renderToStaticMarkup(createElement(PetLayerError, { error: "pet read denied" }))
    expect(markup).toContain('role="alert"')
    expect(markup).toContain("No se pudieron cargar las mascotas: pet read denied")
    expect(renderToStaticMarkup(createElement(PetLayerError, { error: null }))).toBe("")
  })
})
