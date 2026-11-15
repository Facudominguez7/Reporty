/** Lectura y formato de las fechas que devuelve la base de datos. */
import { describe, expect, it } from "vitest"

import { formatearFechaArgentina, leerFechaBase } from "./fecha-base"

describe("leerFechaBase", () => {
  it("lee un timestamp sin zona como UTC, porque la base guarda now() en UTC", () => {
    expect(leerFechaBase("2026-11-15 00:00:18.880232").toISOString()).toBe("2026-11-15T00:00:18.880Z")
    expect(leerFechaBase("2026-11-15T00:00:18").toISOString()).toBe("2026-11-15T00:00:18.000Z")
  })

  it("respeta la zona cuando la fecha la trae", () => {
    expect(leerFechaBase("2026-11-15T00:00:18+00:00").toISOString()).toBe("2026-11-15T00:00:18.000Z")
    expect(leerFechaBase("2026-11-14T21:00:00-03:00").toISOString()).toBe("2026-11-15T00:00:00.000Z")
    expect(leerFechaBase("2026-11-15T00:00:18Z").toISOString()).toBe("2026-11-15T00:00:18.000Z")
  })

  it("lee una fecha sola como ese día en Argentina", () => {
    expect(formatearFechaArgentina("2026-11-14")).toBe("14/11/2026")
  })
})

describe("formatearFechaArgentina", () => {
  it("un reporte creado a las 21 h de Argentina conserva su día aunque en UTC ya sea el siguiente", () => {
    expect(formatearFechaArgentina("2026-11-15 00:00:18.880232")).toBe("14/11/2026")
    expect(formatearFechaArgentina("2026-11-15 00:00:18", { year: "numeric", month: "short", day: "numeric" })).toBe(
      "14 de nov de 2026",
    )
  })

  it("acepta objetos Date", () => {
    expect(formatearFechaArgentina(new Date("2026-11-15T02:59:59Z"))).toBe("14/11/2026")
    expect(formatearFechaArgentina(new Date("2026-11-15T03:00:00Z"))).toBe("15/11/2026")
  })
})
