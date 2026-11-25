import { SupabaseClient } from "@supabase/supabase-js";
import { contarReportesEnProgreso } from "@/database/queries/cuadrillas";
import { cuadrillasHabilitadas } from "@/lib/features";
import type {
  BarrioConReportes,
  EstadoPorCategoria,
  GeometriaBarrio,
  MetricasPorBarrio,
} from "@/lib/metricas/metricas-barrios";

/**
 * Tipo de datos para estadísticas por categoría
 */
export type ReportesPorCategoria = {
  categoria: string;
  cantidad: number;
};

/**
 * Tipo de datos para tiempo promedio de resolución
 */
export type TiempoPromedioResolucion = {
  diasPromedio: number;
  horasPromedio: number;
};

/**
 * Tipo de datos para zonas con más reportes
 */
export type ZonaConReportes = {
  lat: number;
  lon: number;
  cantidad: number;
  ultimoReporte: string;
};

/** Fila tal como la devuelve `reportes_por_categoria_y_estado`. */
type FilaCategoria = {
  categoria: string;
  total: number;
  pendientes: number;
  defensoria: number;
  reparados: number;
  rechazados: number;
  espera_promedio_dias: number | null;
  pendientes_mas_90_dias: number;
};

/**
 * Obtiene cada categoría con sus reportes repartidos por estado y la espera de los pendientes. La
 * base agrupa con `reportes_por_categoria_y_estado` (#302): no se traen los reportes a Next.
 *
 * @param supabase - Cliente con la sesión del operador: la función respeta la RLS de `reportes`.
 * @returns Categorías ordenadas por la proporción pendiente. Si la consulta falla, `[]`.
 */
export async function getEstadoPorCategoria(supabase: SupabaseClient): Promise<EstadoPorCategoria[]> {
  try {
    const { data, error } = await supabase.rpc("reportes_por_categoria_y_estado");

    if (error || !data) {
      console.error("Error al obtener reportes por categoría y estado:", error);
      return [];
    }

    return (data as FilaCategoria[]).map((fila) => ({
      categoria: fila.categoria,
      total: fila.total,
      pendientes: fila.pendientes,
      defensoria: fila.defensoria,
      reparados: fila.reparados,
      rechazados: fila.rechazados,
      esperaPromedioDias: fila.espera_promedio_dias,
      pendientesMas90Dias: fila.pendientes_mas_90_dias,
    }));
  } catch (error) {
    console.error("Error en getEstadoPorCategoria:", error);
    return [];
  }
}

/**
 * Calcula el tiempo promedio desde la creación hasta la resolución de reportes.
 *
 * Considera como resolución el primer cambio de estado a "Reparado" (estado 2) para cada reporte; devuelve los promedios en días y en horas redondeados a una décima.
 *
 * @returns Un objeto con `diasPromedio` y `horasPromedio` (valores numéricos redondeados a una décima). Ambos serán `0` si no hay datos válidos.
 */
export async function getTiempoPromedioResolucion(
  supabase: SupabaseClient
): Promise<TiempoPromedioResolucion> {
  try {
    // Obtener reportes resueltos con sus fechas
    const { data: reportesResueltos, error: reportesError } = await supabase
      .from("reportes")
      .select("id, created_at")
      .eq("estado_id", 2) // Estado "Reparado"
      .is("deleted_at", null);

    if (reportesError || !reportesResueltos || reportesResueltos.length === 0) {
      return { diasPromedio: 0, horasPromedio: 0 };
    }

    // Fetch the "Reparado" history rows of all resolved reports in batches instead of one
    // query per report. Ids are chunked to keep each request URL short.
    const HISTORIAL_ID_BATCH_SIZE = 200;
    const ids = reportesResueltos.map((reporte) => reporte.id);
    const lotes: number[][] = [];
    for (let inicio = 0; inicio < ids.length; inicio += HISTORIAL_ID_BATCH_SIZE) {
      lotes.push(ids.slice(inicio, inicio + HISTORIAL_ID_BATCH_SIZE));
    }

    const resultados = await Promise.all(
      lotes.map((lote) =>
        supabase
          .from("historial_estados")
          .select("reporte_id, created_at")
          .in("reporte_id", lote)
          .eq("estado_nuevo_id", 2) // Cambio a estado "Reparado"
          .order("created_at", { ascending: true }),
      ),
    );

    // Keep the first change to "Reparado" per report (rows arrive oldest first).
    const primeraResolucion = new Map<number, string>();
    for (const { data: historial, error: historialError } of resultados) {
      if (historialError || !historial) continue;
      for (const fila of historial) {
        if (!primeraResolucion.has(fila.reporte_id)) {
          primeraResolucion.set(fila.reporte_id, fila.created_at);
        }
      }
    }

    const tiemposResolucion: number[] = [];
    for (const reporte of reportesResueltos) {
      const fechaResolucionIso = primeraResolucion.get(reporte.id);
      if (fechaResolucionIso) {
        const fechaCreacion = new Date(reporte.created_at);
        const fechaResolucion = new Date(fechaResolucionIso);
        tiemposResolucion.push(fechaResolucion.getTime() - fechaCreacion.getTime());
      }
    }

    if (tiemposResolucion.length === 0) {
      return { diasPromedio: 0, horasPromedio: 0 };
    }

    // Calcular promedio
    const promedioMs =
      tiemposResolucion.reduce((acc, tiempo) => acc + tiempo, 0) /
      tiemposResolucion.length;

    const diasPromedio = promedioMs / (1000 * 60 * 60 * 24);
    const horasPromedio = promedioMs / (1000 * 60 * 60);

    return {
      diasPromedio: Math.round(diasPromedio * 10) / 10,
      horasPromedio: Math.round(horasPromedio * 10) / 10,
    };
  } catch (error) {
    console.error("Error en getTiempoPromedioResolucion:", error);
    return { diasPromedio: 0, horasPromedio: 0 };
  }
}

