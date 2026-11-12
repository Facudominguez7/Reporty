/** Pruebas del título automático «Categoría en Dirección». */
import { describe, expect, it } from "vitest"

import { CATEGORIA_OTROS_ID, TITULO_REPORTE_MAX, armarTituloReporte, requiereTituloManual } from "./titulo-automatico"

describe("armarTituloReporte", () => {
  it("une la categoría y la dirección", () => {
    expect(armarTituloReporte(1, "Félix de Azara 1202, Posadas")).toBe("Bache en Félix de Azara 1202, Posadas")
  })
  it("muestra con tildes las categorías guardadas sin ellas", () => {
    expect(armarTituloReporte(2, "Bolívar 1450, Posadas")).toBe("Semáforo en Bolívar 1450, Posadas")
    expect(armarTituloReporte(3, "Bolívar 1450, Posadas")).toBe("Árbol caído en Bolívar 1450, Posadas")
  })
  it("usa solo la categoría cuando no hay dirección", () => {
    expect(armarTituloReporte(4, null)).toBe("Alumbrado")
    expect(armarTituloReporte(4, "   ")).toBe("Alumbrado")
  })
  it("no arma título para Otros ni para categorías desconocidas", () => {
    expect(armarTituloReporte(CATEGORIA_OTROS_ID, "Bolívar 1450, Posadas")).toBeNull()
    expect(armarTituloReporte(99, "Bolívar 1450, Posadas")).toBeNull()
  })
  it("recorta direcciones largas al máximo del título", () => {
    const titulo = armarTituloReporte(8, "x".repeat(200))
    expect(titulo).toHaveLength(TITULO_REPORTE_MAX)
    expect(titulo?.endsWith("…")).toBe(true)
  })
})

describe("requiereTituloManual", () => {
  it("solo Otros pide título escrito", () => {
    expect(requiereTituloManual(CATEGORIA_OTROS_ID)).toBe(true)
    expect(requiereTituloManual(1)).toBe(false)
  })
})
