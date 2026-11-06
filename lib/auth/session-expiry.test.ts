import { describe, expect, it } from "vitest"

import { ROLE_IDS } from "@/lib/authz/catalog"

import {
  LIMITE_SESION_ADMIN_MS,
  LIMITE_SESION_GENERAL_MS,
  obtenerInicioAutenticacion,
  sesionVencida,
} from "./session-expiry"

const HORA = 60 * 60 * 1000
const DIA = 24 * HORA

/** Arma un JWT sin firma con el payload indicado, suficiente para leer sus claims. */
const tokenCon = (payload: unknown) =>
  `e30.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.firma`

describe("límites de sesión", () => {
  it("dura 30 días para usuarios comunes y 24 horas para administradores", () => {
    expect(LIMITE_SESION_GENERAL_MS).toBe(30 * DIA)
    expect(LIMITE_SESION_ADMIN_MS).toBe(24 * HORA)
  })
})

describe("obtenerInicioAutenticacion", () => {
  it("toma el método de autenticación más reciente del claim amr", () => {
    const token = tokenCon({ amr: [{ method: "password", timestamp: 1000 }, { method: "otp", timestamp: 3000 }] })

    expect(obtenerInicioAutenticacion(token, "2026-01-01T00:00:00Z")).toBe(3_000_000)
  })

  it("usa el último inicio de sesión del usuario si el token no trae amr", () => {
    expect(obtenerInicioAutenticacion(tokenCon({ sub: "x" }), "2026-01-01T00:00:00Z")).toBe(
      Date.parse("2026-01-01T00:00:00Z"),
    )
    expect(obtenerInicioAutenticacion("no-es-un-jwt", "2026-01-01T00:00:00Z")).toBe(
      Date.parse("2026-01-01T00:00:00Z"),
    )
    expect(obtenerInicioAutenticacion(undefined, "2026-01-01T00:00:00Z")).toBe(Date.parse("2026-01-01T00:00:00Z"))
  })

  it("devuelve null si no hay ningún dato de inicio", () => {
    expect(obtenerInicioAutenticacion(undefined, undefined)).toBeNull()
    expect(obtenerInicioAutenticacion(tokenCon({ amr: [] }), "fecha-invalida")).toBeNull()
  })
})

describe("sesionVencida", () => {
  const ahora = Date.parse("2026-11-05T12:00:00Z")

  it("vence la sesión común al cumplir 30 días, no antes", () => {
    expect(sesionVencida({ inicioMs: ahora - 30 * DIA + 1, ahoraMs: ahora, rolId: ROLE_IDS.CIUDADANO })).toBe(false)
    expect(sesionVencida({ inicioMs: ahora - 30 * DIA, ahoraMs: ahora, rolId: ROLE_IDS.CIUDADANO })).toBe(true)
  })

  it("vence la sesión de administrador al cumplir 24 horas, no antes", () => {
    expect(sesionVencida({ inicioMs: ahora - 24 * HORA + 1, ahoraMs: ahora, rolId: ROLE_IDS.ADMIN })).toBe(false)
    expect(sesionVencida({ inicioMs: ahora - 24 * HORA, ahoraMs: ahora, rolId: ROLE_IDS.ADMIN })).toBe(true)
  })

  it("aplica el límite más corto si el rol es desconocido", () => {
    expect(sesionVencida({ inicioMs: ahora - 25 * HORA, ahoraMs: ahora, rolId: null })).toBe(true)
  })

  it("vence la sesión si no se conoce su inicio", () => {
    expect(sesionVencida({ inicioMs: null, ahoraMs: ahora, rolId: ROLE_IDS.CIUDADANO })).toBe(true)
  })
})
