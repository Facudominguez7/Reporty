/**
 * Chip suave para los datos del reporte (prioridad, estado y categoría).
 *
 * Reemplaza las pastillas de color sólido con rótulo en mayúsculas: una sola línea,
 * fondo apenas tintado y texto en el tono del valor. El rótulo («Prioridad», «Estado»…)
 * sólo lo leen los lectores de pantalla; a la vista lo explican el ícono y el color.
 */

import type { CSSProperties, ReactNode } from "react"

import { cn } from "@/lib/utils"

/** Tono neutro para valores que el catálogo todavía no conoce. */
const TONO_NEUTRO = "var(--muted-foreground)"

/**
 * Devuelve el color del tema que corresponde a una prioridad.
 *
 * @param prioridad - Nombre de la prioridad tal como llega de la base («Alta», «Media», «Baja»).
 * @returns Variable CSS del tono a usar en el chip.
 */
export function tonoPrioridad(prioridad: string): string {
  switch (prioridad) {
    case "Alta":
      return "var(--priority-high)"
    case "Media":
      return "var(--priority-medium)"
    case "Baja":
      return "var(--priority-low)"
    default:
      return TONO_NEUTRO
  }
}

/**
 * Devuelve el color del tema que corresponde a un estado del reporte.
 *
 * @param estado - Nombre del estado tal como llega de la base («Pendiente», «Reparado», «Rechazado»).
 * @returns Variable CSS del tono a usar en el chip.
 */
export function tonoEstado(estado: string): string {
  switch (estado) {
    case "Reparado":
      return "var(--primary)"
    case "Pendiente":
      return "var(--semantic-warning)"
    case "Rechazado":
      return "var(--destructive)"
    default:
      return TONO_NEUTRO
  }
}

/** Tono de la categoría: todas comparten el acento de categorías del tema. */
export const TONO_CATEGORIA = "var(--category-accent)"

/**
 * Chip de un dato del reporte.
 *
 * @param etiqueta - Rótulo del dato, anunciado sólo a lectores de pantalla.
 * @param valor - Valor visible del dato.
 * @param icono - Ícono decorativo opcional que acompaña al valor.
 * @param tono - Variable CSS del color del valor (ver `tonoPrioridad`, `tonoEstado`).
 */
export function ChipReporte({
  etiqueta,
  valor,
  icono,
  tono,
  className,
}: {
  etiqueta: string
  valor: ReactNode
  icono?: ReactNode
  tono: string
  className?: string
}) {
  return (
    <span
      style={{ "--tono-chip": tono } as CSSProperties}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-[var(--radius-pill)] px-2.5 text-xs md:text-[length:inherit] font-medium",
        "bg-[color-mix(in_oklch,var(--tono-chip)_16%,transparent)]",
        "text-[color:color-mix(in_oklch,var(--tono-chip)_72%,var(--foreground))]",
        "[&_svg]:size-3.5 [&_svg]:shrink-0",
        className,
      )}
    >
      <span className="sr-only">{etiqueta}: </span>
      {icono}
      {valor}
    </span>
  )
}
