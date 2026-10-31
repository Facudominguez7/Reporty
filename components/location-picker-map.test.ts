import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("leaflet", () => ({ default: { Icon: class Icon {} } }))
vi.mock("react-leaflet", () => ({ MapContainer: () => null, TileLayer: () => null, Marker: () => null, useMapEvents: () => ({ setView: vi.fn() }) }))
vi.mock("leaflet/dist/leaflet.css", () => ({}))
vi.mock("@/hooks/use-mounted", () => ({ useMounted: () => false }))

import { LocationPickerMap } from "./location-picker-map"

describe("LocationPickerMap height", () => {
  it("preserves the 400px default height for existing callers", () => {
    const html = renderToStaticMarkup(createElement(LocationPickerMap, { onLocationSelect: vi.fn() }))
    expect(html).toContain("h-[400px]")
  })

  it("uses a caller-provided height for compact layouts", () => {
    const html = renderToStaticMarkup(createElement(LocationPickerMap, { onLocationSelect: vi.fn(), heightClassName: "h-48" }))
    expect(html).toContain("h-48")
  })
})
