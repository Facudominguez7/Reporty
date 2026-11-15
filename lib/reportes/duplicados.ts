/** Reglas puras para detectar si un reporte nuevo repite uno abierto cercano. */

/** Distancia máxima, en metros, para considerar que dos reportes de la misma categoría son el mismo problema. */
export const RADIO_DUPLICADO_METROS = 100

/** Por debajo de esta distancia un reporte propio se considera el mismo punto y no se publica otro. */
export const RADIO_MISMO_PUNTO_PROPIO_METROS = 25

const RADIO_TIERRA_METROS = 6_371_000
const METROS_POR_GRADO_LATITUD = 111_320

export type PuntoGeografico = { lat: number; lon: number }

/** Reporte abierto de la misma categoría, tal como lo devuelve la búsqueda por cercanía. */
export type ReporteCercano = {
  id: number
  usuarioId: string | null
  titulo: string
  descripcion: string | null
  createdAt: string
  lat: number | null
  lon: number | null
}

export type TipoDuplicado = "propio_mismo_punto" | "propio_cerca" | "ajeno"

export type CoincidenciaDuplicado = {
  tipo: TipoDuplicado
  reporte: ReporteCercano
  /** Distancia redondeada al metro entre el punto elegido y el reporte existente. */
  metros: number
}

/** Lo que ve quien carga el reporte: sin coordenadas ni autor del reporte existente. */
export type AvisoDuplicado = {
  tipo: TipoDuplicado
  metros: number
  reporte: { id: number; titulo: string; descripcion: string | null; createdAt: string }
}

/**
 * Reduce una coincidencia a los datos que se pueden mostrar en el formulario.
 *
 * @param coincidencia - Coincidencia encontrada por `clasificarDuplicado`.
 * @returns El aviso sin el identificador del autor ni las coordenadas.
 */
export function aAvisoDuplicado(coincidencia: CoincidenciaDuplicado): AvisoDuplicado {
  const { id, titulo, descripcion, createdAt } = coincidencia.reporte
  return { tipo: coincidencia.tipo, metros: coincidencia.metros, reporte: { id, titulo, descripcion, createdAt } }
}

/**
 * Calcula la distancia sobre la superficie terrestre entre dos puntos (fórmula del semiverseno).
 *
 * @param a - Primer punto.
 * @param b - Segundo punto.
 * @returns Distancia en metros, sin redondear.
 */
export function distanciaEnMetros(a: PuntoGeografico, b: PuntoGeografico): number {
  const aRadianes = (grados: number) => (grados * Math.PI) / 180
  const deltaLat = aRadianes(b.lat - a.lat)
  const deltaLon = aRadianes(b.lon - a.lon)
  const h =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(aRadianes(a.lat)) * Math.cos(aRadianes(b.lat)) * Math.sin(deltaLon / 2) ** 2
  return 2 * RADIO_TIERRA_METROS * Math.asin(Math.min(1, Math.sqrt(h)))
}

/**
 * Devuelve un rectángulo de latitud y longitud que contiene todo punto a la distancia pedida,
 * para filtrar en la base de datos antes de medir con precisión.
 *
 * @param centro - Punto elegido para el reporte nuevo.
 * @param metros - Radio de búsqueda.
 * @returns Límites del rectángulo, con un margen del 10%.
 */
export function cajaDeBusqueda(centro: PuntoGeografico, metros: number) {
  const margen = metros * 1.1
  const deltaLat = margen / METROS_POR_GRADO_LATITUD
  const deltaLon = margen / (METROS_POR_GRADO_LATITUD * Math.cos((centro.lat * Math.PI) / 180))
  return {
    latMin: centro.lat - deltaLat,
    latMax: centro.lat + deltaLat,
    lonMin: centro.lon - deltaLon,
    lonMax: centro.lon + deltaLon,
  }
}

/**
 * Decide qué reporte cercano mostrar como posible duplicado. Un reporte propio a menos de
 * `RADIO_MISMO_PUNTO_PROPIO_METROS` gana siempre, porque bloquea la publicación; si no hay,
 * se elige el más cercano a `RADIO_DUPLICADO_METROS` o menos.
 *
 * @param candidatos - Reportes abiertos de la misma categoría alrededor del punto.
 * @param punto - Ubicación del reporte nuevo.
 * @param usuarioId - Quien carga el reporte; `null` sin sesión (nada cuenta como propio).
 * @returns La coincidencia a mostrar, o `null` si no hay ninguna.
 */
export function clasificarDuplicado(
  candidatos: ReporteCercano[],
  punto: PuntoGeografico,
  usuarioId: string | null,
): CoincidenciaDuplicado | null {
  const medidos = candidatos
    .filter((reporte) => reporte.lat !== null && reporte.lon !== null)
    .map((reporte) => ({
      reporte,
      metros: Math.round(distanciaEnMetros(punto, { lat: reporte.lat as number, lon: reporte.lon as number })),
      propio: usuarioId !== null && reporte.usuarioId === usuarioId,
    }))
    .filter(({ metros }) => metros <= RADIO_DUPLICADO_METROS)
    .sort((a, b) => a.metros - b.metros || a.reporte.id - b.reporte.id)

  const mismoPunto = medidos.find(({ propio, metros }) => propio && metros < RADIO_MISMO_PUNTO_PROPIO_METROS)
  if (mismoPunto) return { tipo: "propio_mismo_punto", reporte: mismoPunto.reporte, metros: mismoPunto.metros }

  const masCercano = medidos[0]
  if (!masCercano) return null
  return { tipo: masCercano.propio ? "propio_cerca" : "ajeno", reporte: masCercano.reporte, metros: masCercano.metros }
}
