/**
 * Contenedor del mapa con componentes adicionales
 * 
 * Este componente envuelve el mapa de Leaflet y agrega:
 * - Leyenda de colores por prioridad
 * - Instrucciones de uso del mapa
 *
 * Leaflet necesita `window`, así que este módulo solo debe cargarse con
 * `next/dynamic` y `ssr: false` (ver `mapa-client` y `panel-cuadrillas`).
 * Importa Leaflet de forma estática para que el mapa llegue en un solo chunk
 * en lugar de esperar una segunda carga dinámica encadenada.
 */

"use client"

import LeafletMap, { type UbicacionPersonaMapa } from "@/components/leaflet-map"
import { MousePointer2, Shield } from "lucide-react"

import { getPriorityColor } from "@/components/report-card"
import type { EstadoOperativo } from "@/lib/authz/catalog"
import type { MascotaMapa } from "@/database/queries/mascotas/mapa"
import type { FocoReporte } from "@/lib/map/foco-reporte"
import type { ZonaMapa } from "@/lib/map/zona"
import type { GrupoMapa } from "@/database/queries/reportes/get-reportes"

/** Listas vacías estables para la capa que no se muestra. */
const SIN_REPORTES: Report[] = []
const SIN_MASCOTAS: MascotaMapa[] = []
const SIN_GRUPOS: GrupoMapa[] = []

/**
 * Interfaz que representa un reporte con sus datos para visualizar en el mapa
 */
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

/**
 * Props del componente MapContainer
 */
interface MapContainerProps {
  reports: Report[]
  showLegend?: boolean
  /** Modo selección: se propaga a `LeafletMap` para avisar qué reporte se eligió al hacer click. */
  onSeleccionarReporte?: (reporteId: number) => void
  mascotas?: MascotaMapa[]
  layer?: "reportes" | "mascotas"
  /** Reporte al que el mapa se acerca al abrir (llegada desde su detalle). */
  focoReporte?: FocoReporte | null
  /** Grupos de reportes del servidor para zonas densas (#281). */
  grupos?: GrupoMapa[]
  /** Carga por zona (#281): recibe la zona visible y el zoom al terminar cada movimiento. */
  onCambioZona?: (zona: ZonaMapa, zoom: number) => void
  /** Punto de la persona y radio de búsqueda (#297), en las dos capas. */
  ubicacionPersona?: UbicacionPersonaMapa | null
}

/**
 * Renderiza el contenedor del mapa con el componente de Leaflet y las superposiciones de interfaz.
 *
 * @param reports - Array de informes que se mostrarán como marcadores en el mapa
 * @param showLegend - Indica si se debe mostrar la leyenda de colores; por defecto `true`
 * @returns El elemento JSX que contiene el mapa y sus superposiciones (leyenda e instrucciones)
 */
export function MapContainer({ reports, mascotas = SIN_MASCOTAS, layer = "reportes", showLegend = true, onSeleccionarReporte, focoReporte = null, grupos = SIN_GRUPOS, onCambioZona, ubicacionPersona = null }: MapContainerProps) {
  return (
    <div className="relative w-full h-full">
      {/* Componente principal del mapa de Leaflet */}
      <LeafletMap
        reports={layer === "reportes" ? reports : SIN_REPORTES}
        mascotas={layer === "mascotas" ? mascotas : SIN_MASCOTAS}
        grupos={layer === "reportes" ? grupos : SIN_GRUPOS}
        onSeleccionarReporte={onSeleccionarReporte}
        focoReporte={focoReporte}
        onCambioZona={onCambioZona}
        ubicacionPersona={ubicacionPersona}
      />

      {showLegend && layer === "reportes" && (
        <aside aria-label="Leyenda del mapa" className="map-legend-card absolute bottom-[calc(6.75rem+env(safe-area-inset-bottom))] left-3 z-10 w-41 px-2 py-1 sm:left-5 md:w-52 md:p-3">
          <p className="text-xs font-bold leading-tight text-foreground md:text-sm">Prioridad</p>
          <ul className="mt-0.5 flex flex-wrap gap-x-1.5 gap-y-0.5 text-[11px] leading-tight md:mt-1 md:gap-x-2 md:text-xs">
            {(["Alta", "Media", "Baja"] as const).map((prioridad) => (
              <li key={prioridad} className="flex items-center gap-1">
                <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ backgroundColor: getPriorityColor(prioridad) }} />
                {prioridad}
              </li>
            ))}
          </ul>
          <div className="mt-1 flex items-center gap-1.5 border-t border-border pt-1 md:mt-2 md:gap-2 md:pt-2">
            <span aria-hidden="true" className="relative mx-0.5 size-3.5 shrink-0 rounded-full border-2 border-card bg-muted ring-2 ring-[var(--semantic-admin)] md:size-4.5">
              <span className="absolute -right-1.5 -bottom-1 flex size-3 items-center justify-center rounded-full bg-[var(--semantic-admin)] text-card">
                <Shield className="size-2" strokeWidth={2.5} />
              </span>
            </span>
            <p className="min-w-0 pl-0.5 text-[11px] font-semibold leading-tight text-[color:color-mix(in_oklab,var(--semantic-admin)_50%,var(--foreground))] md:text-xs">Tomado por Defensoría</p>
          </div>
        </aside>
      )}

      {/* Instrucciones de uso del mapa - Oculta en mobile para no saturar */}
      <div className="map-legend-card absolute right-5 top-28 hidden max-w-xs z-10 md:block">
        <p className="text-xs text-muted-foreground flex items-center gap-2">
          <MousePointer2 className="size-4" aria-hidden="true" />
          <span>Haz clic en los marcadores para ver detalles</span>
        </p>
      </div>
    </div>
  )
}
