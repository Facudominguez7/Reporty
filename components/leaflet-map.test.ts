import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => {
  const calls: string[] = []
  const icons: Array<{ className: string; html: string; iconSize?: [number, number] }> = []
  const refs: Array<{ current: unknown }> = []
  const listeners = new Map<string, (event: unknown) => void>()
  const markerOptions: Array<{ title?: string; alt?: string; icon?: { html?: string } }> = []
  const cleanups: Array<() => void> = []
  const container = { innerHTML: "", addEventListener: vi.fn((name: string, listener: (event: unknown) => void) => listeners.set(name, listener)), removeEventListener: vi.fn((name: string) => listeners.delete(name)) }
  const map = {
    setView: vi.fn(() => calls.push("setView")), on: vi.fn(), once: vi.fn(), setMaxBounds: vi.fn(), fitBounds: vi.fn(), remove: vi.fn(),
    getBounds: vi.fn(() => ({ getWest: () => -55.95, getSouth: () => -27.4, getEast: () => -55.85, getNorth: () => -27.35 })),
    getZoom: vi.fn(() => 15),
  }
  const cluster = {
    addTo: vi.fn(), zoomToShowLayer: vi.fn(), hasLayer: vi.fn(() => true), off: vi.fn(() => calls.push("cluster.off")), clearLayers: vi.fn(() => calls.push("clearLayers")), addLayer: vi.fn(() => calls.push("addLayer")), removeLayer: vi.fn(() => calls.push("removeLayer")), getLayers: vi.fn(() => []),
    // Los lotes cuentan como un addLayer/removeLayer por marcador, para comparar con lo de antes.
    addLayers: vi.fn((capas: unknown[]) => capas.forEach(() => cluster.addLayer())),
    removeLayers: vi.fn((capas: unknown[]) => capas.forEach(() => cluster.removeLayer())),
  }
  const capaGrupos = { addTo: vi.fn(), clearLayers: vi.fn(), addLayer: vi.fn() }
  const marker = { bindPopup: vi.fn(), on: vi.fn(), once: vi.fn(), openPopup: vi.fn(), getLatLng: vi.fn(() => [-27.36, -55.9]) }
  return { calls, icons, refs, listeners, markerOptions, cleanups, container, map, cluster, capaGrupos, marker, refIndex: 0 }
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
    layerGroup: () => mocks.capaGrupos,
    marker: (_coordinates: unknown, options: { title?: string; alt?: string; icon?: { html?: string } }) => { mocks.markerOptions.push(options); return mocks.marker },
    divIcon: (icon: { className: string; html: string; iconSize?: [number, number] }) => { mocks.icons.push(icon); return icon },
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

/** Contenido de un popup: el de los reportes se arma recién al abrirlo (es una función). */
function contenidoPopup(contenido: unknown): string {
  return typeof contenido === "function" ? (contenido as () => string)() : (contenido as string)
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
    expect(mocks.calls).toEqual(["tileLayer", "setView", "addLayer"])
    expect(mocks.marker.bindPopup).toHaveBeenCalledOnce()
  })

  it("shows a green aura only on repaired report markers", () => {
    render([{ ...report, estadoId: 2, status: "Reparado" }, report])
    expect(mocks.markerOptions[0].icon?.html).toContain("repair-aura")
    expect(mocks.markerOptions[1].icon?.html).not.toContain("repair-aura")
  })

  it("pans open popups clear of the floating map controls", () => {
    render([report])
    const opciones = mocks.marker.bindPopup.mock.calls.at(-1)?.[1] as { autoPanPaddingTopLeft?: [number, number]; autoPanPaddingBottomRight?: [number, number] }
    expect(opciones.autoPanPaddingTopLeft?.[1]).toBeGreaterThanOrEqual(96)
    expect(opciones.autoPanPaddingTopLeft?.[0]).toBeGreaterThanOrEqual(64)
    expect(opciones.autoPanPaddingBottomRight?.[1]).toBeGreaterThanOrEqual(96)
  })

  it("lets an open popup pan past the city limits and restores them on close", () => {
    render([report])
    const manejador = (nombre: string) => mocks.map.on.mock.calls.find(([evento]) => evento === nombre)?.[1] as (evento: unknown) => void
    const cargas: Array<() => void> = []
    const imagen = { complete: false, addEventListener: vi.fn((_: string, fn: () => void) => cargas.push(fn)) }
    const popup = { update: vi.fn(), getElement: () => ({ querySelectorAll: () => [imagen] }) }

    manejador("popupopen")({ popup })
    expect(mocks.map.setMaxBounds).toHaveBeenCalledOnce()
    expect(popup.update).toHaveBeenCalledOnce()
    cargas.forEach((fn) => fn())
    expect(popup.update).toHaveBeenCalledTimes(2)

    manejador("popupclose")({ popup })
    expect(mocks.map.setMaxBounds).toHaveBeenCalledTimes(2)
  })

  it("shows the report neighborhood with its ODbL attribution instead of the coordinates (#299)", () => {
    render([{ ...report, barrio: "Villa <Sarita>" }])
    const popup = contenidoPopup(mocks.marker.bindPopup.mock.calls.at(-1)?.[0])
    expect(popup).toContain("Barrio Villa &lt;Sarita&gt;")
    expect(popup).not.toContain(">Location<")
    expect(popup).toContain("Secretaría de Movilidad Urbana, Dirección SIG-IDE, Municipalidad de Posadas (ODbL)")
  })

  it("keeps the coordinates and no attribution when the report has no neighborhood", () => {
    render([{ ...report, barrio: null }])
    const popup = contenidoPopup(mocks.marker.bindPopup.mock.calls.at(-1)?.[0])
    expect(popup).toContain(">Location<")
    expect(popup).not.toContain("ODbL")
  })

  it("renders escaped pet details inside a native detail link", () => {
    render([])
    // Rerender with a pet while the imperative map instance is active.
    mocks.refIndex = 0
    renderToStaticMarkup(createElement(LeafletMap, { reports: [], mascotas: [{ id: 9, species: "Gato <script>", description: `Blanca & "curiosa"`, status: "Encontrada", createdAt: "2026-01-02", phone: `123" onclick="x`, image: "javascript:alert(1)", coordinates: [-27.36, -55.89] }] }))
    const popup = contenidoPopup(mocks.marker.bindPopup.mock.calls.at(-1)?.[0])
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
    const incidentPopup = contenidoPopup(mocks.marker.bindPopup.mock.calls.at(-1)?.[0])
    mocks.refIndex = 0
    renderToStaticMarkup(createElement(LeafletMap, { reports: [], mascotas: [{ id: 9, species: 'Gato "<mimo>"', description: "A&".repeat(60), status: "Perdida", createdAt: "2026-01-02", phone: '<123>', image: '/foto?x="&y=1', coordinates: [-27.36, -55.89] }] }))
    const popup = contenidoPopup(mocks.marker.bindPopup.mock.calls.at(-1)?.[0])
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
    expect(mocks.cluster.removeLayer).toHaveBeenCalledOnce()
  })

  it("marca con aro violeta y escudo los reportes tomados por la Defensoría, sin revelar el número", () => {
    render([{ ...report, id: 2, estadoId: 4, status: "Tomado por Defensoría " }])

    const html = mocks.markerOptions.at(-1)?.icon?.html ?? ""
    // Aro violeta alrededor del punto, conservando el color de prioridad del círculo (S8).
    expect(html).toContain("border:3px solid var(--semantic-admin)")
    expect(html).toContain("border-radius:50%")
    expect(html).toContain("background-color: var(--priority-medium)")
    // Escudo violeta conservado (S8).
    expect(html).toContain("Tomado por la Defensoría del Pueblo")

    // El popup distingue la toma pero nunca muestra el número de reclamo (S9): sin rótulo
    // «Reclamo Nº» ni píldora con el número.
    const popup = contenidoPopup(mocks.marker.bindPopup.mock.calls.at(-1)?.[0])
    expect(popup).toContain("Tomado por la Defensoría del Pueblo")
    expect(popup).toMatch(/Creado el \d/)
    expect(popup).not.toContain("Reclamo")
  })

  it("mantiene el aro violeta y conserva la información de cuadrilla en el popup cuando ambos conviven", () => {
    render([
      { ...report, id: 3, estadoId: 4, status: "Tomado por Defensoría", estadoOperativo: "en_progreso", cuadrillaNombre: "Cuadrilla Norte" },
    ])

    const html = mocks.markerOptions.at(-1)?.icon?.html ?? ""
    expect(html).toContain("Tomado por la Defensoría del Pueblo")
    expect(html).toContain('title="Con cuadrilla asignada" style="position:absolute;top:-3px;left:-3px;')
    const popup = contenidoPopup(mocks.marker.bindPopup.mock.calls.at(-1)?.[0])
    expect(popup).toContain("En progreso · Cuadrilla Norte")
  })

  it("conserva el marcador de cuadrilla original para un Pendiente con cuadrilla", () => {
    render([{ ...report, id: 4, estadoOperativo: "en_progreso", cuadrillaNombre: "Cuadrilla Norte" }])

    const html = mocks.markerOptions.at(-1)?.icon?.html ?? ""
    expect(html).toContain("Con cuadrilla asignada")
    expect(html).not.toContain("Tomado por la Defensoría del Pueblo")
  })

  describe("carga por zona (#281)", () => {
    const otro = { ...report, id: 2, coordinates: [-27.37, -55.9] as [number, number] }
    const grupo = { lat: -27.37, lon: -55.9, cantidad: 412, limites: { oeste: -55.91, sur: -27.38, este: -55.89, norte: -27.36 } }

    function renderZona(props: Partial<Parameters<typeof LeafletMap>[0]>) {
      mocks.refIndex = 0
      renderToStaticMarkup(createElement(LeafletMap, { reports: [], onCambioZona: vi.fn(), ...props }))
    }

    it("avisa la zona visible y el zoom cuando el mapa termina de moverse", () => {
      const onCambioZona = vi.fn()
      renderZona({ onCambioZona })

      const alMover = mocks.map.on.mock.calls.find(([evento]) => evento === "moveend")?.[1] as () => void
      alMover()

      expect(onCambioZona).toHaveBeenCalledWith({ oeste: -55.95, sur: -27.4, este: -55.85, norte: -27.35 }, 15)
    })

    it("suma y quita marcadores por ID sin redibujar los que siguen", () => {
      renderZona({ reports: [report] })
      mocks.cluster.addLayer.mockClear()

      renderZona({ reports: [report, otro] })
      expect(mocks.cluster.addLayer).toHaveBeenCalledOnce()
      expect(mocks.cluster.removeLayer).not.toHaveBeenCalled()
      expect(mocks.cluster.clearLayers).not.toHaveBeenCalled()

      renderZona({ reports: [otro] })
      expect(mocks.cluster.removeLayer).toHaveBeenCalledOnce()
      expect(mocks.cluster.addLayer).toHaveBeenCalledOnce()
    })

    it("redibuja un marcador cuyo reporte cambió", () => {
      renderZona({ reports: [report] })
      mocks.cluster.addLayer.mockClear()

      renderZona({ reports: [{ ...report, estadoId: 2, status: "Reparado" }] })

      expect(mocks.cluster.removeLayer).toHaveBeenCalledOnce()
      expect(mocks.cluster.addLayer).toHaveBeenCalledOnce()
      expect(mocks.markerOptions.at(-1)?.icon?.html).toContain("repair-aura")
    })

    it("mover el mapa no lo vuelve a encuadrar", () => {
      renderZona({ reports: [report] })
      renderZona({ reports: [otro] })
      renderZona({ reports: [] })

      expect(mocks.map.fitBounds).not.toHaveBeenCalled()
      expect(mocks.map.setView).toHaveBeenCalledOnce()
    })

    it("al cambiar a la capa de mascotas se sigue encuadrando en las mascotas", () => {
      const mascota = { id: 5, species: "Perro", status: "Perdida", phone: "1", description: "", createdAt: "2026-01-01", coordinates: [-27.36, -55.9] as [number, number], image: null }
      renderZona({ reports: [report] })
      renderZona({ reports: [], mascotas: [mascota] as never })

      expect(mocks.map.setView).toHaveBeenCalledTimes(2)
    })

    it("con muchos reportes los suma al mapa en un solo lote y arma cada popup recién al abrirlo", () => {
      const muchos = Array.from({ length: 50 }, (_, i) => ({ ...report, id: 100 + i }))
      renderZona({ reports: muchos })

      expect(mocks.cluster.addLayers).toHaveBeenCalledOnce()
      expect(mocks.cluster.addLayers.mock.calls[0][0]).toHaveLength(50)
      expect(typeof mocks.marker.bindPopup.mock.calls[0][0]).toBe("function")

      renderZona({ reports: muchos.slice(10) })
      expect(mocks.cluster.removeLayers).toHaveBeenCalledOnce()
      expect(mocks.cluster.removeLayers.mock.calls[0][0]).toHaveLength(10)
    })

    it("al desmontar cancela lo pendiente del grupo antes de vaciarlo (si no, el foco en curso rompe la página)", () => {
      renderZona({ reports: [report] })
      mocks.calls.length = 0

      for (const limpiar of mocks.cleanups) limpiar()

      expect(mocks.calls.indexOf("cluster.off")).toBeGreaterThanOrEqual(0)
      expect(mocks.calls.indexOf("cluster.off")).toBeLessThan(mocks.calls.indexOf("clearLayers"))
    })

    it("si llega una zona antes de abrir el popup del reporte en foco, lo vuelve a intentar", () => {
      const foco = { reporteId: report.id, lat: -27.36, lon: -55.9 }
      renderZona({ reports: [report], focoReporte: foco })
      expect(mocks.cluster.zoomToShowLayer).toHaveBeenCalledOnce()

      renderZona({ reports: [report, otro], focoReporte: foco })
      expect(mocks.cluster.zoomToShowLayer).toHaveBeenCalledTimes(2)

      // Abierto el popup, las zonas siguientes ya no lo tocan.
      const alAbrir = mocks.marker.once.mock.calls.find(([evento]) => evento === "popupopen")?.[1] as () => void
      alAbrir()
      renderZona({ reports: [otro, report], focoReporte: foco })
      expect(mocks.cluster.zoomToShowLayer).toHaveBeenCalledTimes(2)
    })

    it("si el usuario mueve el mapa antes de que se abra el popup del foco, no lo arrastra de vuelta", () => {
      const foco = { reporteId: report.id, lat: -27.36, lon: -55.9 }
      renderZona({ reports: [report], focoReporte: foco })

      const alArrastrar = mocks.map.once.mock.calls.find(([evento]) => evento === "dragstart")?.[1] as () => void
      alArrastrar()
      renderZona({ reports: [report, otro], focoReporte: foco })

      expect(mocks.cluster.zoomToShowLayer).toHaveBeenCalledOnce()
    })

    it("dibuja los grupos con su cantidad y al tocar uno se acerca a sus límites", () => {
      renderZona({ grupos: [grupo] })

      expect(mocks.capaGrupos.addLayer).toHaveBeenCalledOnce()
      const icono = mocks.markerOptions.at(-1)?.icon?.html ?? ""
      expect(icono).toContain("412")
      expect(mocks.markerOptions.at(-1)?.title).toBe("412 reportes en esta zona")

      const tocar = mocks.marker.on.mock.calls.findLast(([evento]) => evento === "click")?.[1] as () => void
      tocar()
      expect(mocks.map.fitBounds).toHaveBeenCalledWith([[-27.38, -55.91], [-27.36, -55.89]], { padding: [24, 24] })
    })

    it("al pasar de grupos a puntos borra los grupos", () => {
      renderZona({ grupos: [grupo] })
      mocks.capaGrupos.clearLayers.mockClear()

      renderZona({ reports: [report], grupos: [] })

      expect(mocks.capaGrupos.clearLayers).toHaveBeenCalled()
      expect(mocks.capaGrupos.addLayer).toHaveBeenCalledOnce()
    })
  })
})
