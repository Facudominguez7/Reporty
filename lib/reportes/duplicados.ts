/** Reglas puras para detectar si un reporte nuevo repite uno abierto cercano. */

/** Distancia máxima, en metros, para considerar que dos reportes de la misma categoría son el mismo problema. */
export const RADIO_DUPLICADO_METROS = 100

/** Por debajo de esta distancia un reporte propio se considera el mismo punto y no se publica otro. */
export const RADIO_MISMO_PUNTO_PROPIO_METROS = 25

const RADIO_TIERRA_METROS = 6_371_000

export type PuntoGeografico = { lat: number; lon: number }

/**
 * Reporte abierto de la misma categoría, tal como lo devuelve la búsqueda por cercanía: la base
 * ya lo filtró por radio y midió la distancia con PostGIS (#300).
 */
export type ReporteCercano = {
  id: number
  usuarioId: string | null
  titulo: string
  descripcion: string | null
  createdAt: string
  /** Distancia al punto del reporte nuevo, sin redondear, medida por `ST_Distance`. */
  metros: number
}

export type TipoDuplicado = "propio_mismo_punto" | "propio_cerca" | "ajeno"

export type CoincidenciaDuplicado = {
  tipo: TipoDuplicado
  reporte: ReporteCercano
  /** Distancia redondeada al metro entre el punto elegido y el reporte existente. */
  metros: number
}

/** Lo que ve quien carga el reporte: sin el autor del reporte existente. */
export type AvisoDuplicado = {
  tipo: TipoDuplicado
  metros: number
  reporte: { id: number; titulo: string; descripcion: string | null; createdAt: string }
}

/**
 * Reduce una coincidencia a los datos que se pueden mostrar en el formulario.
 *
 * @param coincidencia - Coincidencia encontrada por `clasificarDuplicado`.
 * @returns El aviso sin el identificador del autor.
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
 * Decide qué reporte cercano mostrar como posible duplicado. Un reporte propio a menos de
 * `RADIO_MISMO_PUNTO_PROPIO_METROS` gana siempre, porque bloquea la publicación; si no hay,
 * se elige el más cercano a `RADIO_DUPLICADO_METROS` o menos. Las distancias las mide la base;
 * acá se redondean al metro antes de comparar.
 *
 * @param candidatos - Reportes abiertos de la misma categoría alrededor del punto, con su distancia.
 * @param usuarioId - Quien carga el reporte; `null` sin sesión (nada cuenta como propio).
 * @returns La coincidencia a mostrar, o `null` si no hay ninguna.
 */
export function clasificarDuplicado(
  candidatos: ReporteCercano[],
  usuarioId: string | null,
): CoincidenciaDuplicado | null {
  const medidos = candidatos
    .map((reporte) => ({
      reporte,
      metros: Math.round(reporte.metros),
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
