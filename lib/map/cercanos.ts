/**
 * Reglas de «cerca tuyo» en el mapa (#297), compartidas por el navegador y el endpoint
 * `POST /api/mapa/cerca`.
 *
 * La coordenada de la persona se redondea a 4 decimales (unos 11 m) antes de salir del teléfono y
 * otra vez en el servidor. Viaja solo en el cuerpo del pedido y nunca se guarda.
 */
import { POSADAS_BOUNDS } from "@/lib/map/initial-view"

/** Radios que la persona puede elegir en el panel, en metros. */
export const RADIOS_CERCANOS = [300, 500, 1000] as const

/** Radio con el que abre el panel. */
export const RADIO_CERCANOS_INICIAL = 500

/** Radio mínimo y máximo que acepta el endpoint, en metros. */
export const RADIO_CERCANOS_MINIMO = 100
export const RADIO_CERCANOS_MAXIMO = 2000

/** Máximo de elementos que devuelve `cerca_de`: si llegan tantos, puede haber más. */
export const LIMITE_CERCANOS = 100

/** Zoom al que el mapa se acerca a la persona. */
export const ZOOM_CERCANOS = 16

/** Tiempo máximo de la única lectura de ubicación por visita. */
export const TIEMPO_UBICACION_CERCANOS_MS = 6_000

/** Decimales de la coordenada que sale del teléfono. */
const DECIMALES_COORDENADA = 4

/** Un reporte o una mascota perdida cerca de la persona. */
export type ElementoCercano = {
  tipo: "reporte" | "mascota"
  id: number
  titulo: string
  /** Distancia a la persona en metros, calculada por PostGIS. */
  metros: number
}

/**
 * Redondea una coordenada a 4 decimales.
 *
 * @param valor - Latitud o longitud en grados.
 * @returns El valor redondeado.
 */
export function redondearCoordenada(valor: number): number {
  return Number(valor.toFixed(DECIMALES_COORDENADA))
}

/**
 * Indica si un punto está dentro del área del mapa de Posadas.
 *
 * @param lat - Latitud en grados.
 * @param lon - Longitud en grados.
 * @returns `true` si el punto cae dentro de `POSADAS_BOUNDS`.
 */
export function dentroDePosadas(lat: number, lon: number): boolean {
  const [sur, oeste, norte, este] = POSADAS_BOUNDS
  return lat >= sur && lat <= norte && lon >= oeste && lon <= este
}

/**
 * Describe la distancia a un elemento para la lista del panel.
 *
 * @param metros - Distancia en metros.
 * @returns «a 87 m», o en kilómetros con un decimal desde 1 km («a 1,5 km»).
 */
export function describirDistancia(metros: number): string {
  const redondeados = Math.round(metros)
  if (redondeados < 1000) return `a ${redondeados} m`
  const kilometros = Math.round(redondeados / 100) / 10
  return `a ${kilometros.toLocaleString("es-AR")} km`
}

/**
 * Etiqueta de un radio para el panel.
 *
 * @param metros - Radio en metros.
 * @returns «300 m», «500 m» o «1 km».
 */
export function etiquetaRadio(metros: number): string {
  return metros >= 1000 ? `${(metros / 1000).toLocaleString("es-AR")} km` : `${metros} m`
}

/**
 * Nombre con el que un elemento aparece en la lista del panel.
 *
 * @param elemento - Reporte o mascota cercana.
 * @returns El título del reporte, o la especie de la mascota («Perro perdido»).
 */
export function nombreElementoCercano(elemento: ElementoCercano): string {
  const titulo = elemento.titulo.trim()
  if (elemento.tipo === "reporte") return titulo || "Reporte sin título"
  const especie = titulo === "otro" || !titulo ? "Otro animal" : titulo[0].toUpperCase() + titulo.slice(1)
  return `${especie} perdido`
}
