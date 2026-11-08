/**
 * Paridad de la regla de participación en reparaciones (S15, L21): el catálogo de TS
 * coincide con `private.usuario_habilitado_para_reparacion`, donde Admin, Ciudadano,
 * Interesado y los perfiles sin rol participan y Operador e Invitado quedan fuera.
 */
import { describe, expect, it } from "vitest"

import {
  esRolHabilitadoParaReparacion,
  puedeInformarReparacion,
} from "@/lib/use-cases/reportes/evidencia-reparacion"

const confirmado = { is_anonymous: false, email_confirmed_at: "2026-01-01T00:00:00.000Z" }

describe("participación en reparaciones", () => {
  it.each([
    [null, true],
    [1, true],
    [2, true],
    [3, true],
    [4, false],
    [5, false],
  ])("rol %s → %s, igual que la regla SQL `rol_id not in (4,5)`", (rolId, esperado) => {
    expect(esRolHabilitadoParaReparacion(rolId)).toBe(esperado)
  })

  it.each([
    ["admin confirmado", confirmado, 1, true],
    ["ciudadano confirmado", confirmado, 2, true],
    ["interesado confirmado", confirmado, 3, true],
    ["operador confirmado", confirmado, 4, false],
    ["invitado", confirmado, 5, false],
    ["admin anónimo", { is_anonymous: true, email_confirmed_at: "2026-01-01T00:00:00.000Z" }, 1, false],
    ["admin sin correo confirmado", { is_anonymous: false, email_confirmed_at: undefined }, 1, false],
    ["ciudadano sin correo confirmado", { is_anonymous: false, email_confirmed_at: undefined }, 2, false],
    ["sin sesión", null, 2, false],
  ])("%s → %s", (_caso, usuario, rolId, esperado) => {
    expect(puedeInformarReparacion(usuario, rolId)).toBe(esperado)
  })
})
