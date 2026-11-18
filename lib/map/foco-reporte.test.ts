import { describe, expect, it } from "vitest"

import { leerFocoReporte, urlMapaConFoco } from "./foco-reporte"

describe("foco del mapa en un reporte", () => {
  it("ida y vuelta: la URL armada se lee como el mismo foco", () => {
    const url = urlMapaConFoco({ reporteId: 42, lat: -27.40855, lon: -55.94922 })
    expect(url).toBe("/mapa?reporte=42&lat=-27.40855&lon=-55.94922")
    const params = Object.fromEntries(new URL(url, "https://x.test").searchParams)
    expect(leerFocoReporte(params)).toEqual({ reporteId: 42, lat: -27.40855, lon: -55.94922 })
  })

  it("descarta parámetros faltantes, inválidos o fuera de rango", () => {
    expect(leerFocoReporte({})).toBeNull()
    expect(leerFocoReporte({ reporte: "42" })).toBeNull()
    expect(leerFocoReporte({ reporte: "abc", lat: "-27", lon: "-55" })).toBeNull()
    expect(leerFocoReporte({ reporte: "0", lat: "-27", lon: "-55" })).toBeNull()
    expect(leerFocoReporte({ reporte: "42", lat: "-127", lon: "-55" })).toBeNull()
    expect(leerFocoReporte({ reporte: "42", lat: "", lon: "-55" })).toBeNull()
  })
})
