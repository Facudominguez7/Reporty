import { ZONA_HORARIA_APP } from "./antiguedad"

/** Fecha y hora con zona explícita al final («Z», «+00:00», «-0300»). */
const CON_ZONA = /(Z|[+-]\d{2}(:?\d{2})?)$/i

/** Fecha sola («2026-11-14»), sin hora. */
const SOLO_FECHA = /^\d{4}-\d{2}-\d{2}$/

/**
 * Convierte una fecha leída de la base en un `Date`.
 *
 * Las columnas `timestamp without time zone` (como `reportes.created_at`) se llenan con
 * `now()` en una base que corre en UTC, y Supabase las devuelve sin zona. `new Date()` las
 * leería como hora local, corriéndolas tres horas en Argentina; acá se leen como UTC. Las
 * fechas que traen su zona la conservan, y una fecha sola se toma al mediodía de Argentina
 * para que no cambie de día.
 *
 * @param fecha - Texto devuelto por la base.
 * @returns El instante correspondiente.
 */
export function leerFechaBase(fecha: string): Date {
  const texto = fecha.trim()
  if (SOLO_FECHA.test(texto)) return new Date(`${texto}T12:00:00-03:00`)
  if (CON_ZONA.test(texto)) return new Date(texto)
  return new Date(`${texto.replace(" ", "T")}Z`)
}

/**
 * Formatea una fecha en el día de Argentina, igual en el servidor (UTC) y en el navegador.
 *
 * @param fecha - Texto devuelto por la base o un `Date`.
 * @param opciones - Formato de `toLocaleDateString`; por defecto «14/11/2026».
 * @returns La fecha en español de Argentina.
 */
export function formatearFechaArgentina(fecha: string | Date, opciones: Intl.DateTimeFormatOptions = {}): string {
  const instante = typeof fecha === "string" ? leerFechaBase(fecha) : fecha
  return instante.toLocaleDateString("es-AR", { ...opciones, timeZone: ZONA_HORARIA_APP })
}
