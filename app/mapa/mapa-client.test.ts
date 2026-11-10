import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { AccesoDonarMapa, MAP_LAYER_OPTIONS, PetLayerError, shouldShowMascotasOnboarding } from "./mapa-client"

describe("map layer labels", () => {
  it("calls the report layer Incidentes", () => {
    expect(MAP_LAYER_OPTIONS[0]).toEqual(["reportes", "Incidentes"])
  })
})

describe("shouldShowMascotasOnboarding", () => {
  it("shows the guide only the first time the pet layer is selected", () => {
    expect(shouldShowMascotasOnboarding("mascotas", false)).toBe(true)
    expect(shouldShowMascotasOnboarding("mascotas", true)).toBe(false)
    expect(shouldShowMascotasOnboarding("reportes", false)).toBe(false)
  })
})

describe("PetLayerError", () => {
  it("shows pet query failures as a visible alert only when a failure exists", () => {
    const markup = renderToStaticMarkup(createElement(PetLayerError, { error: "pet read denied" }))
    expect(markup).toContain('role="alert"')
    expect(markup).toContain("No se pudieron cargar las mascotas: pet read denied")
    expect(renderToStaticMarkup(createElement(PetLayerError, { error: null }))).toBe("")
  })
})

describe("AccesoDonarMapa", () => {
  it("muestra el botón Donar arriba a la derecha, debajo de contactos y ayuda", () => {
    const markup = renderToStaticMarkup(createElement(AccesoDonarMapa))
    expect(markup).toContain("fixed right-2 top-[calc(4.25rem+env(safe-area-inset-top))]")
    expect(markup).toMatch(/<a [^>]*href="\/donar"[^>]*>(?:(?!<\/a>).)*Donar<\/a>/)
  })
})
