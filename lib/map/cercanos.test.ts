import { describe, expect, it } from "vitest"

import {
  RADIO_CERCANOS_INICIAL,
  RADIOS_CERCANOS,
  dentroDePosadas,
  describirDistancia,
  redondearCoordenada,
} from "./cercanos"

describe("reglas de cercanos", () => {
  it("ofrece radios de 300 m, 500 m y 1 km, y arranca en 500 m", () => {
    expect(RADIOS_CERCANOS).toEqual([300, 500, 1000])
    expect(RADIO_CERCANOS_INICIAL).toBe(500)
  })

  it("redondea la coordenada a 4 decimales", () => {
    expect(redondearCoordenada(-27.367891)).toBe(-27.3679)
    expect(redondearCoordenada(-55.896449)).toBe(-55.8964)
  })

  it("solo acepta puntos dentro de Posadas", () => {
    expect(dentroDePosadas(-27.37, -55.9)).toBe(true)
    expect(dentroDePosadas(-34.6, -58.38)).toBe(false)
    expect(dentroDePosadas(-27.31, -55.9)).toBe(false)
    expect(dentroDePosadas(Number.NaN, -55.9)).toBe(false)
  })

  it("describe la distancia en metros o en kilómetros", () => {
    expect(describirDistancia(87.4)).toBe("a 87 m")
    expect(describirDistancia(999.6)).toBe("a 1 km")
    expect(describirDistancia(1450)).toBe("a 1,5 km")
  })
})
