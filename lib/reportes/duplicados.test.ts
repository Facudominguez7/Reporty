/** Reglas puras para detectar reportes parecidos al cargar uno nuevo. */
import { describe, expect, it } from "vitest"

import {
  RADIO_DUPLICADO_METROS,
  aAvisoDuplicado,
  clasificarDuplicado,
  distanciaEnMetros,
  type ReporteCercano,
} from "./duplicados"

const punto = { lat: -27.4313728, lon: -55.9460344 }

/**
 * Arma un reporte cercano tal como lo devuelve la base (#300), con la distancia ya medida por PostGIS.
 *
 * @param id - Identificador del reporte.
 * @param usuarioId - Autor del reporte.
 * @param metros - Distancia al punto del reporte nuevo, sin redondear.
 */
function reporte(id: number, usuarioId: string, metros: number): ReporteCercano {
  return { id, usuarioId, titulo: `Reporte ${id}`, descripcion: null, createdAt: "2026-11-14T16:29:31Z", metros }
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
    expect(clasificarDuplicado([reporte(1, "otra", 101)], "yo")).toBeNull()
  })

  it("un reporte ajeno a 100 m o menos es una coincidencia ajena", () => {
    const resultado = clasificarDuplicado([reporte(1, "otra", 40)], "yo")
    expect(resultado).toMatchObject({ tipo: "ajeno", reporte: { id: 1 } })
    expect(resultado?.metros).toBe(40)
  })

  it("un reporte propio a menos de 25 m es el mismo punto", () => {
    expect(clasificarDuplicado([reporte(1, "yo", 8)], "yo")).toMatchObject({ tipo: "propio_mismo_punto", metros: 8 })
  })

  it("un reporte propio entre 25 y 100 m es otro punto cercano", () => {
    expect(clasificarDuplicado([reporte(1, "yo", 25)], "yo")).toMatchObject({ tipo: "propio_cerca", metros: 25 })
    expect(clasificarDuplicado([reporte(2, "yo", RADIO_DUPLICADO_METROS)], "yo")).toMatchObject({ tipo: "propio_cerca" })
  })

  it("el reporte propio en el mismo punto gana aunque haya uno ajeno más cerca", () => {
    const resultado = clasificarDuplicado([reporte(1, "otra", 3), reporte(2, "yo", 12)], "yo")
    expect(resultado).toMatchObject({ tipo: "propio_mismo_punto", reporte: { id: 2 } })
  })

  it("si no hay uno propio en el mismo punto, elige el más cercano", () => {
    const resultado = clasificarDuplicado([reporte(1, "yo", 60), reporte(2, "otra", 30)], "yo")
    expect(resultado).toMatchObject({ tipo: "ajeno", reporte: { id: 2 } })
  })

  it("sin sesión ningún reporte cuenta como propio", () => {
    expect(clasificarDuplicado([reporte(1, "yo", 5)], null)).toMatchObject({ tipo: "ajeno" })
  })

  it("redondea al metro la distancia que mide la base", () => {
    expect(clasificarDuplicado([reporte(1, "yo", 24.4)], "yo")).toMatchObject({ tipo: "propio_mismo_punto", metros: 24 })
    expect(clasificarDuplicado([reporte(1, "yo", 24.6)], "yo")).toMatchObject({ tipo: "propio_cerca", metros: 25 })
    expect(clasificarDuplicado([reporte(1, "otra", 100.6)], "yo")).toBeNull()
  })
})

describe("aAvisoDuplicado", () => {
  it("no expone el autor del reporte existente", () => {
    const coincidencia = clasificarDuplicado([reporte(9, "otra", 40)], "yo")
    expect(coincidencia && aAvisoDuplicado(coincidencia)).toEqual({
      tipo: "ajeno",
      metros: 40,
      reporte: { id: 9, titulo: "Reporte 9", descripcion: null, createdAt: "2026-11-14T16:29:31Z" },
    })
  })
})
