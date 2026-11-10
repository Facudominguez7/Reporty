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

import LeafletMap from "@/components/leaflet-map"
import { MousePointer2 } from "lucide-react"

import { getPriorityColor } from "@/components/report-card"
import type { EstadoOperativo } from "@/lib/authz/catalog"
import type { MascotaMapa } from "@/database/queries/mascotas/mapa"

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
}

/**
 * Renderiza el contenedor del mapa con el componente de Leaflet y las superposiciones de interfaz.
 *
 * @param reports - Array de informes que se mostrarán como marcadores en el mapa
 * @param showLegend - Indica si se debe mostrar la leyenda de colores; por defecto `true`
 * @returns El elemento JSX que contiene el mapa y sus superposiciones (leyenda e instrucciones)
 */
export function MapContainer({ reports, mascotas = [], layer = "reportes", showLegend = true, onSeleccionarReporte }: MapContainerProps) {
  return (
    <div className="relative w-full h-full">
      {/* Componente principal del mapa de Leaflet */}
      <LeafletMap reports={layer === "reportes" ? reports : []} mascotas={layer === "mascotas" ? mascotas : []} onSeleccionarReporte={onSeleccionarReporte} />

      {/* Leyenda de colores flotante - Ajustada para mobile */}
      {showLegend && layer === "reportes" && (
        <div className="map-legend-card absolute bottom-[calc(6.75rem+env(safe-area-inset-bottom))] left-3 z-10 max-w-[140px] sm:left-5 md:max-w-[160px]">
          <h4 className="font-semibold text-xs md:text-sm mb-2 md:mb-3">Prioridad</h4>
          <div className="space-y-1.5 md:space-y-2">
            <div className="flex items-center gap-1.5 md:gap-2 text-[10px] md:text-xs">
              <div 
                className="w-2.5 h-2.5 md:w-3 md:h-3 rounded-full flex-shrink-0 ring-1 ring-black/10" 
                style={{ backgroundColor: getPriorityColor("Alta") }}
              ></div>
              <span>Alta</span>
            </div>
            <div className="flex items-center gap-1.5 md:gap-2 text-[10px] md:text-xs">
              <div 
                className="w-2.5 h-2.5 md:w-3 md:h-3 rounded-full flex-shrink-0 ring-1 ring-black/10" 
                style={{ backgroundColor: getPriorityColor("Media") }}
              ></div>
              <span>Media</span>
            </div>
            <div className="flex items-center gap-1.5 md:gap-2 text-[10px] md:text-xs">
              <div 
                className="w-2.5 h-2.5 md:w-3 md:h-3 rounded-full flex-shrink-0 ring-1 ring-black/10" 
                style={{ backgroundColor: getPriorityColor("Baja") }}
              ></div>
              <span>Baja</span>
            </div>
          </div>
        </div>
      )}

      {/* Instrucciones de uso del mapa - Oculta en mobile para no saturar */}
      <div className="map-legend-card absolute right-5 top-40 hidden max-w-xs z-10 md:block lg:top-28">
        <p className="text-xs text-muted-foreground flex items-center gap-2">
          <MousePointer2 className="size-4" aria-hidden="true" />
          <span>Haz clic en los marcadores para ver detalles</span>
        </p>
      </div>
    </div>
  )
}
