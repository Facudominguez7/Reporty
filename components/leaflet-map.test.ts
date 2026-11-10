import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => {
  const calls: string[] = []
  const icons: Array<{ className: string; html: string; iconSize?: [number, number] }> = []
  const refs: Array<{ current: unknown }> = []
  const listeners = new Map<string, (event: unknown) => void>()
  const markerOptions: Array<{ title?: string; alt?: string }> = []
  const cleanups: Array<() => void> = []
  const container = { innerHTML: "", addEventListener: vi.fn((name: string, listener: (event: unknown) => void) => listeners.set(name, listener)), removeEventListener: vi.fn((name: string) => listeners.delete(name)) }
  const map = { setView: vi.fn(() => calls.push("setView")), on: vi.fn(), fitBounds: vi.fn(), remove: vi.fn(), attributionControl: { addAttribution: vi.fn() } }
  const cluster = { addTo: vi.fn(), clearLayers: vi.fn(), addLayer: vi.fn(() => calls.push("addLayer")), getLayers: vi.fn(() => []) }
  const marker = { bindPopup: vi.fn(), on: vi.fn() }
  return { calls, icons, refs, listeners, markerOptions, cleanups, container, map, cluster, marker, refIndex: 0 }
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
    marker: (_coordinates: unknown, options: { title?: string; alt?: string }) => { mocks.markerOptions.push(options); return mocks.marker },
    divIcon: (icon: { className: string; html: string; iconSize?: [number, number] }) => { mocks.icons.push(icon); return {} },
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

function render(reports: Parameters<typeof LeafletMap>[0]["reports"]) {
  mocks.refIndex = 0
  renderToStaticMarkup(createElement(LeafletMap, { reports }))
}

describe("LeafletMap initial view", () => {
  beforeEach(() => {
    mocks.calls.length = 0
    mocks.icons.length = 0
    mocks.refs.length = 0
    mocks.refIndex = 0
    mocks.listeners.clear()
    mocks.markerOptions.length = 0
    mocks.cleanups.length = 0
    vi.clearAllMocks()
  })

  it("sets the initial view before adding markers and keeps their popups", () => {
    render([report])
    expect(mocks.map.setView).toHaveBeenCalledOnce()
    expect(mocks.map.setView).toHaveBeenCalledWith(INITIAL_MAP_VIEW_CONFIG.defaultCenter, INITIAL_MAP_VIEW_CONFIG.defaultZoom)
    expect(mocks.map.attributionControl.addAttribution).toHaveBeenCalledWith('<a href="/terminos">Términos y condiciones</a>')
    expect(mocks.calls).toEqual(["tileLayer", "setView", "addLayer"])
    expect(mocks.marker.bindPopup).toHaveBeenCalledOnce()
  })

  it("renders escaped pet details inside a native detail link", () => {
    render([])
    // Rerender with a pet while the imperative map instance is active.
    mocks.refIndex = 0
    renderToStaticMarkup(createElement(LeafletMap, { reports: [], mascotas: [{ id: 9, species: "Gato <script>", description: `Blanca & "curiosa"`, status: "Encontrada", createdAt: "2026-01-02", phone: `123" onclick="x`, image: "javascript:alert(1)", coordinates: [-27.36, -55.89] }] }))
    const popup = mocks.marker.bindPopup.mock.calls.at(-1)?.[0] as string
    expect(popup.trim()).toMatch(/^<a href="\/mascotas\/9"[^>]*>[\s\S]*<\/a>$/)
    expect(popup).toContain("display:block;min-width:250px")
    expect(popup.match(/^\s*<a[^>]*>/)?.[0]).not.toMatch(/\b(?:tabindex|onclick|onkeydown)\s*=/i)
    expect(popup).not.toContain("data-share-pet")
    expect(popup).not.toContain("Ver ficha")
    expect(popup).not.toContain("Compartir")
    expect(popup).toContain("Encontrado")
    expect(popup).toContain("Gato &lt;script&gt;")
    expect(popup).toContain("Blanca &amp; &quot;curiosa&quot;")
    expect(popup).not.toContain("javascript:")
    expect(popup).not.toContain(`onclick="x`)
  })

  it("keeps the incident marker click callback", () => {
    const select = vi.fn()
    renderToStaticMarkup(createElement(LeafletMap, { reports: [report], onSeleccionarReporte: select }))
    const click = mocks.marker.on.mock.calls.find(([event]) => event === "click")?.[1] as () => void
    click()
    expect(select).toHaveBeenCalledWith(report.id)
  })

  it("matches incident popup layout while linking the entire pet content", () => {
    vi.stubGlobal("window", { location: { origin: "https://reporty.test" } })
    render([{ ...report, image: "/report.jpg" }])
    const incidentPopup = mocks.marker.bindPopup.mock.calls.at(-1)?.[0] as string
    mocks.refIndex = 0
    renderToStaticMarkup(createElement(LeafletMap, { reports: [], mascotas: [{ id: 9, species: 'Gato "<mimo>"', description: "A&".repeat(60), status: "Perdida", createdAt: "2026-01-02", phone: '<123>', image: '/foto?x="&y=1', coordinates: [-27.36, -55.89] }] }))
    const popup = mocks.marker.bindPopup.mock.calls.at(-1)?.[0] as string
    for (const style of ["min-width:250px;max-width:270px", "font-size:15px;font-weight:700", "margin-bottom:10px;overflow:hidden;border-radius:10px", "width:100%;height:124px;object-fit:cover", "min-height:26px", "padding-top:10px;border-top:1px solid var(--border)"]) {
      expect(incidentPopup).toContain(style)
      expect(popup).toContain(style)
    }
    expect(popup.indexOf("<h3")).toBeLessThan(popup.indexOf("<img"))
    expect(popup).toContain('src="https://reporty.test/foto?x=%22&amp;y=1"')
    expect(popup).toContain('alt="Gato &quot;&lt;mimo&gt;&quot;"')
    expect(popup).toContain("Teléfono: &lt;123&gt;")
    expect(popup).toContain(`${"A&amp;".repeat(55)}...`)
    expect(popup).toContain("background:var(--destructive)")
    expect(popup).not.toContain("Ver ficha")
    expect(popup).not.toContain("Compartir")
    expect(popup).toContain('href="/mascotas/9"')
    expect(popup).not.toContain("data-share-pet")
    expect(popup).not.toContain("data-share-status")
    expect(popup).not.toContain("Prioridad")
    vi.unstubAllGlobals()
  })

  it("does not create markers for invalid pet IDs", () => {
    render([])
    mocks.refIndex = 0
    const pet = { id: 9, species: "Gato", description: "", status: "Perdida" as const, createdAt: "2026-01-02", phone: "123", image: "", coordinates: [-27.36, -55.89] as [number, number] }
    const invalidIds = [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '9" onclick="x']
    renderToStaticMarkup(createElement(LeafletMap, { reports: [], mascotas: invalidIds.map((id) => ({ ...pet, id: id as number })) }))
    expect(mocks.marker.bindPopup).not.toHaveBeenCalled()
    expect(mocks.cluster.addLayer).not.toHaveBeenCalled()
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
    expect(petMarkers.every(({ iconSize, html }) => iconSize?.join(",") === "52,52" && html.includes("width:52px;height:52px"))).toBe(true)
  })

  it("uses a status adjective that agrees with the species in accessible marker labels", () => {
    render([])
    mocks.refIndex = 0
    renderToStaticMarkup(createElement(LeafletMap, { reports: [], mascotas: [
      { id: 9, species: "Gato", description: "Blanca", status: "Perdida", createdAt: "2026-01-02", phone: "123", image: "", coordinates: [-27.36, -55.89] },
    ] }))
    expect(mocks.markerOptions.at(-1)).toMatchObject({ title: "Gato perdido", alt: "Gato perdido" })
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
    expect(markers[0].html).toContain('width:calc(100% - 6px);height:calc(100% - 6px)')
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

  it("still resets the view when an existing map is filtered to no reports", () => {
    render([report])
    render([])
    expect(mocks.map.setView).toHaveBeenLastCalledWith(INITIAL_MAP_VIEW_CONFIG.defaultCenter, INITIAL_MAP_VIEW_CONFIG.defaultZoom)
    expect(mocks.map.setView).toHaveBeenCalledTimes(2)
    expect(mocks.cluster.clearLayers).toHaveBeenCalledTimes(2)
  })
})
