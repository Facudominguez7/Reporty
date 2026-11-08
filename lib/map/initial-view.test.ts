import { afterEach, describe, expect, it, vi } from "vitest"

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe("map tile provider configuration", () => {
  it("keeps OpenStreetMap as the default when the CARTO key is missing", async () => {
    vi.stubEnv("NEXT_PUBLIC_CARTO_API_KEY", "")
    vi.resetModules()
    const map = await import("./initial-view")

    expect(map.MAP_TILE_URL).toBe("https://tile.openstreetmap.org/{z}/{x}/{y}.png")
    expect(map.MAP_TILE_ATTRIBUTION).toContain("OpenStreetMap")
    expect(map.MAP_TILE_ORIGIN).toBe("https://tile.openstreetmap.org")
  })

  it("uses CARTO Positron raster tiles and both required attributions when keyed", async () => {
    vi.stubEnv("NEXT_PUBLIC_CARTO_API_KEY", "test-key")
    vi.resetModules()
    const map = await import("./initial-view")

    expect(map.MAP_TILE_URL).toBe("https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png?key=test-key")
    expect(map.MAP_TILE_ATTRIBUTION).toContain("OpenStreetMap")
    expect(map.MAP_TILE_ATTRIBUTION).toContain("CARTO")
    expect(map.MAP_TILE_ORIGIN).toBe("https://basemaps.cartocdn.com")
  })
})
