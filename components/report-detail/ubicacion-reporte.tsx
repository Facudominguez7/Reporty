"use client"

/**
 * Ubicación del reporte dentro del detalle (S13, S18).
 *
 * La franja superior es la entrada principal al mapa: muestra el mapa real del reporte
 * en miniatura, su calle (o sus coordenadas si no se encontró) y un botón propio
 * «Ver en mapa» que abre la hoja inferior. La miniatura nunca recibe puntero ni
 * lectores de pantalla, así no compite con el botón ni lo atrapa. La calle sale de
 * `reportes.direccion`, guardada al crear el reporte: acá jamás se inventa.
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
 * Calle de una dirección guardada («Bolívar 1450, Posadas» → «Bolívar 1450»). La
 * franja es angosta en móvil y todos los reportes son de la misma zona, así que ahí
 * alcanza con la calle; la hoja muestra la dirección completa.
 */
export function calleDeDireccion(direccion: string) {
  const ultimaComa = direccion.lastIndexOf(",")
  return ultimaComa > 0 ? direccion.slice(0, ultimaComa) : direccion
}

/**
 * Franja compacta con la ubicación del reporte: miniatura del mapa, la calle (o las
 * coordenadas reales si no hay calle guardada) y una única acción directa que abre la
 * hoja. La vista previa es decorativa y no intercepta el puntero, por eso el botón
 * sigue siendo el único control de la franja.
 *
 * @param direccion - Calle guardada del reporte; sin ella se muestran las coordenadas.
 */
export function FranjaUbicacion({
  lat,
  lon,
  direccion,
  onVerUbicacion,
}: {
  lat: number | null
  lon: number | null
  direccion?: string | null
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
          className="pointer-events-none relative h-14 w-20 shrink-0 overflow-hidden rounded-[var(--radius-sm)] border border-border bg-[var(--surface-subtle)] [&_.leaflet-control-attribution]:hidden sm:h-20 sm:w-32"
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
        <p className="line-clamp-2 text-sm font-medium leading-snug text-foreground">
          {!hayUbicacion
            ? "Ubicación no disponible"
            : direccion
              ? calleDeDireccion(direccion)
              : formatearCoordenadas(lat, lon)}
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
 * Cuerpo de la hoja de ubicación: el mapa real del reporte, su calle con las
 * coordenadas como dato secundario y el acceso al mapa completo. Sin coordenadas no
 * se pinta un mapa vacío.
 *
 * @param direccion - Calle guardada del reporte; sin ella el título son las coordenadas.
 */
export function ContenidoUbicacion({
  lat,
  lon,
  direccion,
}: {
  lat: number | null
  lon: number | null
  direccion?: string | null
}) {
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
          <p className="text-sm font-semibold text-foreground">{direccion ?? "Coordenadas del reporte"}</p>
          <p className="text-xs text-muted-foreground">{formatearCoordenadas(lat, lon)}</p>
        </div>
      </div>
      <Button asChild className="w-full">
        <Link href="/mapa">Ver en mapa completo</Link>
      </Button>
    </div>
  )
}
