/**
 * Carga del mapa por zona (#281): puntos mientras entren hasta `MAXIMO_PUNTOS_ZONA` en la zona,
 * y grupos por celda cuando hay más. La usan el endpoint `GET /api/mapa/reportes` y la primera
 * carga de `/mapa`, así los dos aplican la misma regla.
 */
import {
  getGruposEnZona,
  getReportMapData,
  type FiltrosReportes,
  type GrupoMapa,
} from "@/database/queries/reportes/get-reportes"
import {
  MAXIMO_PUNTOS_ZONA,
  resolverEstadosMapa,
  tamanoCeldaGrupos,
  type ZonaMapa,
} from "@/lib/map/zona"

/** Reporte tal como lo dibuja el mapa. */
export type PuntoMapa = Awaited<ReturnType<typeof getReportMapData>>["data"][number]

/** Lo que el mapa dibuja para una zona: cada reporte, o la cantidad por celda. */
export type ContenidoZonaMapa =
  | { tipo: "puntos"; reportes: PuntoMapa[] }
  | { tipo: "grupos"; grupos: GrupoMapa[] }

/** Filtros del mapa que llegan por la URL. */
export type FiltrosMapa = Pick<FiltrosReportes, "search" | "categoria" | "estado" | "prioridad">

/**
 * Carga lo que el mapa muestra en una zona. Los estados son siempre los del mapa (pendiente,
 * tomado por la Defensoría y reparado); el filtro `estado` solo los achica. Lee sin sesión:
 * el resultado es público y se puede cachear.
 *
 * @param parametros.zona - Zona ya ajustada al mapa (`ajustarZonaAlMapa`).
 * @param parametros.zoom - Zoom del mapa, que fija el tamaño de celda de los grupos.
 * @param parametros.filtros - Búsqueda, categoría, estado y prioridad.
 * @returns El contenido de la zona, o el error de la consulta.
 */
export async function cargarZonaMapa({
  zona,
  zoom,
  filtros,
}: {
  zona: ZonaMapa
  zoom: number
  filtros: FiltrosMapa
}): Promise<{ data: ContenidoZonaMapa; error: Error | null }> {
  const estados = resolverEstadosMapa(filtros.estado)
  if (estados.length === 0) {
    return { data: { tipo: "puntos", reportes: [] }, error: null }
  }

  const comunes = { search: filtros.search, categoria: filtros.categoria, prioridad: filtros.prioridad }

  // Se piden hasta 300 puntos: si llegan más, la zona es densa y se responde con grupos.
  // En el caso habitual alcanza con una sola consulta.
  const puntos = await getReportMapData(
    { ...comunes, zona, estadosPermitidos: estados, limite: MAXIMO_PUNTOS_ZONA },
    { publico: true },
  )
  if (puntos.error) {
    return { data: { tipo: "puntos", reportes: [] }, error: puntos.error }
  }
  if (!puntos.hasMore) {
    return { data: { tipo: "puntos", reportes: puntos.data }, error: null }
  }

  const grupos = await getGruposEnZona({ ...comunes, zona, celda: tamanoCeldaGrupos(zoom), estados })
  if (grupos.error) {
    return { data: { tipo: "grupos", grupos: [] }, error: grupos.error }
  }
  return { data: { tipo: "grupos", grupos: grupos.data }, error: null }
}
