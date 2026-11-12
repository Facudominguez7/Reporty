/**
 * Título automático de los reportes: «Categoría en Dirección».
 *
 * Solo la categoría «Otros» pide un título escrito por la persona, porque el nombre de la
 * categoría no dice cuál es el problema. Se comparte entre el formulario y el servidor; el
 * servidor es quien arma el título definitivo, con la dirección que obtiene de las coordenadas.
 */

/** Identificador fijo de la categoría «Otros» (coincide con `CATEGORY_FILTER_IDS`). */
export const CATEGORIA_OTROS_ID = 7

/** Largo máximo del título, igual al que valida la creación del reporte. */
export const TITULO_REPORTE_MAX = 120

/** Nombres para mostrar de las categorías cuyo nombre guardado no lleva tildes. */
const NOMBRES_VISIBLES: Record<number, string> = {
  1: "Bache",
  2: "Semáforo",
  3: "Árbol caído",
  4: "Alumbrado",
  5: "Residuos",
  6: "Seguridad",
  8: "Agua",
}

/**
 * Indica si la categoría elegida exige que la persona escriba el título.
 *
 * @param categoriaId - Identificador de la categoría seleccionada.
 * @returns `true` solo para la categoría «Otros».
 */
export function requiereTituloManual(categoriaId: number): boolean {
  return categoriaId === CATEGORIA_OTROS_ID
}

/**
 * Arma el título automático de un reporte a partir de su categoría y su dirección.
 *
 * @param categoriaId - Identificador de una categoría distinta de «Otros».
 * @param direccion - Dirección legible de las coordenadas, o `null` si no se encontró.
 * @returns «Categoría en Dirección», solo la categoría si falta la dirección, o `null` si la
 *   categoría no tiene título automático (desconocida u «Otros»).
 */
export function armarTituloReporte(categoriaId: number, direccion: string | null): string | null {
  const categoria = NOMBRES_VISIBLES[categoriaId]
  if (!categoria) return null
  const calle = direccion?.trim()
  const titulo = calle ? `${categoria} en ${calle}` : categoria
  return titulo.length > TITULO_REPORTE_MAX ? `${titulo.slice(0, TITULO_REPORTE_MAX - 1).trimEnd()}…` : titulo
}