/** Fila tal como la devuelve `reportes_por_barrio`; la de los reportes sin barrio trae `barrio_id` nulo. */
type FilaBarrio = {
  barrio_id: string | null;
  nombre: string | null;
  total: number;
  pendientes: number;
  reparados: number;
  ultimos_30_dias: number;
  geojson: GeometriaBarrio | null;
};

/**
 * Obtiene los reportes de cada barrio de Posadas (con o sin reportes, y su geometría para el mapa)
 * y aparte los que no caen en ningún barrio. La base agrupa con `reportes_por_barrio` (#302): no
 * se traen los reportes a Next.
 *
 * @param supabase - Cliente con la sesión del operador: la función respeta la RLS de `reportes`.
 * @returns Barrios ordenados por total y los reportes sin barrio. Si la consulta falla, todo en cero.
 */
export async function getReportesPorBarrio(supabase: SupabaseClient): Promise<MetricasPorBarrio> {
  const sinBarrio = { total: 0, pendientes: 0, reparados: 0, ultimos30Dias: 0 };
  try {
    const { data, error } = await supabase.rpc("reportes_por_barrio");

    if (error || !data) {
      console.error("Error al obtener reportes por barrio:", error);
      return { barrios: [], sinBarrio };
    }

    const barrios: BarrioConReportes[] = [];
    for (const fila of data as FilaBarrio[]) {
      const conteos = {
        total: fila.total,
        pendientes: fila.pendientes,
        reparados: fila.reparados,
        ultimos30Dias: fila.ultimos_30_dias,
      };
      if (fila.barrio_id === null) {
        Object.assign(sinBarrio, conteos);
      } else {
        barrios.push({ id: fila.barrio_id, nombre: fila.nombre ?? fila.barrio_id, ...conteos, geometria: fila.geojson });
      }
    }
    return { barrios, sinBarrio };
  } catch (error) {
    console.error("Error en getReportesPorBarrio:", error);
    return { barrios: [], sinBarrio };
  }
}

/**
 * Obtiene estadísticas agregadas para el dashboard de Interesado.
 *
 * @returns Un objeto con las siguientes métricas:
 * - `totalReportes`: número total de reportes no eliminados.
 * - `reportesResueltos`: número de reportes con `estado_id = 2`.
 * - `reportesPendientes`: número de reportes con `estado_id = 1`.
 * - `reportesEnProgreso`: número de reportes con una asignación de cuadrilla actualmente
 *   `en_progreso`, según la vista pública `reportes_estado_operativo_publico`
 *   (`contarReportesEnProgreso`). Es 0 sin consultar la vista mientras las cuadrillas están
 *   deshabilitadas (`cuadrillasHabilitadas`).
 *
 * IMPORTANTE: `reportesPendientes` y `reportesEnProgreso` NO son categorías disjuntas y no
 * deben sumarse como si lo fueran. `estado_id` (administrativo) y el estado operativo de
 * cuadrillas son ejes independientes: un reporte con una cuadrilla trabajando activamente
 * sigue teniendo `estado_id = 1` (Pendiente) hasta que un admin lo confirma como Reparado o
 * Rechazado. Por eso un mismo reporte puede contarse en ambos números a la vez.
 */
export async function getEstadisticasInteresado(supabase: SupabaseClient) {
  try {
    // The four counts are independent, so they run at the same time.
    const [
      { count: totalReportes },
      { count: reportesResueltos },
      { count: reportesPendientes },
      reportesEnProgreso,
    ] = await Promise.all([
      supabase
        .from("reportes")
        .select("*", { count: "exact", head: true })
        .is("deleted_at", null),
      supabase
        .from("reportes")
        .select("*", { count: "exact", head: true })
        .eq("estado_id", 2)
        .is("deleted_at", null),
      supabase
        .from("reportes")
        .select("*", { count: "exact", head: true })
        .eq("estado_id", 1)
        .is("deleted_at", null),
      cuadrillasHabilitadas() ? contarReportesEnProgreso(supabase) : 0,
    ]);

    // Calcular tasa de resolución
    const tasaResolucion =
      totalReportes && totalReportes > 0
        ? Math.round((reportesResueltos || 0) / totalReportes * 100)
        : 0;

    return {
      totalReportes: totalReportes || 0,
      reportesResueltos: reportesResueltos || 0,
      reportesPendientes: reportesPendientes || 0,
      reportesEnProgreso: reportesEnProgreso || 0,
      tasaResolucion,
    };
  } catch (error) {
    console.error("Error al obtener estadísticas de interesado:", error);
    return {
      totalReportes: 0,
      reportesResueltos: 0,
      reportesPendientes: 0,
      reportesEnProgreso: 0,
      tasaResolucion: 0,
    };
  }
}
