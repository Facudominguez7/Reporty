/**
 * El catálogo cerrado de frases de la evidencia de reparación (S16) y de la
 * impugnación (S17) debe coincidir palabra por palabra y en orden con lo aprobado
 * por el usuario en L26: el servidor solo acepta claves de estas listas.
 */
import { describe, expect, it } from "vitest"

import {
  COMENTARIO_REPARACION_MAX,
  MOTIVO_IMPUGNACION_MAX,
} from "@/lib/use-cases/reportes/evidencia-reparacion-limites"
import {
  FRASES_IMPUGNACION,
  FRASES_REPARACION,
  PLACEHOLDER_FRASE_IMPUGNACION,
  PLACEHOLDER_FRASE_REPARACION,
  PREGUNTA_POR_QUE_NO_ESTA_REPARADO,
  PREGUNTA_QUE_SE_ARREGLO,
  parseFraseImpugnacion,
  parseFraseReparacion,
} from "./frases-reparacion"

/** Frases de S16, verbatim y en el orden aprobado. */
const FRASES_S16 = [
  "Repararon el problema por completo",
  "Taparon el bache con asfalto nuevo",
  "Retiraron el árbol o las ramas caídas",
  "Repararon o cambiaron la luminaria",
  "Limpiaron la basura o el microbasural",
  "Repararon la pérdida de agua o la cañería",
  "Arreglaron la vereda o el cordón",
  "Repusieron o arreglaron el cartel o semáforo",
]

/** Frases de S17, verbatim y en el orden aprobado. */
const FRASES_S17 = [
  "El problema sigue igual",
  "Lo arreglaron solo en parte",
  "El arreglo ya se rompió de nuevo",
  "La foto no corresponde a este lugar",
  "La foto no muestra el arreglo con claridad",
]

describe("catálogo de frases de la reparación (S16)", () => {
  it("reproduce las frases aprobadas en orden", () => {
    expect(FRASES_REPARACION.map(({ label }) => label)).toEqual(FRASES_S16)
  })

  it("usa claves snake_case propias y distintas de la etiqueta visible", () => {
    const claves = FRASES_REPARACION.map(({ key }) => key)

    for (const clave of claves) expect(clave).toMatch(/^[a-z][a-z0-9_]*$/)
    expect(new Set(claves).size).toBe(claves.length)
    for (const { key, label } of FRASES_REPARACION) expect(key).not.toBe(label)
  })

  it("pregunta y placeholder son los textos de la ficha", () => {
    expect(PREGUNTA_QUE_SE_ARREGLO).toBe("¿Qué se arregló?")
    expect(PLACEHOLDER_FRASE_REPARACION).toBe("Elegí qué se arregló…")
  })

  it("cada etiqueta entra en la columna de comentario que sigue siendo libre", () => {
    for (const { label } of FRASES_REPARACION) {
      expect(label.length).toBeLessThanOrEqual(COMENTARIO_REPARACION_MAX)
    }
  })
})

describe("catálogo de frases de la impugnación (S17)", () => {
  it("reproduce las frases aprobadas en orden", () => {
    expect(FRASES_IMPUGNACION.map(({ label }) => label)).toEqual(FRASES_S17)
  })

  it("usa claves snake_case propias y distintas de la etiqueta visible", () => {
    const claves = FRASES_IMPUGNACION.map(({ key }) => key)

    for (const clave of claves) expect(clave).toMatch(/^[a-z][a-z0-9_]*$/)
    expect(new Set(claves).size).toBe(claves.length)
    for (const { key, label } of FRASES_IMPUGNACION) expect(key).not.toBe(label)
  })

  it("no comparte claves entre los dos catálogos", () => {
    const reparacion = new Set<string>(FRASES_REPARACION.map(({ key }) => key))

    for (const { key } of FRASES_IMPUGNACION) expect(reparacion.has(key)).toBe(false)
  })

  it("pregunta y placeholder son los textos de la ficha", () => {
    expect(PREGUNTA_POR_QUE_NO_ESTA_REPARADO).toBe("¿Por qué no está reparado?")
    expect(PLACEHOLDER_FRASE_IMPUGNACION).toBe("Elegí por qué no está reparado…")
  })

  it("cada etiqueta entra en la columna de motivo que sigue siendo libre", () => {
    for (const { label } of FRASES_IMPUGNACION) {
      expect(label.length).toBeLessThanOrEqual(MOTIVO_IMPUGNACION_MAX)
    }
  })
})

describe("claves aceptadas para la reparación", () => {
  it.each(FRASES_REPARACION.map(({ key, label }) => [key, label] as const))(
    "resuelve la clave %s a su etiqueta",
    (clave, esperada) => {
      expect(parseFraseReparacion(clave)).toBe(esperada)
    },
  )

  it.each([
    ["", "vacío"],
    ["   ", "solo espacios"],
    ["taparon_el_bache", "clave inexistente"],
    ["Taparon el bache con asfalto nuevo", "etiqueta en vez de clave"],
    ["TAPARON_EL_BACHE_CON_ASFALTO_NUEVO", "clave en mayúsculas"],
    ["el_problema_sigue_igual", "clave del otro catálogo"],
    [null, "nulo"],
    [undefined, "indefinido"],
    [7, "número"],
    [{ key: "taparon_el_bache_con_asfalto_nuevo" }, "objeto"],
  ])("rechaza %j (%s)", (valor, _caso) => {
    expect(parseFraseReparacion(valor)).toBeNull()
  })
})

describe("claves aceptadas para la impugnación", () => {
  it.each(FRASES_IMPUGNACION.map(({ key, label }) => [key, label] as const))(
    "resuelve la clave %s a su etiqueta",
    (clave, esperada) => {
      expect(parseFraseImpugnacion(clave)).toBe(esperada)
    },
  )

  it.each([
    ["", "vacío"],
    ["   ", "solo espacios"],
    ["el_bache_sigue_roto", "clave inexistente"],
    ["El problema sigue igual", "etiqueta en vez de clave"],
    ["taparon_el_bache_con_asfalto_nuevo", "clave del otro catálogo"],
    [null, "nulo"],
    [undefined, "indefinido"],
    [7, "número"],
  ])("rechaza %j (%s)", (valor, _caso) => {
    expect(parseFraseImpugnacion(valor)).toBeNull()
  })
})
