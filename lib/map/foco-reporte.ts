/**
 * Foco del mapa al llegar desde el detalle de un reporte: `/mapa?reporte=12&lat=..&lon=..`.
 * Las coordenadas viajan en la URL porque el mapa solo carga reportes pendientes: si el
 * reporte ya no está (reparado o rechazado) igual se centra en su ubicación.
 */

export type FocoReporte = {
  reporteId: number
  lat: number
  lon: number
}

/** Zoom con el que el mapa muestra el reporte enfocado: nivel de cuadra. */
export const ZOOM_FOCO_REPORTE = 17

/**
 * Arma la URL del mapa completo enfocada en un reporte.
 *
 * @param foco - Reporte y coordenadas a mostrar.
 * @returns La ruta relativa del mapa con el foco en la query.
 */
export function urlMapaConFoco({ reporteId, lat, lon }: FocoReporte): string {
  const query = new URLSearchParams({ reporte: String(reporteId), lat: String(lat), lon: String(lon) })
  return `/mapa?${query.toString()}`
}

/**
 * Lee y valida el foco desde los parámetros de la URL. Cualquier valor inválido o fuera
 * de rango anula el foco y el mapa abre con su vista normal.
 *
 * @param params - Parámetros `reporte`, `lat` y `lon` de la URL.
 * @returns El foco válido o `null`.
 */
export function leerFocoReporte(params: { reporte?: string; lat?: string; lon?: string }): FocoReporte | null {
  const reporteId = Number(params.reporte)
  const lat = Number(params.lat)
  const lon = Number(params.lon)
  if (!Number.isSafeInteger(reporteId) || reporteId <= 0) return null
  if (!params.lat || !params.lon || !Number.isFinite(lat) || !Number.isFinite(lon)) return null
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null
  return { reporteId, lat, lon }
}
