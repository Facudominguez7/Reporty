import { describe, expect, it } from "vitest"

import {
  formatearCantidad,
  formatearFechaCorta,
  formatearFechaLegible,
  formatearTamano,
  hashVisible,
  periodoArchivado,
} from "./formato"

describe("formato de fechas", () => {
  it("muestra la fecha en UTC con día, mes y año", () => {
    expect(formatearFechaCorta("2025-11-01T23:30:00+00:00")).toBe("01/11/2025")
    expect(formatearFechaCorta("2026-01-05T00:00:00.000Z")).toBe("05/01/2026")
    expect(formatearFechaLegible("2025-11-01T10:00:00+00:00")).toBe("01 nov 2025")
  })

  it("no rompe con una fecha inválida", () => {
    expect(formatearFechaCorta("no-es-fecha")).toBe("—")
    expect(formatearFechaLegible("")).toBe("—")
  })

  it("describe el período archivado y lo colapsa cuando es un solo día", () => {
    expect(periodoArchivado("2025-11-01T10:00:00+00:00", "2026-04-30T10:00:00+00:00"))
      .toBe("01/11/2025 – 30/04/2026")
    expect(periodoArchivado("2025-11-01T10:00:00+00:00", "2025-11-01T18:00:00+00:00")).toBe("01/11/2025")
  })
})

describe("formato de cantidades y tamaños", () => {
  it("separa los miles de la cantidad de eventos", () => {
    expect(formatearCantidad(0)).toBe("0")
    expect(formatearCantidad(21)).toBe("21")
    expect(formatearCantidad(1234)).toBe("1.234")
    expect(formatearCantidad(1234567)).toBe("1.234.567")
  })

  it("usa unidades binarias con coma decimal", () => {
    expect(formatearTamano(0)).toBe("0 B")
    expect(formatearTamano(512)).toBe("512 B")
    expect(formatearTamano(1024)).toBe("1,0 KB")
    expect(formatearTamano(48 * 1024)).toBe("48,0 KB")
    expect(formatearTamano(Math.round(1.8 * 1024 * 1024))).toBe("1,8 MB")
    expect(formatearTamano(150 * 1024 * 1024)).toBe("150 MB")
  })

  it("acorta el hash sin inventar valores cuando falta", () => {
    expect(hashVisible("0123456789abcdef".padEnd(64, "f"))).toBe("0123456789ab…")
    expect(hashVisible("0123456789abcdef", 4)).toBe("0123…")
    expect(hashVisible(null)).toBe("—")
  })
})
