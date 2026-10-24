"use client"

import { useEffect, useState } from "react"
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import { toast } from "sonner"
import { useMounted } from "@/hooks/use-mounted"
import { MapLoadingSkeleton } from "@/components/loading-skeletons"
import { REPORT_COVERAGE_BOUNDS, REPORT_COVERAGE_SOURCE, isWithinReportCoverage } from "@/lib/map/report-coverage"
import { MAP_MAX_ZOOM } from "@/lib/map/initial-view"

// Configurar el ícono del marcador
const markerIcon = new L.Icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
})


interface LocationPickerMapProps {
  onLocationSelect: (lat: number, lon: number) => void
  initialLat?: number | null
  initialLon?: number | null
}

/**
 * Muestra y controla un marcador que permite seleccionar una ubicación mediante clics y notifica las coordenadas seleccionadas.
 *
 * Mantiene el marcador sincronizado con `initialLat`/`initialLon`, actualiza su posición al hacer clic (solo dentro del área de cobertura) y llama a `onLocationSelect` con la latitud y longitud seleccionadas.
 *
 * @param onLocationSelect - Callback invocado con `lat` y `lon` cuando el usuario selecciona una ubicación válida
 * @param initialLat - Latitud inicial del marcador; si no se proporciona, el marcador no aparece hasta que el usuario haga clic
 * @param initialLon - Longitud inicial del marcador; se usa junto con `initialLat` para posicionar el marcador inicial
 * @returns El componente `Marker` posicionado en las coordenadas seleccionadas, o `null` si no hay posición definida
 */
function LocationMarker({ onLocationSelect, initialLat, initialLon }: LocationPickerMapProps) {
  const [position, setPosition] = useState<[number, number] | null>(
    initialLat != null && initialLon != null ? [initialLat, initialLon] : null
  )

  const map = useMapEvents({
    click(e) {
      const { lat, lng } = e.latlng
      
      if (!isWithinReportCoverage(lat, lng)) {
        toast.error("Ubicación fuera del área de cobertura", {
          description: "Elegí un punto en Posadas, Garupá o Candelaria."
        })
        return
      }
      
      setPosition([lat, lng])
      onLocationSelect(lat, lng)
      
      // Mostrar toast de éxito
      toast.success("Ubicación seleccionada", {
        description: `Lat: ${lat.toFixed(5)}, Lon: ${lng.toFixed(5)}`
      })
    },
  })

  useEffect(() => {
    if (initialLat != null && initialLon != null) {
      setPosition([initialLat, initialLon])
      map.setView([initialLat, initialLon], 13)
    }
  }, [initialLat, initialLon, map])

  return position ? <Marker position={position} icon={markerIcon} /> : null
}

/**
 * Renderiza un mapa interactivo centrado en Posadas que permite seleccionar una ubicación vía clic.
 *
 * Mantiene el marcador en la posición seleccionada y restringe la navegación
 * a la zona de Posadas, Garupá y Candelaria.
 *
 * @param onLocationSelect - Callback que recibe `(lat, lon)` cuando el usuario selecciona una ubicación válida
 * @param initialLat - Latitud inicial opcional para centrar el mapa y posicionar el marcador
 * @param initialLon - Longitud inicial opcional para centrar el mapa y posicionar el marcador
 * @returns El elemento React que renderiza el mapa y su interfaz de selección de ubicación
 */
export function LocationPickerMap({ onLocationSelect, initialLat, initialLon }: LocationPickerMapProps) {
  const mounted = useMounted()

  if (!mounted) {
    return (
      <div className="h-[400px] w-full">
        <MapLoadingSkeleton />
      </div>
    )
  }

  // Posadas, Misiones, Argentina como centro por defecto
  const defaultCenter: [number, number] = initialLat != null && initialLon != null
    ? [initialLat, initialLon]
    : [-27.3671, -55.8961]

  return (
    <div className="w-full h-[400px] rounded-lg overflow-hidden border-2 border-muted relative z-0">
      <MapContainer
        center={defaultCenter}
        zoom={13}
        style={{ height: "100%", width: "100%", zIndex: 0 }}
        scrollWheelZoom={true}
        zoomControl={true}
        maxBounds={REPORT_COVERAGE_BOUNDS as L.LatLngBoundsExpression}
        maxBoundsViscosity={1.0}
        minZoom={10}
        maxZoom={MAP_MAX_ZOOM}
      >
        <TileLayer
          attribution={`&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · <a href="${REPORT_COVERAGE_SOURCE.url}">${REPORT_COVERAGE_SOURCE.attribution}</a>`}
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <LocationMarker
          onLocationSelect={onLocationSelect}
          initialLat={initialLat}
          initialLon={initialLon}
        />
      </MapContainer>
    </div>
  )
}
