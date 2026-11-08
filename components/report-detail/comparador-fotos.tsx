"use client"

/**
 * Comparación horizontal «Antes / Después» compartida por la ficha del reporte y la
 * hoja de la evidencia (S10, S11, S13, S18).
 *
 * Hay una sola implementación: la tarjeta del reporte y la hoja de reparación mueven
 * el mismo control de rango sobre las dos fotos superpuestas, así el gesto de
 * deslizamiento es idéntico en móvil y en escritorio. Los rótulos «Antes» y
 * «Después» son texto con la fecha de cada foto, la línea y la manija son
 * decorativas, y el control conserva el nombre accesible y el texto del corte.
 */

import { useId, useState } from "react"
import dayjs from "dayjs"
import utc from "dayjs/plugin/utc"
import timezone from "dayjs/plugin/timezone"
import { MoveHorizontal } from "lucide-react"

dayjs.extend(utc)
dayjs.extend(timezone)

const ZONA_HORARIA = "America/Argentina/Buenos_Aires"

/** Abreviaturas fijas: el rótulo no depende del idioma del entorno del navegador. */
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]

/** Foto que entra en la comparación, con su texto alternativo ya resuelto. */
export type FotoComparada = {
  src: string
  /** Describe qué foto es, quién la publicó y cuándo: nunca un texto genérico. */
  alt: string
  /** Fecha que acompaña al rótulo; `null` cuando no se conoce. */
  fecha: string | null
}

export type ComparadorFotosProps = {
  /**
   * Foto original del reporte. Si el reporte no tiene foto, `null`: solo se muestra
   * la foto del después, sin inventar un antes ni un control de comparación.
   */
  antes: FotoComparada | null
  despues: FotoComparada
}

/**
 * Fecha corta del rótulo («27 oct») en hora argentina, para que el HTML del servidor
 * y el del navegador coincidan. Las fechas sin zona se leen como -03:00, igual que el
 * resto de la ficha del reporte.
 */
function formatearFechaCorta(fecha: string | null) {
  if (!fecha) return null
  const interpretada = /(Z|[+-]\d{2}(:?\d{2})?)$/.test(fecha) ? new Date(fecha) : new Date(`${fecha}-03:00`)
  if (Number.isNaN(interpretada.getTime())) return null

  const enZona = dayjs(interpretada).tz(ZONA_HORARIA)
  const mes = MESES_CORTOS[enZona.month()]
  return mes ? `${enZona.date()} ${mes}` : null
}

/** Rótulo de cada lado: el nombre de la foto y, cuando existe, su fecha. */
function rotular(nombre: string, fecha: string | null) {
  const corta = formatearFechaCorta(fecha)
  return corta ? `${nombre} · ${corta}` : nombre
}

/** Estilo compartido por los dos rótulos de la comparación. */
const ESTILO_ROTULO =
  "pointer-events-none absolute top-2 rounded-[var(--radius-pill)] bg-secondary px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-secondary-foreground"

/**
 * Comparación accesible: dos fotos superpuestas, un control de rango transparente
 * encima (arrastre con el dedo, flechas, Inicio y Fin) y una ayuda que explica el
 * gesto. No usa animaciones, así respeta a quien prefiere menos movimiento.
 *
 * El alto se limita a `min(48vh, 22rem)`: en escritorio la comparación ya no ocupa
 * casi toda la pantalla y la hoja necesita menos desplazamiento, mientras que en
 * móvil el ancho manda porque el aspecto 16/10 queda por debajo del límite.
 */
export function ComparadorFotos({ antes, despues }: ComparadorFotosProps) {
  const [corte, setCorte] = useState(50)
  const ayudaId = useId()

  if (!antes) {
    return (
      <img
        src={despues.src}
        alt={despues.alt}
        className="aspect-[16/10] max-h-[min(48vh,22rem)] w-full rounded-[var(--radius)] border bg-[var(--surface-subtle)] object-contain"
      />
    )
  }

  return (
    <>
      <div className="relative aspect-[16/10] max-h-[min(48vh,22rem)] w-full overflow-hidden rounded-[var(--radius)] border bg-[var(--surface-subtle)] focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
        <img
          src={antes.src}
          alt={antes.alt}
          className="absolute inset-0 size-full object-contain"
        />
        <img
          src={despues.src}
          alt={despues.alt}
          className="absolute inset-0 size-full object-contain"
          style={{ clipPath: `inset(0 0 0 ${corte}%)` }}
        />
        <span className={`${ESTILO_ROTULO} left-2`}>{rotular("Antes", antes.fecha)}</span>
        <span className={`${ESTILO_ROTULO} right-2`}>{rotular("Después", despues.fecha)}</span>
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-card shadow-[0_0_0_1px_rgba(0,0,0,0.15)]"
          style={{ left: `${corte}%` }}
        />
        <span
          data-manija-comparacion=""
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 grid size-10 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-[var(--radius-pill)] border border-border bg-card text-foreground shadow-[var(--elevation-soft)]"
          style={{ left: `clamp(20px, ${corte}%, calc(100% - 20px))` }}
        >
          <MoveHorizontal className="size-5" />
        </span>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={corte}
          onChange={(event) => setCorte(Number(event.target.value))}
          aria-label="Comparar la foto original con la foto de la reparación"
          aria-describedby={ayudaId}
          aria-valuetext={`Mostrando el ${corte} % de la foto original`}
          className="absolute inset-0 size-full cursor-ew-resize touch-pan-y appearance-none bg-transparent opacity-0"
        />
      </div>
      <p id={ayudaId} className="text-xs text-muted-foreground">
        Deslizá para comparar el antes y el después.
      </p>
    </>
  )
}
