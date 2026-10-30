import coverageData from "./report-coverage.json"

type Position = readonly [longitude: number, latitude: number]
type Ring = readonly Position[]
type PolygonCoordinates = readonly Ring[]
type CoverageFeature = {
  type: "Feature"
  properties: { Municipio: string }
  geometry: { type: "Polygon"; coordinates: PolygonCoordinates }
}
type CoverageCollection = { type: "FeatureCollection"; features: CoverageFeature[] }
type RingLocation = "outside" | "inside" | "boundary"

/**
 * Selected municipal polygons from Misiones' open-data GeoJSON, sourced from OpenStreetMap.
 * Source: https://www.datos.misiones.gob.ar/dataset/municipios
 * Dataset author: Carlos Brys. License: CC BY-SA 4.0.
 */
export const REPORT_COVERAGE = coverageData as unknown as CoverageCollection
export const REPORT_COVERAGE_SOURCE = {
  url: "https://www.datos.misiones.gob.ar/dataset/municipios",
  attribution: "Municipios: Carlos Brys / OSM (CC BY-SA 4.0)",
} as const
function locateInRing(longitude: number, latitude: number, ring: Ring): RingLocation {
  let inside = false

  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const [x1, y1] = ring[index]
    const [x2, y2] = ring[previous]
    const cross = (latitude - y1) * (x2 - x1) - (longitude - x1) * (y2 - y1)
    const epsilon = 1e-10

    if (
      Math.abs(cross) <= epsilon &&
      longitude >= Math.min(x1, x2) - epsilon &&
      longitude <= Math.max(x1, x2) + epsilon &&
      latitude >= Math.min(y1, y2) - epsilon &&
      latitude <= Math.max(y1, y2) + epsilon
    ) {
      return "boundary"
    }

    if ((y1 > latitude) !== (y2 > latitude) && longitude < ((x2 - x1) * (latitude - y1)) / (y2 - y1) + x1) {
      inside = !inside
    }
  }

  return inside ? "inside" : "outside"
}

function locateInPolygon(longitude: number, latitude: number, rings: PolygonCoordinates) {
  if (locateInRing(longitude, latitude, rings[0]) !== "inside") {
    return false
  }

  return !rings.slice(1).some((hole) => locateInRing(longitude, latitude, hole) !== "outside")
}

export function isWithinReportCoverage(latitude: number, longitude: number) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return false
  }

  return REPORT_COVERAGE.features.some(({ geometry }) =>
    locateInPolygon(longitude, latitude, geometry.coordinates),
  )
}

export function resolveReportMunicipality(latitude: number, longitude: number): string | null {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null

  let municipality: string | null = null
  for (const { geometry, properties } of REPORT_COVERAGE.features) {
    if (geometry.coordinates.some((ring) => locateInRing(longitude, latitude, ring) === "boundary")) return null
    if (locateInPolygon(longitude, latitude, geometry.coordinates)) {
      if (municipality !== null) return null
      municipality = properties.Municipio
    }
  }
  return municipality
}

const positions = REPORT_COVERAGE.features.flatMap(({ geometry }) => geometry.coordinates.flat())

export const REPORT_COVERAGE_BOUNDS: [[number, number], [number, number]] = [
  [Math.min(...positions.map(([, latitude]) => latitude)), Math.min(...positions.map(([longitude]) => longitude))],
  [Math.max(...positions.map(([, latitude]) => latitude)), Math.max(...positions.map(([longitude]) => longitude))],
]
