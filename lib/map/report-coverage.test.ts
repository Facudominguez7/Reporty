import { describe, expect, it } from "vitest"

import { isWithinReportCoverage, REPORT_COVERAGE, resolveReportMunicipality } from "./report-coverage"

describe("resolveReportMunicipality", () => {
  it("resolves interior locations only", () => {
    expect(resolveReportMunicipality(-27.3676, -55.8961)).toBe("Posadas")
    expect(resolveReportMunicipality(-27.48, -55.82)).toBe("Garupá")
    expect(resolveReportMunicipality(-27.5062, -55.6351)).toBe("Candelaria")
    expect(resolveReportMunicipality(-27.5591, -55.9696)).toBeNull()
    expect(resolveReportMunicipality(-26, -54)).toBeNull()
    expect(resolveReportMunicipality(NaN, -54)).toBeNull()
  })

  it("does not resolve overlapping municipalities", () => {
    const posadas = REPORT_COVERAGE.features.find((feature) => feature.properties.Municipio === "Posadas")!
    REPORT_COVERAGE.features.push({ ...posadas, properties: { Municipio: "Otro" } })
    try {
      expect(resolveReportMunicipality(-27.3676, -55.8961)).toBeNull()
    } finally {
      REPORT_COVERAGE.features.pop()
    }
  })
})

describe("isWithinReportCoverage", () => {
  it("allows near-river Candelaria land inside the municipal polygon", () => {
    expect(isWithinReportCoverage(-27.46, -55.745)).toBe(true)
  })

  it("allows covered land and rejects Paraguay and areas outside the municipal polygons", () => {
    const coveredLand = [
      [-27.3676, -55.8961], // Posadas
      [-27.41, -56], // Itaembé Guazú
      [-27.42, -55.98], // Itaembé Miní
      [-27.48, -55.82], // Garupá
      [-27.5062, -55.6351], // Candelaria
    ] as const
    const excludedAreas = [
      [-27.32, -55.89], // Paraguay
      [-27.335, -55.9], // Paraná north of the Posadas shoreline
      [-27.34, -55.9], // Paraná shoreline
      [-26, -54], // Outside the service region
      [-27.5591, -55.9696], // Posadas polygon boundary
    ] as const

    for (const [lat, lon] of coveredLand) {
      expect(isWithinReportCoverage(lat, lon), `${lat}, ${lon}`).toBe(true)
    }

    for (const [lat, lon] of excludedAreas) {
      expect(isWithinReportCoverage(lat, lon), `${lat}, ${lon}`).toBe(false)
    }
  })
})
