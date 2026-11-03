import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => {
  const calls: string[] = []
  const refs: Array<{ current: unknown }> = []
  const map = { setView: vi.fn(() => calls.push("setView")), on: vi.fn(), fitBounds: vi.fn(), remove: vi.fn() }
  const cluster = { addTo: vi.fn(), clearLayers: vi.fn(), addLayer: vi.fn(() => calls.push("addLayer")), getLayers: vi.fn(() => []) }
  const marker = { bindPopup: vi.fn(), on: vi.fn() }
  return { calls, refs, map, cluster, marker, refIndex: 0 }
})

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>()
  return {
    ...actual,
    useRef: (initial: unknown) => {
      const index = mocks.refIndex++
      return mocks.refs[index] ??= { current: index === 0 ? { innerHTML: "" } : initial }
    },
    useEffect: (effect: () => void) => effect(),
  }
})
vi.mock("leaflet.markercluster", () => ({}))
vi.mock("leaflet", () => ({
  default: {
    map: () => mocks.map,
    tileLayer: () => ({ addTo: vi.fn(() => mocks.calls.push("tileLayer")) }),
    markerClusterGroup: () => mocks.cluster,
    marker: () => mocks.marker,
    divIcon: () => ({}),
    latLngBounds: () => ({ isValid: () => true, getNorthEast: () => ({ equals: () => true }), getSouthWest: () => ({}), getCenter: () => [1, 2] }),
  },
}))

import LeafletMap from "./leaflet-map"
import { INITIAL_MAP_VIEW_CONFIG } from "@/lib/map/initial-view"

const report = {
  id: 1, title: "Report", description: "Description", category: "default", priority: "Media",
  status: "Pendiente", location: "Location", coordinates: [-27.36, -55.89] as [number, number],
  author: "User", createdAt: "2025-01-01",
}

function render(reports: typeof report[]) {
  mocks.refIndex = 0
  renderToStaticMarkup(createElement(LeafletMap, { reports }))
}

describe("LeafletMap initial view", () => {
  beforeEach(() => {
    mocks.calls.length = 0
    mocks.refs.length = 0
    vi.clearAllMocks()
  })

  it("sets the initial view before adding markers and keeps their popups", () => {
    render([report])
    expect(mocks.map.setView).toHaveBeenCalledOnce()
    expect(mocks.map.setView).toHaveBeenCalledWith(INITIAL_MAP_VIEW_CONFIG.defaultCenter, INITIAL_MAP_VIEW_CONFIG.defaultZoom)
    expect(mocks.calls).toEqual(["tileLayer", "setView", "addLayer"])
    expect(mocks.marker.bindPopup).toHaveBeenCalledOnce()
  })

  it("still resets the view when an existing map is filtered to no reports", () => {
    render([report])
    render([])
    expect(mocks.map.setView).toHaveBeenLastCalledWith(INITIAL_MAP_VIEW_CONFIG.defaultCenter, INITIAL_MAP_VIEW_CONFIG.defaultZoom)
    expect(mocks.map.setView).toHaveBeenCalledTimes(2)
    expect(mocks.cluster.clearLayers).toHaveBeenCalledTimes(2)
  })
})
