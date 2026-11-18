"use client"

import { MapContainer as RLMapContainer, TileLayer, CircleMarker } from "react-leaflet"
import "leaflet/dist/leaflet.css"
import { MAP_TILE_ATTRIBUTION, MAP_TILE_URL } from "@/lib/map/initial-view"

type MiniMapProps = {
  lat: number
  lon: number
  /** Permite arrastrar y hacer zoom (rueda, pellizco, botones). Por defecto es una vista fija. */
  interactivo?: boolean
}

/**
 * Renderiza una vista previa de mapa centrada en las coordenadas proporcionadas.
 *
 * @param lat - Latitud en grados decimales del centro del mapa
 * @param lon - Longitud en grados decimales del centro del mapa
 * @param interactivo - Habilita arrastre y zoom; sin él la vista previa queda fija
 * @returns Un elemento JSX que muestra el mapa con un marcador circular en la posición indicada
 */
export function MiniMap({ lat, lon, interactivo = false }: MiniMapProps) {
  const center: [number, number] = [lat, lon]
  return (
    <div className="w-full h-full">
      <RLMapContainer
        center={center}
        zoom={15}
        className="w-full h-full rounded-lg overflow-hidden"
        style={{ zIndex: 0 }}
        scrollWheelZoom={interactivo}
        dragging={interactivo}
        doubleClickZoom={interactivo}
        zoomControl={interactivo}
        keyboard={interactivo}
        touchZoom={interactivo}
      >
        <TileLayer
          attribution={MAP_TILE_ATTRIBUTION}
          url={MAP_TILE_URL}
        />
        <CircleMarker
          center={center}
          radius={10}
          pathOptions={{ color: "var(--semantic-info)", fillColor: "var(--semantic-info)", fillOpacity: 0.82 }}
        />
      </RLMapContainer>
    </div>
  )
}
