import { describe, expect, it } from "vitest"

import { resumirMetricas, tramoDeBarrio, TRAMOS_BARRIO } from "./metricas-barrios"

/** Categoría con los conteos que importan para el resumen. */
const categoria = (pendientes: number, espera: number | null, mas90: number, otros: Partial<{ defensoria: number; reparados: number; rechazados: number }> = {}) => {
  const defensoria = otros.defensoria ?? 0
  const reparados = otros.reparados ?? 0
  const rechazados = otros.rechazados ?? 0
  return {
    categoria: "X",
    total: pendientes + defensoria + reparados + rechazados,
    pendientes,
    defensoria,
    reparados,
    rechazados,
    esperaPromedioDias: espera,
    pendientesMas90Dias: mas90,
  }
}

const barrio = (nombre: string, total: number) => ({
  id: nombre.toLowerCase(),
  nombre,
  total,
  pendientes: 0,
  reparados: 0,
  ultimos30Dias: 0,
  geometria: null,
})

describe("tramoDeBarrio", () => {
  it("ubica cada total en su tramo del mapa: 0, 1 a 4, 5 a 9, 10 a 29 y 30 o más", () => {
    expect([0, 1, 4, 5, 9, 10, 29, 30, 182].map(tramoDeBarrio)).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4])
  })

  it("tiene una etiqueta por tramo para la leyenda", () => {
    expect(TRAMOS_BARRIO.map((tramo) => tramo.etiqueta)).toEqual(["Sin reportes", "1 a 4", "5 a 9", "10 a 29", "30 o más"])
  })
})

describe("resumirMetricas", () => {
  it("suma los estados de las categorías y pondera la espera por la cantidad de pendientes", () => {
    const resumen = resumirMetricas(
      [categoria(30, 100, 10, { reparados: 10, defensoria: 5 }), categoria(10, 20, 0, { rechazados: 5 })],
      [barrio("Centro", 20), barrio("Sur", 15), barrio("Norte", 5)],
    )

    expect(resumen).toMatchObject({
      total: 60,
      pendientes: 40,
      porcentajePendientes: 67,
      esperaPromedioDias: 80,
      pendientesMas90Dias: 10,
      reparados: 10,
      porcentajeReparados: 17,
      defensoria: 5,
    })
  })

  it("mide cuánto del total suman los dos barrios con más reportes", () => {
    const resumen = resumirMetricas([categoria(60, 10, 0)], [barrio("Norte", 5), barrio("Centro", 20), barrio("Sur", 10)])

    expect(resumen.concentracion).toEqual({ barrios: ["Centro", "Sur"], total: 30, porcentaje: 50 })
  })

  it("sin reportes no divide por cero", () => {
    expect(resumirMetricas([], [])).toMatchObject({
      total: 0,
      porcentajePendientes: 0,
      esperaPromedioDias: null,
      porcentajeReparados: 0,
      concentracion: { barrios: [], total: 0, porcentaje: 0 },
    })
  })
})
