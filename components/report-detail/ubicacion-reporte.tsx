"use client"

/**
 * Ubicación del reporte dentro del detalle (S13, S18).
 *
 * La franja superior es la entrada principal al mapa: muestra el mapa real del reporte
 * en miniatura, sus coordenadas y un botón propio «Ver en mapa» que abre la hoja
 * inferior. La miniatura nunca recibe puntero ni lectores de pantalla, así no compite
 * con el botón ni lo atrapa. Cuando faltan coordenadas se dice, jamás se inventa una
 * dirección.
 */

import { useRef } from "react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { MapPin } from "lucide-react"

import { MapLoadingSkeleton } from "@/components/loading-skeletons"
import { Button } from "@/components/ui/button"

const MiniMap = dynamic(() => import("@/components/mini-map").then((m) => m.MiniMap), {
  ssr: false,
  loading: () => <MapLoadingSkeleton />,
})

/**
 * Coordenadas con coma decimal y cinco decimales, tal como las lee una persona.
 * El par va separado por un punto medio para que no se confunda con la coma decimal.
 */
export function formatearCoordenadas(lat: number, lon: number) {
  const numero = (valor: number) => valor.toFixed(5).replace(".", ",")
  return `${numero(lat)} · ${numero(lon)}`
}

/**
 * Franja compacta con la ubicación del reporte: miniatura del mapa, coordenadas reales
 * y una única acción directa que abre la hoja. La vista previa es decorativa y no
 * intercepta el puntero, por eso el botón sigue siendo el único control de la franja.
 */
export function FranjaUbicacion({
  lat,
  lon,
  onVerUbicacion,
}: {
  lat: number | null
  lon: number | null
  onVerUbicacion?: (disparador: HTMLElement | null) => void
}) {
  const botonRef = useRef<HTMLButtonElement>(null)
  const hayUbicacion = lat !== null && lon !== null

  return (
    <div className="flex items-center gap-3 rounded-[var(--radius)] border border-border bg-card p-2 pr-2 shadow-[var(--card-shadow)]">
      {hayUbicacion ? (
        <div
          data-vista-previa-ubicacion=""
          aria-hidden="true"
          // `inert` saca del Tab los enlaces que Leaflet inserta (atribución, zoom).
          inert
          className="pointer-events-none relative h-14 w-20 shrink-0 overflow-hidden rounded-[var(--radius-sm)] border border-border bg-[var(--surface-subtle)] sm:h-20 sm:w-32"
        >
          <MiniMap lat={lat} lon={lon} />
        </div>
      ) : (
        <span
          aria-hidden="true"
          className="inline-flex h-14 w-20 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--surface-subtle)] text-muted-foreground sm:h-20 sm:w-32"
        >
          <MapPin className="size-5" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Ubicación</p>
        <p className="truncate text-sm font-medium text-foreground">
          {hayUbicacion ? formatearCoordenadas(lat, lon) : "Ubicación no disponible"}
        </p>
      </div>
      {hayUbicacion && (
        <Button
          ref={botonRef}
          type="button"
          variant="outline"
          size="sm"
          aria-haspopup="dialog"
          className="shrink-0"
          onClick={() => onVerUbicacion?.(botonRef.current)}
        >
          <MapPin className="size-4" aria-hidden="true" />
          Ver en mapa
        </Button>
      )}
    </div>
  )
}

/**
 * Cuerpo de la hoja de ubicación: el mapa real del reporte y el acceso al mapa
 * completo. Sin coordenadas no se pinta un mapa vacío.
 */
export function ContenidoUbicacion({ lat, lon }: { lat: number | null; lon: number | null }) {
  if (lat === null || lon === null) {
    return (
      <p className="text-sm text-muted-foreground">Este reporte no tiene coordenadas cargadas.</p>
    )
  }

  return (
    <div className="flex min-h-0 flex-col gap-3">
      {/* Altura acotada: el mapa no empuja la hoja y no aparece un scroll interior. */}
      <div className="aspect-video max-h-[22rem] overflow-hidden rounded-[var(--radius)] border border-border bg-[var(--surface-subtle)]">
        <MiniMap lat={lat} lon={lon} />
      </div>
      <div className="flex items-start gap-2">
        <MapPin className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">Coordenadas del reporte</p>
          <p className="text-xs text-muted-foreground">{formatearCoordenadas(lat, lon)}</p>
        </div>
      </div>
      <Button asChild className="w-full">
        <Link href="/mapa">Ver en mapa completo</Link>
      </Button>
    </div>
  )
}
