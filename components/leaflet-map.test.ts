import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => {
  const calls: string[] = []
  const icons: Array<{ className: string; html: string }> = []
  const refs: Array<{ current: unknown }> = []
  const listeners = new Map<string, (event: unknown) => void>()
  const cleanups: Array<() => void> = []
  const container = { innerHTML: "", addEventListener: vi.fn((name: string, listener: (event: unknown) => void) => listeners.set(name, listener)), removeEventListener: vi.fn((name: string) => listeners.delete(name)) }
  const map = { setView: vi.fn(() => calls.push("setView")), on: vi.fn(), fitBounds: vi.fn(), remove: vi.fn() }
  const cluster = { addTo: vi.fn(), clearLayers: vi.fn(), addLayer: vi.fn(() => calls.push("addLayer")), getLayers: vi.fn(() => []) }
  const marker = { bindPopup: vi.fn(), on: vi.fn() }
  return { calls, icons, refs, listeners, cleanups, container, map, cluster, marker, refIndex: 0 }
})

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>()
  return {
    ...actual,
    useRef: (initial: unknown) => {
      const index = mocks.refIndex++
      return mocks.refs[index] ??= { current: index === 0 ? mocks.container : initial }
    },
    useEffect: (effect: () => void | (() => void)) => { const cleanup = effect(); if (cleanup) mocks.cleanups.push(cleanup) },
  }
})
vi.mock("leaflet.markercluster", () => ({}))
vi.mock("leaflet", () => ({
  default: {
    map: () => mocks.map,
    tileLayer: () => ({ addTo: vi.fn(() => mocks.calls.push("tileLayer")) }),
    markerClusterGroup: () => mocks.cluster,
    marker: () => mocks.marker,
    divIcon: (icon: { className: string; html: string }) => { mocks.icons.push(icon); return {} },
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
    mocks.icons.length = 0
    mocks.refs.length = 0
    mocks.listeners.clear()
    mocks.cleanups.length = 0
    vi.clearAllMocks()
  })

  it("sets the initial view before adding markers and keeps their popups", () => {
    render([report])
    expect(mocks.map.setView).toHaveBeenCalledOnce()
    expect(mocks.map.setView).toHaveBeenCalledWith(INITIAL_MAP_VIEW_CONFIG.defaultCenter, INITIAL_MAP_VIEW_CONFIG.defaultZoom)
    expect(mocks.calls).toEqual(["tileLayer", "setView", "addLayer"])
    expect(mocks.marker.bindPopup).toHaveBeenCalledOnce()
  })

  it("renders both pet states with escaped details and a stable detail link", () => {
    render([])
    // Rerender with a pet while the imperative map instance is active.
    mocks.refIndex = 0
    renderToStaticMarkup(createElement(LeafletMap, { reports: [], mascotas: [{ id: 9, species: "Gato <script>", description: `Blanca & "curiosa"`, status: "Encontrada", createdAt: "2026-01-02", phone: `123" onclick="x`, image: "javascript:alert(1)", coordinates: [-27.36, -55.89] }] }))
    const popup = mocks.marker.bindPopup.mock.calls.at(-1)?.[0] as string
    expect(popup).toContain("/mascotas/9")
    expect(popup).toContain('data-share-pet="9"')
    expect(popup).toContain("Compartir")
    expect(popup).not.toContain(">Compartir</a>")
    expect(popup).toContain("Encontrada")
    expect(popup).toContain("Gato &lt;script&gt;")
    expect(popup).toContain("Blanca &amp; &quot;curiosa&quot;")
    expect(popup).not.toContain("javascript:")
    expect(popup).not.toContain(`onclick="x`)
  })

  it("uses semantic theme colors for pet markers", () => {
    render([])
    mocks.refIndex = 0
    renderToStaticMarkup(createElement(LeafletMap, { reports: [], mascotas: [
      { id: 9, species: "Gato", description: "Blanca", status: "Perdida", createdAt: "2026-01-02", phone: "123", image: "", coordinates: [-27.36, -55.89] },
      { id: 10, species: "Perro", description: "Negro", status: "Encontrada", createdAt: "2026-01-02", phone: "456", image: "", coordinates: [-27.36, -55.89] },
    ] }))
    const petMarkers = mocks.icons.filter(({ className }) => className === "pet-marker")
    expect(petMarkers.map(({ html }) => html)).toEqual([
      expect.stringContaining("background:var(--destructive)"),
      expect.stringContaining("background:var(--primary)"),
    ])
    expect(petMarkers.every(({ html }) => !/#(?:[\da-f]{3}){1,2}\b/i.test(html))).toBe(true)
  })

  it("safely embeds pet thumbnails and reveals the status fallback on image failure", () => {
    vi.stubGlobal("window", { location: { origin: "https://reporty.test" } })
    class FakeImage { dataset = { petMarkerImage: "" }; style = { display: "" } }
    vi.stubGlobal("HTMLImageElement", FakeImage)
    render([])
    mocks.refIndex = 0
    renderToStaticMarkup(createElement(LeafletMap, { reports: [], mascotas: [
      { id: 9, species: "Gato", description: "Blanca", status: "Perdida", createdAt: "2026-01-02", phone: "123", image: '/api/mascotas/9/foto?x="&y=1', coordinates: [-27.36, -55.89] },
      { id: 10, species: "Perro", description: "Negro", status: "Encontrada", createdAt: "2026-01-02", phone: "123", image: "javascript:alert(1)", coordinates: [-27.36, -55.89] },
    ] }))
    const markers = mocks.icons.filter(({ className }) => className === "pet-marker")
    expect(markers[0].html).toContain('src="https://reporty.test/api/mascotas/9/foto?x=%22&amp;y=1"')
    expect(markers[0].html).toContain(">P<img")
    expect(markers[0].html).toContain("var(--map-marker-stroke)")
    expect(markers[0].html).not.toMatch(/onerror\s*=/i)
    expect(markers[1].html).not.toContain("<img")
    expect(markers[1].html).toContain(">E</span>")
    const image = new FakeImage()
    mocks.listeners.get("error")!({ target: image })
    expect(image.style.display).toBe("none")
    for (const cleanup of mocks.cleanups) cleanup()
    expect(mocks.container.removeEventListener).toHaveBeenCalledWith("error", expect.any(Function), true)
    vi.unstubAllGlobals()
  })

  it("shares the stable pet URL from the popup and reports clipboard fallback", async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal("navigator", { share })
    vi.stubGlobal("window", { location: { origin: "https://reporty.test" } })
    render([])
    mocks.refIndex = 0
    renderToStaticMarkup(createElement(LeafletMap, { reports: [], mascotas: [{ id: 9, species: "Gato", description: "Blanca", status: "Encontrada", createdAt: "2026-01-02", phone: "123", image: "", coordinates: [-27.36, -55.89] }] }))
    const listener = mocks.listeners.get("click")!
    const output = { textContent: "" }
    await listener({ target: { closest: () => ({ dataset: { sharePet: "9" }, parentElement: { querySelector: () => output } }) }, preventDefault: vi.fn() })
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ url: expect.stringContaining("/mascotas/9") }))
    expect(output.textContent).toBe("Enlace compartido.")

    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
    output.textContent = ""
    await listener({ target: { closest: () => ({ dataset: { sharePet: "9" }, parentElement: { querySelector: () => output } }) }, preventDefault: vi.fn() })
    expect(output.textContent).toBe("Enlace copiado.")
    for (const cleanup of mocks.cleanups) cleanup()
    expect(mocks.container.removeEventListener).toHaveBeenCalledWith("click", expect.any(Function))
    vi.unstubAllGlobals()
  })

  it("ignores unrelated popup clicks and reports a cancelled share without copying", async () => {
    const share = vi.fn().mockRejectedValue(new DOMException("closed", "AbortError"))
    const writeText = vi.fn()
    vi.stubGlobal("navigator", { share, clipboard: { writeText } })
    vi.stubGlobal("window", { location: { origin: "https://reporty.test" } })
    render([])
    mocks.refIndex = 0
    renderToStaticMarkup(createElement(LeafletMap, { reports: [], mascotas: [{ id: 9, species: "Gato", description: "Blanca", status: "Encontrada", createdAt: "2026-01-02", phone: "123", image: "", coordinates: [-27.36, -55.89] }] }))
    const listener = mocks.listeners.get("click")!
    const preventDefault = vi.fn()
    await listener({ target: { closest: () => null }, preventDefault })
    expect(share).not.toHaveBeenCalled()
    expect(preventDefault).not.toHaveBeenCalled()

    const output = { textContent: "" }
    await listener({ target: { closest: () => ({ dataset: { sharePet: "9" }, parentElement: { querySelector: () => output } }) }, preventDefault })
    expect(output.textContent).toBe("Compartir cancelado.")
    expect(writeText).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it("falls back to clipboard when the system share rejects and reports total failure honestly", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal("navigator", { share: vi.fn().mockRejectedValue(new Error("unavailable")), clipboard: { writeText } })
    vi.stubGlobal("window", { location: { origin: "https://reporty.test" } })
    render([])
    mocks.refIndex = 0
    renderToStaticMarkup(createElement(LeafletMap, { reports: [], mascotas: [{ id: 12, species: "Perro", description: "Negro", status: "Perdida", createdAt: "2026-01-02", phone: "456", image: "", coordinates: [-27.36, -55.89] }] }))
    const listener = mocks.listeners.get("click")!
    const output = { textContent: "" }
    const event = { target: { closest: () => ({ dataset: { sharePet: "12" }, parentElement: { querySelector: () => output } }) }, preventDefault: vi.fn() }
    await listener(event)
    expect(writeText).toHaveBeenCalledWith("https://reporty.test/mascotas/12")
    expect(output.textContent).toBe("Enlace copiado.")

    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } })
    output.textContent = ""
    await listener(event)
    expect(output.textContent).toBe("No pudimos compartir ni copiar el enlace.")
    vi.unstubAllGlobals()
  })

  it("still resets the view when an existing map is filtered to no reports", () => {
    render([report])
    render([])
    expect(mocks.map.setView).toHaveBeenLastCalledWith(INITIAL_MAP_VIEW_CONFIG.defaultCenter, INITIAL_MAP_VIEW_CONFIG.defaultZoom)
    expect(mocks.map.setView).toHaveBeenCalledTimes(2)
    expect(mocks.cluster.clearLayers).toHaveBeenCalledTimes(2)
  })
})
