import { describe, expect, it } from "vitest"

import { DESCRIPCION_ACCESO_CON_CUENTA, DESCRIPCION_ACCESO_GENERAL, descripcionAcceso, requiereCuentaRegistrada } from "./rutas-con-cuenta"

describe("requiereCuentaRegistrada", () => {
  it("reconoce la publicación de mascotas y su barra final", () => {
    expect(requiereCuentaRegistrada("/mascotas/nueva")).toBe(true)
    expect(requiereCuentaRegistrada("/mascotas/nueva/")).toBe(true)
    expect(requiereCuentaRegistrada("/mascotas/nueva?paso=2")).toBe(true)
    expect(requiereCuentaRegistrada("/mascotas/nueva#formulario")).toBe(true)
  })

  it("no confunde el listado ni la ficha de una mascota con la publicación", () => {
    expect(requiereCuentaRegistrada("/mascotas")).toBe(false)
    expect(requiereCuentaRegistrada("/mascotas/12")).toBe(false)
    expect(requiereCuentaRegistrada("/mascotas/nuevo")).toBe(false)
  })

  it("deja intactas las rutas que admiten invitados", () => {
    expect(requiereCuentaRegistrada("/reportes/nuevo")).toBe(false)
    expect(requiereCuentaRegistrada("/")).toBe(false)
    expect(requiereCuentaRegistrada("/mapa")).toBe(false)
  })

  it("nunca exige cuenta para un destino vacío o externo", () => {
    expect(requiereCuentaRegistrada(null)).toBe(false)
    expect(requiereCuentaRegistrada(undefined)).toBe(false)
    expect(requiereCuentaRegistrada("")).toBe(false)
    expect(requiereCuentaRegistrada("   ")).toBe(false)
    expect(requiereCuentaRegistrada("https://ejemplo.com/mascotas/nueva")).toBe(false)
    expect(requiereCuentaRegistrada("//ejemplo.com/mascotas/nueva")).toBe(false)
  })
})

describe("descripcionAcceso", () => {
  it("explica que hace falta una cuenta cuando el destino la exige", () => {
    expect(descripcionAcceso(true)).toBe(DESCRIPCION_ACCESO_CON_CUENTA)
    expect(descripcionAcceso(true)).toContain("correo confirmado")
    expect(descripcionAcceso(true)).not.toContain("invitado")
  })

  it("mantiene el texto general, con la opción de invitado, en el resto de los destinos", () => {
    expect(descripcionAcceso(false)).toBe(DESCRIPCION_ACCESO_GENERAL)
    expect(descripcionAcceso(false)).toContain("invitado")
  })
})
