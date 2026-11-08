import { createElement, type ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

const mapMocks = vi.hoisted(() => ({
  setView: vi.fn(),
  click: null as null | ((event: { latlng: { lat: number; lng: number }; originalEvent: { target: null } }) => void),
}))

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>()
  return { ...actual, useEffect: (effect: () => void) => effect() }
})
vi.mock("leaflet", () => ({ default: { Icon: class Icon {} } }))
vi.mock("react-leaflet", async () => {
  const { createElement } = await import("react")
  return {
    MapContainer: ({ children }: { children?: ReactNode }) => createElement("div", null, children),
    TileLayer: () => null,
    Marker: () => null,
    useMapEvents: (events: { click: typeof mapMocks.click }) => { mapMocks.click = events.click; return { setView: mapMocks.setView, getZoom: () => 16 } },
  }
})
vi.mock("leaflet/dist/leaflet.css", () => ({}))
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock("@/hooks/use-mounted", () => ({ useMounted: () => true }))

import { LocationPickerMap } from "./location-picker-map"

describe("LocationPickerMap", () => {
  it("preserves the 400px default height for existing callers", () => {
    const html = renderToStaticMarkup(createElement(LocationPickerMap, { onLocationSelect: vi.fn() }))
    expect(html).toContain("h-[400px]")
  })

  it("uses a caller-provided height for compact layouts", () => {
    const html = renderToStaticMarkup(createElement(LocationPickerMap, { onLocationSelect: vi.fn(), heightClassName: "h-48" }))
    expect(html).toContain("h-48")
  })

  it("preserves the current zoom when location coordinates change if requested", () => {
    mapMocks.setView.mockClear()
    const location = { lat: -27.3671, lon: -55.8961 }

    renderToStaticMarkup(createElement(LocationPickerMap, {
      onLocationSelect: vi.fn(),
      initialLat: location.lat,
      initialLon: location.lon,
      preserveZoomOnSelection: true,
    }))

    expect(mapMocks.setView).toHaveBeenCalledWith([location.lat, location.lon], 16)
  })

  it("retains the default zoom behavior for callers that do not opt in", () => {
    mapMocks.setView.mockClear()
    const location = { lat: -27.3671, lon: -55.8961 }

    renderToStaticMarkup(createElement(LocationPickerMap, {
      onLocationSelect: vi.fn(),
      initialLat: location.lat,
      initialLon: location.lon,
    }))

    expect(mapMocks.setView).toHaveBeenCalledWith([location.lat, location.lon], 13)
  })

  it("exposes a keyboard-operable center selection only when requested", () => {
    expect(renderToStaticMarkup(createElement(LocationPickerMap, { onLocationSelect: vi.fn() }))).not.toContain("Seleccionar centro del mapa")
    expect(renderToStaticMarkup(createElement(LocationPickerMap, { onLocationSelect: vi.fn(), keyboardSelection: true }))).toContain("Seleccionar centro del mapa")
  })

  it("selects map clicks inside coverage and rejects points outside it", () => {
    const onLocationSelect = vi.fn()
    renderToStaticMarkup(createElement(LocationPickerMap, { onLocationSelect }))
    vi.stubGlobal("Element", class {})
    mapMocks.click?.({ latlng: { lat: -27.3671, lng: -55.8961 }, originalEvent: { target: null } })
    mapMocks.click?.({ latlng: { lat: 0, lng: 0 }, originalEvent: { target: null } })
    vi.unstubAllGlobals()
    expect(onLocationSelect).toHaveBeenCalledTimes(1)
    expect(onLocationSelect).toHaveBeenCalledWith(-27.3671, -55.8961)
  })
})
