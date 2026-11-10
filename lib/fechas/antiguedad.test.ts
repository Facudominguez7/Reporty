import { describe, expect, it } from "vitest"

import { describirAntiguedad } from "./antiguedad"

describe("describirAntiguedad", () => {
  const ahora = new Date("2026-11-10T15:00:00-03:00")

  it("cuenta días de calendario en la hora de Argentina", () => {
    expect(describirAntiguedad(new Date("2026-11-08T23:30:00-03:00"), ahora)).toBe("hace 2 días")
    expect(describirAntiguedad(new Date("2026-11-09T23:59:00-03:00"), ahora)).toBe("hace 1 día")
  })

  it("dentro del mismo día habla en horas, nunca de «hace 0 días»", () => {
    expect(describirAntiguedad(new Date("2026-11-10T13:00:00-03:00"), ahora)).toBe("hace 2 horas")
    expect(describirAntiguedad(new Date("2026-11-10T14:00:00-03:00"), ahora)).toBe("hace 1 hora")
    expect(describirAntiguedad(new Date("2026-11-10T14:40:00-03:00"), ahora)).toBe("hace minutos")
  })
})
