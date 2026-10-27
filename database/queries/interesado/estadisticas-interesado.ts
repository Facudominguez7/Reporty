import { SupabaseClient } from "@supabase/supabase-js";
import { contarReportesEnProgreso } from "@/database/queries/cuadrillas";
import { cuadrillasHabilitadas } from "@/lib/features";

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

/**
 * Agrupa los reportes por categoría y devuelve el conteo ordenado por cantidad.
 *
 * Asigna a cada categoría un color tomado de una paleta fija.
 *
 * @returns Arreglo de objetos ReportesPorCategoria con los campos `categoria`, `cantidad` y `color`, ordenados por `cantidad` de mayor a menor.
 */
export async function getReportesPorCategoria(
  supabase: SupabaseClient
): Promise<ReportesPorCategoria[]> {
  try {
    const { data, error } = await supabase
      .from("reportes")
      .select("categoria_id, categorias (nombre)")
      .is("deleted_at", null);

    if (error) {
      console.error("Error al obtener reportes por categoría:", error);
      return [];
    }

    // Agrupar y contar por categoría
    const categoriaMap = new Map<string, number>();
    data.forEach((reporte: any) => {
      const categoria = reporte.categorias?.nombre || "Sin categoría";
      categoriaMap.set(categoria, (categoriaMap.get(categoria) || 0) + 1);
    });

    // Convertir a array y ordenar por cantidad. La presentación de colores vive en el gráfico,
    // para reutilizar los tokens de globals.css en cualquier superficie.
    return Array.from(categoriaMap.entries())
      .map(([categoria, cantidad]) => ({ categoria, cantidad }))
      .sort((a, b) => b.cantidad - a.cantidad);
  } catch (error) {
    console.error("Error en getReportesPorCategoria:", error);
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

/**
 * Obtiene las zonas geográficas con más reportes agrupando reportes cercanos (~0.001° ≈ 100 m).
 *
 * @returns Arreglo de zonas ordenado por cantidad descendente; cada elemento contiene `lat`, `lon`, `cantidad` y `ultimoReporte` (fecha ISO del reporte más reciente)
 */
export async function getZonasConMasReportes(
  supabase: SupabaseClient,
  limite: number = 10
): Promise<ZonaConReportes[]> {
  try {
    const { data, error } = await supabase
      .from("reportes")
      .select("lat, lon, created_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (error || !data) {
      console.error("Error al obtener zonas con más reportes:", error);
      return [];
    }

    // Agrupar reportes por proximidad (~0.001 grados ≈ 100m)
    const precision = 0.001;
    const zonasMap = new Map<string, ZonaConReportes>();

    data.forEach((reporte: any) => {
      const latRedondeada = Math.round(reporte.lat / precision) * precision;
      const lonRedondeada = Math.round(reporte.lon / precision) * precision;
      const key = `${latRedondeada},${lonRedondeada}`;

      const zonaExistente = zonasMap.get(key);
      if (zonaExistente) {
        zonaExistente.cantidad++;
        // Mantener la fecha del reporte más reciente
        if (new Date(reporte.created_at) > new Date(zonaExistente.ultimoReporte)) {
          zonaExistente.ultimoReporte = reporte.created_at;
        }
      } else {
        zonasMap.set(key, {
          lat: latRedondeada,
          lon: lonRedondeada,
          cantidad: 1,
          ultimoReporte: reporte.created_at,
        });
      }
    });

    // Convertir a array, ordenar por cantidad y retornar los top N
    return Array.from(zonasMap.values())
      .sort((a, b) => b.cantidad - a.cantidad)
      .slice(0, limite);
  } catch (error) {
    console.error("Error en getZonasConMasReportes:", error);
    return [];
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
