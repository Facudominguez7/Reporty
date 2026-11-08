"use client"

import { MapContainer as RLMapContainer, TileLayer, CircleMarker } from "react-leaflet"
import "leaflet/dist/leaflet.css"
import { MAP_TILE_ATTRIBUTION, MAP_TILE_URL } from "@/lib/map/initial-view"

type MiniMapProps = {
  lat: number
  lon: number
}

/**
 * Renderiza una vista previa de mapa centrada en las coordenadas proporcionadas.
 *
 * @param lat - Latitud en grados decimales del centro del mapa
 * @param lon - Longitud en grados decimales del centro del mapa
 * @returns Un elemento JSX que muestra un mapa no interactivo con un marcador circular en la posición indicada
 */
export function MiniMap({ lat, lon }: MiniMapProps) {
  const center: [number, number] = [lat, lon]
  return (
    <div className="w-full h-full">
      <RLMapContainer
        center={center}
        zoom={15}
        className="w-full h-full rounded-lg overflow-hidden"
        style={{ zIndex: 0 }}
        scrollWheelZoom={false}
        dragging={false}
        doubleClickZoom={false}
        zoomControl={false}
        keyboard={false}
        touchZoom={false}
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
