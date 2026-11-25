"use client"

/**
 * Panel «cerca tuyo» del mapa (#297): un resumen compacto que se expande al tocarlo, con los
 * radios de 300 m, 500 m y 1 km y la lista de reportes y mascotas perdidas ordenada por distancia.
 */
import { useState } from "react"
import Link from "next/link"
import { ChevronDown, FileText, Loader2, LocateFixed, PawPrint, RotateCw, TriangleAlert } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  LIMITE_CERCANOS,
  RADIOS_CERCANOS,
  describirDistancia,
  etiquetaRadio,
  nombreElementoCercano,
  type ElementoCercano,
} from "@/lib/map/cercanos"
import { cn } from "@/lib/utils"

/** Estado de la búsqueda de cercanos. */
export type EstadoCercanos = "cargando" | "listo" | "error"

type PanelCercanosProps = {
  estado: EstadoCercanos
  /** Elementos cercanos, ya ordenados por distancia. */
  cercanos: ElementoCercano[]
  /** Radio elegido, en metros. */
  radio: number
  /** La lectura tiene un margen de error mayor que 50 m. */
  aproximada: boolean
  onCambiarRadio: (radio: number) => void
  onReintentar: () => void
  /** Abre el panel desde el inicio (para pruebas y vistas previas). */
  abiertoInicial?: boolean
}

/**
 * Arma el resumen del panel cerrado.
 *
 * @param cercanos - Elementos cercanos.
 * @returns «2 reportes cerca tuyo» y, si hay, la cantidad de mascotas perdidas. Si se llegó al
 *   máximo que devuelve el servidor, las cantidades llevan «+» porque puede haber más.
 */
function resumen(cercanos: ElementoCercano[]): { reportes: string; mascotas: string | null } {
  const reportes = cercanos.filter((elemento) => elemento.tipo === "reporte").length
  const mascotas = cercanos.length - reportes
  const mas = cercanos.length >= LIMITE_CERCANOS ? "+" : ""
  return {
    reportes: `${reportes}${mas} ${reportes === 1 && !mas ? "reporte" : "reportes"} cerca tuyo`,
    mascotas: mascotas > 0 ? `${mascotas}${mas} ${mascotas === 1 && !mas ? "mascota perdida" : "mascotas perdidas"}` : null,
  }
}

/**
 * Panel compacto con lo que hay cerca de la persona.
 *
 * @returns El panel, cerrado por defecto.
 */
export function PanelCercanos({
  estado,
  cercanos,
  radio,
  aproximada,
  onCambiarRadio,
  onReintentar,
  abiertoInicial = false,
}: PanelCercanosProps) {
  const [abierto, setAbierto] = useState(abiertoInicial)
  const { reportes, mascotas } = resumen(cercanos)

  const titulo =
    estado === "cargando" ? (
      <span role="status" className="flex items-center gap-2">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        Buscando cerca tuyo…
      </span>
    ) : estado === "error" ? (
      <span className="flex items-center gap-2 text-destructive">
        <TriangleAlert className="size-4" aria-hidden="true" />
        No se pudo buscar cerca tuyo
      </span>
    ) : (
      <span className="flex min-w-0 items-center gap-2">
        <LocateFixed className="size-4 shrink-0 text-[var(--semantic-info)]" aria-hidden="true" />
        <span className="truncate">
          <span className="font-semibold">{reportes}</span>
          {mascotas && <span className="text-muted-foreground"> · {mascotas}</span>}
        </span>
      </span>
    )

  return (
    <section
      aria-label="Cerca tuyo"
      className={cn(
        "vidrio-liquido pointer-events-auto border text-sm transition-[border-radius]",
        abierto ? "w-[min(92vw,22rem)] rounded-2xl p-2" : "max-w-[92vw] rounded-full",
      )}
    >
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 rounded-full px-3 py-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-expanded={abierto}
        onClick={() => setAbierto((valor) => !valor)}
      >
        <span className="flex min-w-0 flex-col">
          {titulo}
          {aproximada && <span className="text-xs text-muted-foreground">Ubicación aproximada</span>}
        </span>
        <ChevronDown className={cn("size-4 shrink-0 transition-transform", abierto && "rotate-180")} aria-hidden="true" />
      </button>

      {abierto && (
        <div className="mt-1 space-y-2 px-1 pb-1">
          <div role="group" aria-label="Radio de búsqueda" className="flex gap-1">
            {RADIOS_CERCANOS.map((opcion) => (
              <Button
                key={opcion}
                type="button"
                size="sm"
                variant={opcion === radio ? "default" : "ghost"}
                className="flex-1"
                aria-pressed={opcion === radio}
                onClick={() => onCambiarRadio(opcion)}
              >{etiquetaRadio(opcion)}</Button>
            ))}
          </div>

          {estado === "error" && (
            <Button type="button" size="sm" variant="outline" className="w-full" onClick={onReintentar}>
              <RotateCw className="size-4" aria-hidden="true" />
              Reintentar</Button>
          )}

          {estado === "listo" && cercanos.length === 0 && (
            <p className="px-2 py-1 text-muted-foreground">
              No hay reportes ni mascotas perdidas a menos de {etiquetaRadio(radio)}.
            </p>
          )}

          {estado === "listo" && cercanos.length > 0 && (
            <ul className="max-h-[40dvh] space-y-0.5 overflow-y-auto">
              {cercanos.map((elemento) => {
                const Icono = elemento.tipo === "reporte" ? FileText : PawPrint
                const href = elemento.tipo === "reporte" ? `/reportes/${elemento.id}` : `/mascotas/${elemento.id}`
                return (
                  <li key={`${elemento.tipo}-${elemento.id}`}>
                    <Link
                      href={href}
                      className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Icono className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate">{nombreElementoCercano(elemento)}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{describirDistancia(elemento.metros)}</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
