/**
 * Pruebas de la regla que decide cuándo el diálogo de confirmación de un aporte debe explicar
 * que la verificación de seguridad venció mientras estaba abierto.
 */
import { describe, expect, it } from "vitest"

import { debeAvisarVerificacionVencida } from "../../components/report-detail/verificacion-de-aporte"

const base = { exigeVerificacion: true, verificacionNoDisponible: false, token: null, publicando: false }

describe("debeAvisarVerificacionVencida", () => {
  it("avisa cuando el challenge se exige y el token ya no está disponible", () => {
    expect(debeAvisarVerificacionVencida(base)).toBe(true)
  })

  it("no avisa mientras el token sigue vigente", () => {
    expect(debeAvisarVerificacionVencida({ ...base, token: "tok-vigente" })).toBe(false)
  })

  it("no avisa cuando la aplicación no exige el challenge", () => {
    expect(debeAvisarVerificacionVencida({ ...base, exigeVerificacion: false })).toBe(false)
  })

  it("no duplica el aviso de verificación no disponible que ya muestra el formulario", () => {
    expect(debeAvisarVerificacionVencida({ ...base, verificacionNoDisponible: true })).toBe(false)
  })

  it("no avisa durante la publicación, cuando el token se consume a propósito", () => {
    expect(debeAvisarVerificacionVencida({ ...base, publicando: true })).toBe(false)
  })
})
