/** Reglas puras para detectar reportes parecidos al cargar uno nuevo. */
import { describe, expect, it } from "vitest"

import {
  RADIO_DUPLICADO_METROS,
  aAvisoDuplicado,
  cajaDeBusqueda,
  clasificarDuplicado,
  distanciaEnMetros,
  type ReporteCercano,
} from "./duplicados"

const punto = { lat: -27.4313728, lon: -55.9460344 }

/**
 * Arma un reporte cercano desplazado hacia el este la cantidad de metros pedida.
 *
 * @param id - Identificador del reporte.
 * @param usuarioId - Autor del reporte.
 * @param metrosAlEste - Desplazamiento desde `punto`.
 */
function reporte(id: number, usuarioId: string, metrosAlEste: number): ReporteCercano {
  const lon = punto.lon + metrosAlEste / (111_320 * Math.cos((punto.lat * Math.PI) / 180))
  return { id, usuarioId, titulo: `Reporte ${id}`, descripcion: null, createdAt: "2026-11-14T16:29:31Z", lat: punto.lat, lon }
}

describe("distanciaEnMetros", () => {
  it("mide la distancia entre dos reportes reales de la calle 111", () => {
    const metros = distanciaEnMetros(punto, { lat: -27.4317441, lon: -55.9465761 })
    expect(metros).toBeGreaterThan(64)
    expect(metros).toBeLessThan(70)
  })
})

describe("clasificarDuplicado", () => {
  it("sin reportes a 100 m o menos no hay coincidencia", () => {
    expect(clasificarDuplicado([reporte(1, "otra", 101)], punto, "yo")).toBeNull()
  })

  it("un reporte ajeno a 100 m o menos es una coincidencia ajena", () => {
    const resultado = clasificarDuplicado([reporte(1, "otra", 40)], punto, "yo")
    expect(resultado).toMatchObject({ tipo: "ajeno", reporte: { id: 1 } })
    expect(resultado?.metros).toBe(40)
  })

  it("un reporte propio a menos de 25 m es el mismo punto", () => {
    expect(clasificarDuplicado([reporte(1, "yo", 8)], punto, "yo")).toMatchObject({ tipo: "propio_mismo_punto", metros: 8 })
  })

  it("un reporte propio entre 25 y 100 m es otro punto cercano", () => {
    expect(clasificarDuplicado([reporte(1, "yo", 25)], punto, "yo")).toMatchObject({ tipo: "propio_cerca", metros: 25 })
    expect(clasificarDuplicado([reporte(2, "yo", RADIO_DUPLICADO_METROS)], punto, "yo")).toMatchObject({ tipo: "propio_cerca" })
  })

  it("el reporte propio en el mismo punto gana aunque haya uno ajeno más cerca", () => {
    const resultado = clasificarDuplicado([reporte(1, "otra", 3), reporte(2, "yo", 12)], punto, "yo")
    expect(resultado).toMatchObject({ tipo: "propio_mismo_punto", reporte: { id: 2 } })
  })

  it("si no hay uno propio en el mismo punto, elige el más cercano", () => {
    const resultado = clasificarDuplicado([reporte(1, "yo", 60), reporte(2, "otra", 30)], punto, "yo")
    expect(resultado).toMatchObject({ tipo: "ajeno", reporte: { id: 2 } })
  })

  it("sin sesión ningún reporte cuenta como propio", () => {
    expect(clasificarDuplicado([reporte(1, "yo", 5)], punto, null)).toMatchObject({ tipo: "ajeno" })
  })

  it("ignora reportes sin coordenadas", () => {
    const sinUbicacion = { ...reporte(1, "otra", 5), lat: null, lon: null }
    expect(clasificarDuplicado([sinUbicacion], punto, "yo")).toBeNull()
  })
})

describe("aAvisoDuplicado", () => {
  it("no expone el autor ni las coordenadas del reporte existente", () => {
    const coincidencia = clasificarDuplicado([reporte(9, "otra", 40)], punto, "yo")
    expect(coincidencia && aAvisoDuplicado(coincidencia)).toEqual({
      tipo: "ajeno",
      metros: 40,
      reporte: { id: 9, titulo: "Reporte 9", descripcion: null, createdAt: "2026-11-14T16:29:31Z" },
    })
  })
})

describe("cajaDeBusqueda", () => {
  it("contiene todo punto a la distancia pedida", () => {
    const caja = cajaDeBusqueda(punto, 100)
    const borde = reporte(1, "otra", 100)
    expect(borde.lon).toBeLessThanOrEqual(caja.lonMax)
    expect(caja.latMin).toBeLessThan(punto.lat)
    expect(caja.latMax).toBeGreaterThan(punto.lat)
  })
})
