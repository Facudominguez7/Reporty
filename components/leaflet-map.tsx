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
import { ETIQUETAS_ESTADO_OPERATIVO, type EstadoOperativo } from "@/lib/authz/catalog"
import { categoryIconNodes, getCategoryIconNode, iconNodeToSvgMarkup } from "@/lib/icons/category-icons"
import {
  INITIAL_MAP_VIEW_CONFIG,
  MAP_MAX_ZOOM,
  MAP_TILE_URL,
  POSADAS_BOUNDS,
  POSADAS_MIN_ZOOM,
} from "@/lib/map/initial-view"

interface Report {
  id: number
  title: string
  description: string
  category: string
  priority: string
  status: string
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
}

type LeafletContainer = HTMLDivElement & { _leaflet_id?: number }

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
  const safeDate = escapeHtml(new Date(report.createdAt).toLocaleDateString("es-AR"))
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
      </div>

      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding-top:10px;border-top:1px solid var(--border);font-size:11px;color:var(--muted-foreground);">
        <span style="display:inline-flex;align-items:center;gap:6px;min-width:0;">
          <span style="display:inline-flex;">${popupIcons.author}</span>
          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${safeAuthor}</span>
        </span>
        <span style="display:inline-flex;align-items:center;gap:6px;white-space:nowrap;">
          <span style="display:inline-flex;">${popupIcons.date}</span>
          <span>${safeDate}</span>
        </span>
      </div>
    </a>
  `
}

export default function LeafletMap({ reports, onSeleccionarReporte }: LeafletMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<L.Map | null>(null)
  const tileLayerRef = useRef<L.TileLayer | null>(null)
  const clusterGroupRef = useRef<L.MarkerClusterGroup | null>(null)
  const hasInitialViewRef = useRef(false)

  const iconsByPriority = useMemo(() => {
    const mk = (color: string, category: string, hasCrew = false) =>
      L.divIcon({
        className: "custom-marker",
        html: `
          <div style="position:relative;width:36px;height:36px;">
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
            ${hasCrew ? "opacity:0.5;" : ""}
          ">
            ${createCategoryIconMarkup(category)}
          </div>
          ${hasCrew ? '<div title="Con cuadrilla asignada" style="position:absolute;top:-3px;right:-3px;width:12px;height:12px;border-radius:50%;background-color:var(--semantic-admin);border:2px solid var(--map-marker-stroke);"></div>' : ""}
          </div>
        `,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      })

    const icons = new Map<string, L.DivIcon>()
    for (const priority of ["Alta", "Media", "Baja", "default"]) {
      const color = priority === "default" ? "var(--map-heat-neutral)" : getPriorityColor(priority)
      for (const category of Object.keys(categoryIconNodes)) {
        icons.set(`${priority}|${category}|free`, mk(color, category))
        icons.set(`${priority}|${category}|assigned`, mk(color, category, true))
      }
    }
    return icons
  }, [])

  const getIcon = useCallback(
    (priority: string, category: string, hasCrew = false) => {
      const normalized = priority.charAt(0).toUpperCase() + priority.slice(1).toLowerCase()
      const normalizedCategory = categoryIconNodes[category] ? category : "default"
      return iconsByPriority.get(`${normalized}|${normalizedCategory}|${hasCrew ? "assigned" : "free"}`) ?? iconsByPriority.get(`default|default|${hasCrew ? "assigned" : "free"}`)!
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
    const map = L.map(container, {
      scrollWheelZoom: true,
      zoomControl: true,
      maxBounds: L.latLngBounds([south, west], [north, east]),
      maxBoundsViscosity: 1,
      minZoom: POSADAS_MIN_ZOOM,
      maxZoom: MAP_MAX_ZOOM,
    })

    const tileLayer = L.tileLayer(MAP_TILE_URL, {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
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

    clusterGroup.clearLayers()

    for (const report of reports) {
      const marker = L.marker([report.coordinates[0], report.coordinates[1]], {
        icon: getIcon(report.priority, report.category, Boolean(report.estadoOperativo)),
      })

      const popupContent = createPopupContent(
        report,
        getStatusColor(report.status),
        getPriorityColor(report.priority),
        getCategoryColor()
      )

      marker.bindPopup(popupContent, { maxWidth: 300 })
      if (onSeleccionarReporte) {
        marker.on("click", () => onSeleccionarReporte(report.id))
      }
      clusterGroup.addLayer(marker)
    }

    if (!hasInitialViewRef.current) {
      // Start over Posadas regardless of where current reports are located; users can pan
      // east to Candelaria within the regional max bounds.
      map.setView(INITIAL_MAP_VIEW_CONFIG.defaultCenter, INITIAL_MAP_VIEW_CONFIG.defaultZoom)
      hasInitialViewRef.current = true
      return
    }

    if (reports.length === 0) {
      map.setView(INITIAL_MAP_VIEW_CONFIG.defaultCenter, INITIAL_MAP_VIEW_CONFIG.defaultZoom)
      return
    }

    const bounds = L.latLngBounds(
      reports.map((report) => [report.coordinates[0], report.coordinates[1]] as L.LatLngTuple)
    )

    if (!bounds.isValid()) {
      return
    }

    if (bounds.getNorthEast().equals(bounds.getSouthWest())) {
      map.setView(bounds.getCenter(), 14)
      return
    }

    map.fitBounds(bounds.pad(INITIAL_MAP_VIEW_CONFIG.padding))
  }, [getIcon, onSeleccionarReporte, reports])

  return <div ref={containerRef} className="h-full w-full" style={{ zIndex: 0 }} />
}
