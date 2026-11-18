import { describe, expect, it } from "vitest"

import { validarContactoAviso } from "./contacto-aviso"

describe("validarContactoAviso", () => {
  it("acepta email solo (usuario autenticado con cuenta)", () => {
    const resultado = validarContactoAviso({ email: "flor@example.com", telefono: null })
    expect(resultado).toEqual({ success: true, contacto: { email: "flor@example.com", telefono: null } })
  })

  it("acepta teléfono solo (invitado sin email)", () => {
    const resultado = validarContactoAviso({ email: null, telefono: "3764-123 456" })
    expect(resultado).toEqual({ success: true, contacto: { email: null, telefono: "3764-123 456" } })
  })

  it("acepta ambos y recorta espacios", () => {
    const resultado = validarContactoAviso({ email: " flor@example.com ", telefono: " 3764123456 " })
    expect(resultado).toEqual({ success: true, contacto: { email: "flor@example.com", telefono: "3764123456" } })
  })

  it("rechaza cuando no hay ninguno (regla mínimo email o teléfono)", () => {
    const resultado = validarContactoAviso({ email: null, telefono: "" })
    expect(resultado.success).toBe(false)
    if (!resultado.success) expect(resultado.error).toContain("teléfono")
  })

  it("rechaza email con formato inválido", () => {
    const resultado = validarContactoAviso({ email: "no-es-un-email", telefono: null })
    expect(resultado.success).toBe(false)
    if (!resultado.success) expect(resultado.error).toContain("email")
  })

  it("rechaza teléfono demasiado corto", () => {
    const resultado = validarContactoAviso({ email: null, telefono: "123" })
    expect(resultado.success).toBe(false)
    if (!resultado.success) expect(resultado.error).toContain("teléfono")
  })

  it("rechaza teléfono con caracteres no permitidos", () => {
    const resultado = validarContactoAviso({ email: null, telefono: "hola<script>" })
    expect(resultado.success).toBe(false)
    if (!resultado.success) expect(resultado.error).toContain("teléfono")
  })
})
