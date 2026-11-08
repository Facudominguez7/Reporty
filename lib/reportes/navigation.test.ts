import { describe, expect, it } from "vitest"
import { buildReportesReturnTo, resolveReportesReturnTo, withReportesReturnTo } from "./navigation"

describe("report detail return navigation", () => {
  it("preserves list filters in detail links and accepts only local report-list destinations", () => {
    const returnTo = buildReportesReturnTo("estado=Reparado&prioridad=Alta&search=farola")

    expect(returnTo).toBe("/reportes?estado=Reparado&prioridad=Alta&search=farola")
    expect(withReportesReturnTo("/reportes/12", returnTo)).toBe(
      "/reportes/12?returnTo=%2Freportes%3Festado%3DReparado%26prioridad%3DAlta%26search%3Dfarola",
    )
    expect(resolveReportesReturnTo(returnTo, "/reportes")).toBe(returnTo)
    expect(resolveReportesReturnTo("https://attacker.example", "/reportes")).toBe("/reportes")
  })
})
