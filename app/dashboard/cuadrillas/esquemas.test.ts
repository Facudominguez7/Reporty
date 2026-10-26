import { describe, expect, it } from "vitest"
import { REPORT_STATE_IDS } from "../../../lib/authz/catalog"
import { esquemaAsignarCuadrilla, esquemaCerrarReporteConCuadrilla, esquemaCuadrilla } from "./esquemas"

describe("crew schema contracts", () => {
  it("preserves optional string normalization without accepting null inputs", () => {
    expect(esquemaCuadrilla.parse({ nombre: " Norte " })).toEqual({ nombre: "Norte", descripcion: null, telefono: null })
    expect(esquemaCuadrilla.parse({ nombre: "Norte", descripcion: "  ", telefono: "  " })).toEqual({ nombre: "Norte", descripcion: null, telefono: null })
    expect(esquemaCuadrilla.safeParse({ nombre: "Norte", descripcion: null }).success).toBe(false)
    expect(esquemaCuadrilla.safeParse({ nombre: "Norte", telefono: null }).success).toBe(false)
  })
  it.each([
    ["nombre", "a".repeat(121), "El nombre no puede superar 120 caracteres."],
    ["descripcion", "a".repeat(501), "La descripción no puede superar 500 caracteres."],
    ["telefono", "a".repeat(41), "El teléfono no puede superar 40 caracteres."],
  ])("preserves the %s limit and message", (field, value, message) => {
    const result = esquemaCuadrilla.safeParse({ nombre: "Norte", [field]: value })
    expect(result.success).toBe(false)
    if (result.success) throw new Error("Expected validation failure")
    expect(result.error.issues.map(({ path, message }) => ({ path, message }))).toEqual([{ path: [field], message }])
  })
  it("preserves coercion, defaults, observation transforms and the administrative union", () => {
    expect(esquemaAsignarCuadrilla.parse({ reporteId: "1", cuadrillaId: "2", observacion: "  " })).toEqual({ reporteId: 1, cuadrillaId: 2, observacion: undefined, observacionPublica: false })
    for (const nuevoEstadoId of [REPORT_STATE_IDS.REPARADO, REPORT_STATE_IDS.RECHAZADO]) {
      expect(esquemaCerrarReporteConCuadrilla.parse({ reporteId: "1", nuevoEstadoId, comentario: "  listo " })).toEqual({ reporteId: 1, nuevoEstadoId, comentario: "listo" })
    }
    expect(esquemaCerrarReporteConCuadrilla.safeParse({ reporteId: 1, nuevoEstadoId: -1 }).success).toBe(false)
  })
})
