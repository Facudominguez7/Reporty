import { describe, expect, it } from "vitest"

import { filtroBusquedaDefensoria } from "./filtro-defensoria"

/** Arma la expresión OR esperada para un valor ya citado. */
function esperado(citado: string) {
  return `titulo.imatch.${citado},direccion.imatch.${citado}`
}

describe("filtroBusquedaDefensoria", () => {
  it("devuelve vacío para una búsqueda en blanco", () => {
    expect(filtroBusquedaDefensoria("   ")).toBe("")
  })

  it("cita el texto común sin alterarlo", () => {
    expect(filtroBusquedaDefensoria("Calle Mitre")).toBe(esperado(`"Calle Mitre"`))
  })

  it("escapa los metacaracteres de regex para PostgREST", () => {
    expect(filtroBusquedaDefensoria("Av. (x)*")).toBe(esperado(String.raw`"Av\\. \\(x\\)\\*"`))
  })

  it("escapa la barra invertida en ambas capas", () => {
    expect(filtroBusquedaDefensoria(String.raw`a\b`)).toBe(esperado(String.raw`"a\\\\b"`))
  })

  it("escapa las comillas dobles una sola vez", () => {
    expect(filtroBusquedaDefensoria('dijo "hola"')).toBe(esperado(String.raw`"dijo \"hola\""`))
  })
})
