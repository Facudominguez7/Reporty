/**
 * Ubicación del dispositivo con la mejor precisión que se pueda conseguir en unos
 * segundos.
 *
 * `getCurrentPosition` devuelve la primera lectura, que suele ser la estimación por
 * WiFi o antenas (cientos de metros) antes de que el GPS se enganche. Acá se escuchan
 * las lecturas con `watchPosition` y se queda la más precisa: termina apenas una
 * alcanza `PRECISION_SUFICIENTE_M` o al vencer el tiempo máximo. La precisión depende
 * del navegador y del dispositivo, no del proveedor del mapa.
 */

/** Margen de error (en metros) con el que ya no vale la pena seguir esperando. */
export const PRECISION_SUFICIENTE_M = 20

/** A partir de este margen se le pide a la persona que corrija el punto en el mapa. */
export const PRECISION_APROXIMADA_M = 50

/** Tiempo máximo de búsqueda por defecto. */
const TIEMPO_MAXIMO_MS = 12_000

/** Lectura elegida: coordenadas y margen de error en metros. */
export type UbicacionPrecisa = { lat: number; lon: number; precision: number }

/**
 * Indica si una lectura es demasiado imprecisa para confiar en ella sin revisar.
 *
 * @param precision - Margen de error en metros (`coords.accuracy`).
 */
export function esUbicacionAproximada(precision: number): boolean {
  return precision > PRECISION_APROXIMADA_M
}

/**
 * Busca la ubicación más precisa disponible.
 *
 * @param geolocalizacion - API de geolocalización del navegador (inyectable en pruebas).
 * @param opciones.tiempoMaximoMs - Cuánto esperar como máximo antes de quedarse con la mejor lectura.
 * @returns La lectura más precisa. Rechaza si no llegó ninguna (sin permiso, sin señal o sin tiempo).
 */
export function buscarUbicacionPrecisa(
  geolocalizacion: Geolocation,
  { tiempoMaximoMs = TIEMPO_MAXIMO_MS }: { tiempoMaximoMs?: number } = {},
): Promise<UbicacionPrecisa> {
  return new Promise((resolver, rechazar) => {
    let mejor: UbicacionPrecisa | null = null
    let terminado = false
    let reloj: ReturnType<typeof setTimeout> | undefined
    // Puede no existir todavía si el navegador responde de forma síncrona.
    let id: number | undefined

    const terminar = (error?: unknown) => {
      if (terminado) return
      terminado = true
      clearTimeout(reloj)
      if (id !== undefined) geolocalizacion.clearWatch(id)
      if (mejor) resolver(mejor)
      else rechazar(error ?? new Error("No llegó ninguna lectura de ubicación."))
    }

    id = geolocalizacion.watchPosition(
      ({ coords }) => {
        if (!mejor || coords.accuracy < mejor.precision) {
          mejor = { lat: coords.latitude, lon: coords.longitude, precision: coords.accuracy }
        }
        if (mejor.precision <= PRECISION_SUFICIENTE_M) terminar()
      },
      // Sin permiso o sin señal: si ya hubo una lectura se usa esa; si no, falla.
      (error) => terminar(error),
      { enableHighAccuracy: true, maximumAge: 0, timeout: tiempoMaximoMs },
    )

    if (terminado) geolocalizacion.clearWatch(id)
    else reloj = setTimeout(() => terminar(), tiempoMaximoMs)
  })
}
