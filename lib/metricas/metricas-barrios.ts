/**
 * Métricas del panel de administración por barrio y por categoría (#302): los tipos que devuelven
 * las consultas, el tramo de color de cada barrio en el mapa y el resumen de los indicadores.
 */

/** Geometría GeoJSON de un barrio, tal como la simplifica `reportes_por_barrio`. */
export type GeometriaBarrio = {
  type: "Polygon" | "MultiPolygon"
  coordinates: unknown
}

/** Reportes sin eliminar de un barrio. */
export type BarrioConReportes = {
  id: string
  nombre: string
  total: number
  pendientes: number
  reparados: number
  ultimos30Dias: number
  geometria: GeometriaBarrio | null
}

/** Reportes sin eliminar que no caen en ningún barrio cargado. */
export type ReportesSinBarrio = {
  total: number
  pendientes: number
  reparados: number
  ultimos30Dias: number
}

/** Reportes por barrio, con aparte los que no caen en ninguno. */
export type MetricasPorBarrio = {
  barrios: BarrioConReportes[]
  sinBarrio: ReportesSinBarrio
}

/** Reportes sin eliminar de una categoría, repartidos por estado. */
export type EstadoPorCategoria = {
  categoria: string
  total: number
  pendientes: number
  defensoria: number
  reparados: number
  rechazados: number
  /** Días promedio que llevan los pendientes, o `null` si no hay pendientes. */
  esperaPromedioDias: number | null
  pendientesMas90Dias: number
}

/**
 * Tramos de color del mapa por barrio, de menos a más reportes. `color` es la variable del tema
 * (globals.css); `respaldo` es el mismo valor, para pintar el mapa aunque la hoja de estilos
 * cargada todavía no tenga la variable.
 */
export const TRAMOS_BARRIO = [
  { desde: 0, etiqueta: "Sin reportes", color: "var(--map-barrio-0)", respaldo: "oklch(0.93 0.004 271)" },
  { desde: 1, etiqueta: "1 a 4", color: "var(--map-barrio-1)", respaldo: "oklch(0.9 0.06 75)" },
  { desde: 5, etiqueta: "5 a 9", color: "var(--map-barrio-2)", respaldo: "oklch(0.8 0.11 68)" },
  { desde: 10, etiqueta: "10 a 29", color: "var(--map-barrio-3)", respaldo: "oklch(0.66 0.15 48)" },
  { desde: 30, etiqueta: "30 o más", color: "var(--map-barrio-4)", respaldo: "oklch(0.48 0.16 32)" },
] as const

/**
 * Devuelve el índice del tramo de `TRAMOS_BARRIO` que le toca a un barrio según su total.
 *
 * @param total - Reportes del barrio.
 */
export function tramoDeBarrio(total: number): number {
  let tramo = 0
  TRAMOS_BARRIO.forEach((candidato, indice) => {
    if (total >= candidato.desde) tramo = indice
  })
  return tramo
}

/** Indicadores de la cabecera del panel de métricas. */
export type ResumenMetricas = {
  total: number
  pendientes: number
  porcentajePendientes: number
  /** Días promedio de espera de un pendiente, redondeados; `null` si no hay pendientes. */
  esperaPromedioDias: number | null
  pendientesMas90Dias: number
  reparados: number
  porcentajeReparados: number
  defensoria: number
  /** Los dos barrios con más reportes y qué parte del total suman. */
  concentracion: { barrios: string[]; total: number; porcentaje: number }
}

/** Porcentaje entero de `parte` sobre `total`, 0 si no hay total. */
function porcentaje(parte: number, total: number): number {
  return total > 0 ? Math.round((parte / total) * 100) : 0
}

/**
 * Arma los indicadores del panel a partir de las categorías (que cubren todos los reportes) y los
 * barrios. La espera de un pendiente se pondera por la cantidad de pendientes de cada categoría.
 *
 * @param categorias - Reportes por categoría y estado.
 * @param barrios - Reportes por barrio, sin la fila de los que no caen en ninguno.
 */
export function resumirMetricas(categorias: EstadoPorCategoria[], barrios: BarrioConReportes[]): ResumenMetricas {
  const sumar = (campo: (categoria: EstadoPorCategoria) => number) =>
    categorias.reduce((acumulado, categoria) => acumulado + campo(categoria), 0)

  const total = sumar((c) => c.total)
  const pendientes = sumar((c) => c.pendientes)
  const reparados = sumar((c) => c.reparados)
  const esperaPonderada = sumar((c) => (c.esperaPromedioDias ?? 0) * c.pendientes)
  const masReportes = [...barrios].sort((a, b) => b.total - a.total).slice(0, 2).filter((b) => b.total > 0)
  const totalConcentrado = masReportes.reduce((acumulado, b) => acumulado + b.total, 0)

  return {
    total,
    pendientes,
    porcentajePendientes: porcentaje(pendientes, total),
    esperaPromedioDias: pendientes > 0 ? Math.round(esperaPonderada / pendientes) : null,
    pendientesMas90Dias: sumar((c) => c.pendientesMas90Dias),
    reparados,
    porcentajeReparados: porcentaje(reparados, total),
    defensoria: sumar((c) => c.defensoria),
    concentracion: {
      barrios: masReportes.map((b) => b.nombre),
      total: totalConcentrado,
      porcentaje: porcentaje(totalConcentrado, total),
    },
  }
}
