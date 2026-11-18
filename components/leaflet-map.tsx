/**
 * Interactive map component powered by Leaflet.
 *
 * Uses an imperative Leaflet setup to avoid container reuse issues during
 * refreshes and re-renders while preserving clustering and popup behavior.
 */

"use client"

import { useCallback, useEffect, useMemo, useRef } from "react"
import L from "leaflet"
import "leaflet.markercluster"

import { getCategoryColor, getPriorityColor, getStatusColor } from "@/components/report-card"
import { ETIQUETAS_ESTADO_OPERATIVO, REPORT_STATE_IDS, type EstadoOperativo } from "@/lib/authz/catalog"
import type { MascotaMapa } from "@/database/queries/mascotas/mapa"
import { getPetStatusAdjective } from "@/lib/mascotas/status-label"
import { categoryIconNodes, getCategoryIconNode, iconNodeToSvgMarkup } from "@/lib/icons/category-icons"
import {
  INITIAL_MAP_VIEW_CONFIG,
  MAP_MAX_ZOOM,
  MAP_TILE_ATTRIBUTION,
  MAP_TILE_URL,
  POSADAS_BOUNDS,
  POSADAS_MIN_ZOOM,
} from "@/lib/map/initial-view"
import { formatearFechaArgentina } from "@/lib/fechas/fecha-base"
import { ZOOM_FOCO_REPORTE, type FocoReporte } from "@/lib/map/foco-reporte"

interface Report {
  id: number
  title: string
  description: string
  category: string
  priority: string
  status: string
  estadoId?: number | null
  location: string
  coordinates: [number, number]
  author: string
  createdAt: string
  image?: string
  estadoOperativo?: EstadoOperativo | null
  cuadrillaNombre?: string | null
}

export interface LeafletMapProps {
  reports: Report[]
  onSeleccionarReporte?: (reporteId: number) => void
  mascotas?: MascotaMapa[]
  /** Reporte al que el mapa se acerca y abre su popup en la primera vista. */
  focoReporte?: FocoReporte | null
}

type LeafletContainer = HTMLDivElement & { _leaflet_id?: number }

/**
 * Opciones de los popups del mapa. El margen del auto-desplazamiento deja libre la zona de los
 * controles flotantes (encabezado, pestañas, filtros y zoom arriba; botones y navegación abajo),
 * que se dibujan por encima del mapa y tapaban la parte superior del popup.
 */
const OPCIONES_POPUP = {
  maxWidth: 300,
  autoPanPaddingTopLeft: [64, 112] as [number, number],
  autoPanPaddingBottomRight: [16, 104] as [number, number],
}

/**
 * Vuelve a calcular el popup cuando terminan de cargar sus imágenes. Leaflet desplaza el mapa
 * una sola vez al abrirlo; si la foto llega después, el popup crece hacia arriba y queda debajo
 * de los controles flotantes. `update()` recalcula el tamaño y repite el desplazamiento.
 *
 * @param evento - Evento `popupopen` del mapa.
 */
const reajustarPopupAlCargarImagenes = (evento: { popup: { update: () => void; getElement: () => HTMLElement | undefined } }) => {
  const imagenes = evento.popup.getElement()?.querySelectorAll("img") ?? []
  for (const imagen of Array.from(imagenes)) {
    if (!imagen.complete) imagen.addEventListener("load", () => evento.popup.update(), { once: true })
  }
}

const createClusterIconHTML = (count: number): string => {
  const size = count > 10 ? 50 : count > 5 ? 40 : 30
  const color = count > 10 ? "var(--map-heat-high)" : count > 5 ? "var(--map-heat-medium)" : "var(--map-heat-low)"
  const fontSize = count > 10 ? 16 : count > 5 ? 14 : 12

  return `
    <div style="
      background-color: ${color};
      width: ${size}px;
      height: ${size}px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--map-marker-foreground);
      font-weight: bold;
      font-size: ${fontSize}px;
      border: 3px solid var(--map-marker-stroke);
      box-shadow: var(--elevation-soft);
    ">
      ${count}
    </div>
  `
}

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
}

/**
 * Escapes text for both HTML content and quoted attribute values. Popups are built as
 * HTML strings, so quotes must be escaped too: a report title lands inside `alt="..."`.
 */
