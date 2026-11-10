import dayjs from "dayjs"
import timezone from "dayjs/plugin/timezone"
import utc from "dayjs/plugin/utc"

dayjs.extend(utc)
dayjs.extend(timezone)

/** Zona horaria en la que se cuentan los días de las publicaciones. */
export const ZONA_HORARIA_APP = "America/Argentina/Buenos_Aires"

/**
 * Antigüedad legible de una publicación («hace 2 días», «hace 3 horas»).
 *
 * Cuenta días de calendario en la hora de Argentina para ayer y antes; una
 * publicación de hoy se describe en horas, nunca como «hace 0 días».
 *
 * @param fecha - Momento de creación.
 * @param ahora - Momento de referencia (inyectable en pruebas).
 */
export function describirAntiguedad(fecha: Date, ahora: Date = new Date()): string {
  const momento = dayjs(fecha).tz(ZONA_HORARIA_APP)
  const referencia = dayjs(ahora).tz(ZONA_HORARIA_APP)
  const dias = Math.max(0, referencia.startOf("day").diff(momento.startOf("day"), "day"))
  if (dias >= 1) return `hace ${dias} ${dias === 1 ? "día" : "días"}`
  const horas = Math.max(0, referencia.diff(momento, "hour"))
  if (horas >= 1) return `hace ${horas} ${horas === 1 ? "hora" : "horas"}`
  return "hace minutos"
}
