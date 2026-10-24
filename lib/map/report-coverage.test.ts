import { describe, expect, it } from "vitest"

import { isWithinReportCoverage } from "./report-coverage"

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
