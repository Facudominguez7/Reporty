import { describe, expect, it } from "vitest"

import { listadoMuestraMascotas, normalizarCapa, serializarCookieCapa } from "./capa"

describe("normalizarCapa", () => {
  it("acepta mascotas y cae a reportes con cualquier otro valor", () => {
    expect(normalizarCapa("mascotas")).toBe("mascotas")
    expect(normalizarCapa("reportes")).toBe("reportes")
    expect(normalizarCapa("cualquiera")).toBe("reportes")
    expect(normalizarCapa(undefined)).toBe("reportes")
  })
})

describe("listadoMuestraMascotas", () => {
  it("respeta la vista explícita de la URL por sobre la cookie", () => {
    expect(listadoMuestraMascotas("mascotas", "reportes")).toBe(true)
    expect(listadoMuestraMascotas("incidentes", "mascotas")).toBe(false)
  })

  it("sin vista en la URL usa la última capa elegida", () => {
    expect(listadoMuestraMascotas(undefined, "mascotas")).toBe(true)
    expect(listadoMuestraMascotas(undefined, "reportes")).toBe(false)
    expect(listadoMuestraMascotas(undefined, undefined)).toBe(false)
  })
})

describe("serializarCookieCapa", () => {
  it("guarda la capa para todo el sitio", () => {
    expect(serializarCookieCapa("mascotas")).toMatch(/^reporty_capa=mascotas; Path=\/;/)
  })
})