const escapeHtml = (text: string | null | undefined): string =>
  (text ?? "").replace(/[&<>"']/g, (char) => HTML_ESCAPES[char])

/** Only http(s) image URLs may reach the popup `<img src>`; anything else is dropped. */
const toSafeImageUrl = (value: string | null | undefined): string | null => {
  if (!value) {
    return null
  }

  try {
    const url = new URL(value, window.location.origin)
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null
  } catch {
    return null
  }
}

const createLucideIconMarkup = (innerMarkup: string, size = 14): string => `
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="${size}"
    height="${size}"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    style="display:block;flex-shrink:0"
    aria-hidden="true"
  >
    ${innerMarkup}
  </svg>
`

const createCategoryIconMarkup = (category: string): string =>
  createLucideIconMarkup(iconNodeToSvgMarkup(getCategoryIconNode(category)), 22)

const popupIcons = {
  location: createLucideIconMarkup('<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" /><circle cx="12" cy="10" r="3" />'),
  status: createLucideIconMarkup('<circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="1" />'),
  category: createLucideIconMarkup('<path d="M12.586 2.586a2 2 0 0 1 2.828 0l6 6a2 2 0 0 1 0 2.828l-8 8a2 2 0 0 1-1.414.586H6a2 2 0 0 1-2-2v-6a2 2 0 0 1 .586-1.414z" /><circle cx="7.5" cy="7.5" r=".5" fill="currentColor" stroke="none" />'),
  priority: createLucideIconMarkup('<path d="M4 22V4" /><path d="M4 4h11l-1 5 1 5H4" />'),
  author: createLucideIconMarkup('<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />'),
  date: createLucideIconMarkup('<path d="M8 2v4" /><path d="M16 2v4" /><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M3 10h18" />'),
  phone: createLucideIconMarkup('<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.96.35 1.9.68 2.8a2 2 0 0 1-.45 2.11L8.07 9.91a16 16 0 0 0 6 6l1.28-1.27a2 2 0 0 1 2.11-.45c.9.33 1.84.56 2.8.68A2 2 0 0 1 22 16.92z" />'),
} as const

type PopupChipTone = {
  background: string
  border: string
  text: string
}

const createPopupChip = (label: string, tone: PopupChipTone, iconMarkup: string): string => `
  <span style="
    display:inline-flex;
    align-items:center;
    gap:6px;
    min-height:26px;
    padding:0 9px;
    border-radius:999px;
    border:1px solid ${tone.border};
    background:${tone.background};
    color:${tone.text};
    font-size:11px;
    font-weight:600;
    line-height:1;
    white-space:nowrap;
  ">
    <span style="display:inline-flex;align-items:center;justify-content:center;">${iconMarkup}</span>
    <span>${label}</span>
  </span>
`

const createPopupContent = (
  report: Report,
  statusColor: string,
  priorityColor: string,
  categoryColor: string
): string => {
  const safeTitle = escapeHtml(report.title)
  const safeLocation = escapeHtml(report.location)
  const safeCategory = escapeHtml(report.category)
  const safePriority = escapeHtml(report.priority)
  const safeStatus = escapeHtml(report.status)
  const safeAuthor = escapeHtml(report.author)
  const imageUrl = toSafeImageUrl(report.image)
  const safeImage = imageUrl ? escapeHtml(imageUrl) : null
  const safeDate = escapeHtml(formatearFechaArgentina(report.createdAt))
  // Truncate before escaping so the cut never splits an HTML entity.
  const description = report.description ?? ""
  const truncatedDescription = escapeHtml(
    description.length > 110 ? `${description.substring(0, 110)}...` : description
  )

  const statusTone: PopupChipTone = {
    background: statusColor,
    border: "transparent",
    text:
      report.status === "Rechazado"
        ? "var(--destructive-foreground)"
        : "var(--primary-foreground)",
  }
  const categoryTone: PopupChipTone = {
    background: categoryColor,
    border: "transparent",
    text: "var(--card)",
  }
  const priorityTone: PopupChipTone = {
    background: priorityColor,
    border: "transparent",
    text:
      report.priority === "Alta"
        ? "var(--destructive-foreground)"
        : report.priority === "Media"
          ? "var(--primary-foreground)"
          : "var(--card)",
  }
  const estadoOperativo = report.estadoOperativo
    ? `<span style="display:inline-flex;align-items:center;gap:6px;min-height:26px;padding:0 9px;border-radius:999px;border:1px solid var(--semantic-admin-border);background:var(--semantic-admin-soft);color:var(--semantic-admin);font-size:11px;font-weight:600;line-height:1;white-space:nowrap;">
        ${escapeHtml(ETIQUETAS_ESTADO_OPERATIVO[report.estadoOperativo])}${report.cuadrillaNombre ? ` · ${escapeHtml(report.cuadrillaNombre)}` : ""}
      </span>`
    : ""
  // Toma de la Defensoría: píldora violeta que distingue la toma sin revelar el número (S8, S9);
  // el número de reclamo solo lo ve el autor en su ficha.
  const tomadoDefensoria = report.estadoId === REPORT_STATE_IDS.TOMADO_DEFENSORIA
    ? `<span style="display:inline-flex;align-items:center;gap:6px;min-height:26px;padding:0 9px;border-radius:999px;border:1px solid var(--semantic-admin-border);background:var(--semantic-admin-soft);color:var(--semantic-admin);font-size:11px;font-weight:600;line-height:1;white-space:nowrap;">
        Tomado por la Defensoría del Pueblo
      </span>`
    : ""

  return `
    <a href="/reportes/${report.id}" style="display:block;min-width:250px;max-width:270px;color:var(--foreground);font-size:13px;line-height:1.45;text-decoration:none;">
      <div style="margin-bottom:10px;">
        <h3 style="margin:0 0 6px;font-size:15px;font-weight:700;line-height:1.3;color:var(--foreground);">
          ${safeTitle}
        </h3>
        <p style="margin:0;display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted-foreground);">
          <span style="display:inline-flex;color:var(--primary);">${popupIcons.location}</span>
          <span>${safeLocation}</span>
        </p>
      </div>

      ${safeImage ? `
        <div style="margin-bottom:10px;overflow:hidden;border-radius:10px;">
          <img
            src="${safeImage}"
            alt="${safeTitle}"
            style="display:block;width:100%;height:124px;object-fit:cover;"
          />
        </div>
      ` : ""}

      <p style="margin:0 0 10px;font-size:13px;color:var(--foreground);line-height:1.5;">
        ${truncatedDescription}
      </p>

      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px;">
        ${createPopupChip(safeStatus, statusTone, popupIcons.status)}
        ${createPopupChip(safeCategory, categoryTone, popupIcons.category)}
        ${createPopupChip(safePriority, priorityTone, popupIcons.priority)}
        ${estadoOperativo}
        ${tomadoDefensoria}
      </div>

      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding-top:10px;border-top:1px solid var(--border);font-size:11px;color:var(--muted-foreground);">
        <span style="display:inline-flex;align-items:center;gap:6px;min-width:0;">
          <span style="display:inline-flex;">${popupIcons.author}</span>
          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${safeAuthor}</span>
        </span>
        <span style="display:inline-flex;align-items:center;gap:6px;white-space:nowrap;">
          <span style="display:inline-flex;">${popupIcons.date}</span>
          <span>Creado el ${safeDate}</span>
        </span>
      </div>
    </a>
  `
}

/**
 * Lleva el mapa al reporte pedido desde su detalle. Si el reporte está entre los pendientes
 * del mapa, lo saca del cluster y abre su popup; si no (reparado o rechazado), igual centra
 * la vista en su ubicación y la marca con un círculo para que se vea dónde está.
 *
 * @param map - Mapa de Leaflet ya creado.
 * @param clusterGroup - Grupo de clusters que contiene los marcadores.
 * @param foco - Reporte y coordenadas a mostrar.
 * @param marcador - Marcador del reporte, o `null` si no está en el mapa.
 */
function enfocarReporte(
  map: L.Map,
  clusterGroup: L.MarkerClusterGroup,
  foco: FocoReporte,
  marcador: L.Marker | null
) {
  if (marcador) {
    map.setView(marcador.getLatLng(), ZOOM_FOCO_REPORTE)
    clusterGroup.zoomToShowLayer(marcador, () => marcador.openPopup())
    return
  }

  map.setView([foco.lat, foco.lon], ZOOM_FOCO_REPORTE)
  L.circleMarker([foco.lat, foco.lon], {
    radius: 12,
    color: "var(--semantic-info)",
    fillColor: "var(--semantic-info)",
    fillOpacity: 0.6,
  }).addTo(map)
}

/**
 * Mapa principal de Leaflet con reportes y mascotas agrupados en clusters.
 *
 * @param focoReporte - Reporte al que la primera vista se acerca y abre su popup.
 */
export default function LeafletMap({ reports, mascotas = [], onSeleccionarReporte, focoReporte = null }: LeafletMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<L.Map | null>(null)
  const tileLayerRef = useRef<L.TileLayer | null>(null)
  const clusterGroupRef = useRef<L.MarkerClusterGroup | null>(null)
  const hasInitialViewRef = useRef(false)

  const iconsByPriority = useMemo(() => {
    // Aro violeta alrededor de todo el punto (S8): la gente ve en el mapa que la Defensoría
    // tomó el reclamo, sin tapar el color de prioridad ni el ícono de categoría.
    const ARO_DEFENSORIA = '<div style="position:absolute;inset:-5px;border-radius:50%;border:3px solid var(--semantic-admin);pointer-events:none;"></div>'
    // Cuando coinciden, el escudo queda a la derecha y el punto de cuadrilla a la izquierda.
    const ESCUDO_DEFENSORIA = '<div title="Tomado por la Defensoría del Pueblo" style="position:absolute;top:-6px;right:-6px;width:16px;height:16px;border-radius:50%;background-color:var(--semantic-admin);border:2px solid var(--map-marker-stroke);display:flex;align-items:center;justify-content:center;"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="width:9px;height:9px;"><path d="M12 3 3 7.5V12c0 5 3.8 8.3 9 9.5 5.2-1.2 9-4.5 9-9.5V7.5L12 3Z"/></svg></div>'
    /** Conserva el punto original y lo desplaza si comparte el marcador con el escudo. */
    const puntoCuadrilla = (tieneDefensoria: boolean) => `<div title="Con cuadrilla asignada" style="position:absolute;top:-3px;${tieneDefensoria ? "left" : "right"}:-3px;width:12px;height:12px;border-radius:50%;background-color:var(--semantic-admin);border:2px solid var(--map-marker-stroke);"></div>`
    const mk = (color: string, category: string, hasCrew = false, tieneDefensoria = false) =>
      L.divIcon({
        className: "custom-marker",
        html: `
          <div style="position:relative;width:36px;height:36px;">
          ${tieneDefensoria ? ARO_DEFENSORIA : ""}
          <div style="
            background-color: ${color};
            width: 36px;
            height: 36px;
            border-radius: 50%;
            border: 3px solid var(--map-marker-stroke);
            box-shadow: var(--elevation-soft);
            display: flex;
            align-items: center;
            justify-content: center;
            color: var(--map-marker-foreground);
            ${hasCrew && !tieneDefensoria ? "opacity:0.5;" : ""}
          ">
            ${createCategoryIconMarkup(category)}
          </div>
          ${hasCrew ? puntoCuadrilla(tieneDefensoria) : ""}
          ${tieneDefensoria ? ESCUDO_DEFENSORIA : ""}
          </div>
        `,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      })

    const icons = new Map<string, L.DivIcon>()
    for (const priority of ["Alta", "Media", "Baja", "default"]) {
      const color = priority === "default" ? "var(--map-heat-neutral)" : getPriorityColor(priority)
      for (const category of Object.keys(categoryIconNodes)) {
        // Clave `<cuadrilla><defensoria>`: las dos señales conviven en un mismo marcador.
        icons.set(`${priority}|${category}|00`, mk(color, category))
        icons.set(`${priority}|${category}|10`, mk(color, category, true))
        icons.set(`${priority}|${category}|01`, mk(color, category, false, true))
        icons.set(`${priority}|${category}|11`, mk(color, category, true, true))
      }
    }
    return icons
  }, [])

  const getIcon = useCallback(
    (priority: string, category: string, clave: "00" | "10" | "01" | "11" = "00") => {
      const normalized = priority.charAt(0).toUpperCase() + priority.slice(1).toLowerCase()
      const normalizedCategory = categoryIconNodes[category] ? category : "default"
      return iconsByPriority.get(`${normalized}|${normalizedCategory}|${clave}`) ?? iconsByPriority.get(`default|default|${clave}`)!
    },
    [iconsByPriority]
  )

  useEffect(() => {
    const container = containerRef.current as LeafletContainer | null

    if (!container || mapRef.current) {
      return
    }

    // Leaflet stores an internal container id; clear it before re-initializing
    // so strict-mode remounts and fast refresh do not reuse a stale instance.
    if (container._leaflet_id) {
      delete container._leaflet_id
    }

    container.innerHTML = ""

    // No center yet: Leaflet adds layers and requests tiles only once the first view is set,
    // so the effect below requests the tiles of the final view and nothing else.
    // Limit panning to the reports map's regional bounds.
    const [south, west, north, east] = POSADAS_BOUNDS
    const handlePetImageError = (event: Event) => {
      const image = event.target
      if (image instanceof HTMLImageElement && image.dataset.petMarkerImage !== undefined) image.style.display = "none"
    }
    container.addEventListener("error", handlePetImageError, true)

    const limitesCiudad = L.latLngBounds([south, west], [north, east])
    const map = L.map(container, {
      scrollWheelZoom: true,
      zoomControl: true,
      maxBounds: limitesCiudad,
      maxBoundsViscosity: 1,
      minZoom: POSADAS_MIN_ZOOM,
      maxZoom: MAP_MAX_ZOOM,
    })

    const tileLayer = L.tileLayer(MAP_TILE_URL, {
      attribution: MAP_TILE_ATTRIBUTION,
    })

    const clusterGroup = L.markerClusterGroup({
      maxClusterRadius: 42,
      animate: true,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      // Keep clustering through the maximum visible zoom so overlapping reports can spiderfy.
      disableClusteringAtZoom: MAP_MAX_ZOOM + 1,
      spiderfyOnMaxZoom: true,
      iconCreateFunction: (cluster) => {
        const count = cluster.getChildCount()
        const size = count > 10 ? 50 : count > 5 ? 40 : 30

        return L.divIcon({
          html: createClusterIconHTML(count),
          className: "custom-cluster-icon",
          iconSize: L.point(size, size),
        })
      },
    })

    tileLayer.addTo(map)
    clusterGroup.addTo(map)

    // La vista inicial ya toca el límite norte: con los límites activos Leaflet no puede
    // desplazar el mapa para mostrar un popup alto. Se liberan mientras hay uno abierto y,
    // al cerrarlo, el mapa vuelve dentro de la ciudad.
    map.on("popupopen", (evento) => {
      map.setMaxBounds(L.latLngBounds([]))
      evento.popup.update()
      reajustarPopupAlCargarImagenes(evento)
    })
    map.on("popupclose", () => map.setMaxBounds(limitesCiudad))

    map.on("zoomend", () => {
      if (map.getZoom() < MAP_MAX_ZOOM) return

      const visibleLayers = clusterGroup.getLayers()
      for (const layer of visibleLayers) {
        const spiderfy = (layer as L.Layer & { spiderfy?: () => void }).spiderfy
        if (spiderfy) spiderfy.call(layer)
      }
    })

    mapRef.current = map
    tileLayerRef.current = tileLayer
    clusterGroupRef.current = clusterGroup

    return () => {
      container.removeEventListener("error", handlePetImageError, true)
      clusterGroupRef.current?.clearLayers()
      clusterGroupRef.current = null
      tileLayerRef.current = null

      map.remove()
      mapRef.current = null
      hasInitialViewRef.current = false

      if (container._leaflet_id) {
        delete container._leaflet_id
      }

      container.innerHTML = ""
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    const clusterGroup = clusterGroupRef.current

    if (!map || !clusterGroup) {
      return
    }

    const isInitialView = !hasInitialViewRef.current
    if (isInitialView) {
      // Start tile requests while the initial markers are being prepared.
      map.setView(INITIAL_MAP_VIEW_CONFIG.defaultCenter, INITIAL_MAP_VIEW_CONFIG.defaultZoom)
      hasInitialViewRef.current = true
    }

    clusterGroup.clearLayers()

    const visibleItems = reports.length ? reports : mascotas
    let marcadorEnFoco: L.Marker | null = null
    for (const report of reports) {
      // El estado exacto «Tomado por Defensoría» enciende el aro violeta y el escudo; el punto
      // de cuadrilla se mantiene cuando además hay una cuadrilla asignada (S8).
      const tieneDefensoria = report.status === "Tomado por Defensoría"
      const tieneCuadrilla = Boolean(report.estadoOperativo)
      const clave = `${tieneCuadrilla ? 1 : 0}${tieneDefensoria ? 1 : 0}` as "00" | "10" | "01" | "11"
      const marker = L.marker([report.coordinates[0], report.coordinates[1]], {
        icon: getIcon(report.priority, report.category, clave),
      })

      const popupContent = createPopupContent(
        report,
        getStatusColor(report.status),
        getPriorityColor(report.priority),
        getCategoryColor()
      )

      marker.bindPopup(popupContent, OPCIONES_POPUP)
      if (onSeleccionarReporte) {
        marker.on("click", () => onSeleccionarReporte(report.id))
      }
      clusterGroup.addLayer(marker)
      if (focoReporte?.reporteId === report.id) {
        marcadorEnFoco = marker
      }
    }

    for (const pet of mascotas) {
      if (!Number.isSafeInteger(pet.id) || pet.id <= 0) continue
      const imageUrl = toSafeImageUrl(pet.image)
      const statusLabel = getPetStatusAdjective(pet.status)
      const label = `${pet.species} ${statusLabel.toLowerCase()}`
      const marker = L.marker(pet.coordinates, { title: label, alt: label, icon: L.divIcon({ className: "pet-marker", html: `<span aria-hidden="true" style="position:relative;display:grid;place-items:center;width:52px;height:52px;overflow:hidden;border:3px solid var(--map-marker-stroke);border-radius:50%;background:${pet.status === "Perdida" ? "var(--destructive)" : "var(--primary)"};color:var(--map-marker-foreground);font-weight:700;box-shadow:var(--elevation-soft)">${pet.status === "Perdida" ? "P" : "E"}${imageUrl ? `<img data-pet-marker-image src="${escapeHtml(imageUrl)}" alt="" style="position:absolute;inset:3px;width:calc(100% - 6px);height:calc(100% - 6px);object-fit:cover;border-radius:50%">` : ""}</span>`, iconSize: [52, 52], iconAnchor: [26, 26] }) })
      const description = pet.description ?? ""
      const popup = `
        <a href="/mascotas/${pet.id}" style="display:block;min-width:250px;max-width:270px;color:var(--foreground);font-size:13px;line-height:1.45;text-decoration:none;">
          <div style="margin-bottom:10px;">
            <h3 style="margin:0 0 6px;font-size:15px;font-weight:700;line-height:1.3;color:var(--foreground);">${escapeHtml(pet.species)}</h3>
            <p style="margin:0;display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted-foreground);">
              <span style="display:inline-flex;color:var(--primary);">${popupIcons.phone}</span>
              <span>Teléfono: ${escapeHtml(pet.phone)}</span>
            </p>
          </div>
          ${imageUrl ? `<div style="margin-bottom:10px;overflow:hidden;border-radius:10px;"><img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(pet.species)}" style="display:block;width:100%;height:124px;object-fit:cover;" /></div>` : ""}
          <p style="margin:0 0 10px;font-size:13px;color:var(--foreground);line-height:1.5;">${escapeHtml(description.length > 110 ? `${description.substring(0, 110)}...` : description)}</p>
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px;">
            ${createPopupChip(escapeHtml(statusLabel), { background: pet.status === "Perdida" ? "var(--destructive)" : "var(--primary)", border: "transparent", text: pet.status === "Perdida" ? "var(--destructive-foreground)" : "var(--primary-foreground)" }, popupIcons.status)}
          </div>
          <div style="display:flex;align-items:center;gap:6px;padding-top:10px;border-top:1px solid var(--border);font-size:11px;color:var(--muted-foreground);">
            <span style="display:inline-flex;">${popupIcons.date}</span><span>${escapeHtml(new Date(pet.createdAt).toLocaleDateString("es-AR"))}</span>
          </div>
        </a>`
      marker.bindPopup(popup, OPCIONES_POPUP)
      clusterGroup.addLayer(marker)
    }

    if (isInitialView) {
      if (focoReporte) {
        enfocarReporte(map, clusterGroup, focoReporte, marcadorEnFoco)
      }
      return
    }

    if (visibleItems.length === 0) {
      map.setView(INITIAL_MAP_VIEW_CONFIG.defaultCenter, INITIAL_MAP_VIEW_CONFIG.defaultZoom)
      return
    }

    const bounds = L.latLngBounds(
      visibleItems.map((item) => [item.coordinates[0], item.coordinates[1]] as L.LatLngTuple)
    )

    if (!bounds.isValid()) {
      return
    }

    if (bounds.getNorthEast().equals(bounds.getSouthWest())) {
      map.setView(bounds.getCenter(), 14)
      return
    }

    map.fitBounds(bounds.pad(INITIAL_MAP_VIEW_CONFIG.padding))
  }, [getIcon, onSeleccionarReporte, reports, mascotas, focoReporte])

  return <div ref={containerRef} className="h-full w-full" style={{ zIndex: 0 }} />
}
