import type { SupabaseClient } from "@supabase/supabase-js"

import {
  clasificarDuplicado,
  RADIO_DUPLICADO_METROS,
  type CoincidenciaDuplicado,
  type PuntoGeografico,
  type ReporteCercano,
} from "@/lib/reportes/duplicados"

/** Fila tal como la devuelve `reportes_duplicados_cerca`. */
type FilaReporteCercano = {
  id: number
  usuario_id: string | null
  titulo: string
  descripcion: string | null
  created_at: string
  metros: number
}

export type BusquedaDuplicado = PuntoGeografico & {
  categoriaId: number
  /** Quien carga el reporte; `null` sin sesión. */
  usuarioId: string | null
}

/**
 * Lee con PostGIS (`reportes_duplicados_cerca`, #300) los reportes abiertos (Pendiente) de la
 * misma categoría a `RADIO_DUPLICADO_METROS` o menos, sin los eliminados ni retirados, ordenados
 * por distancia y con los metros ya medidos.
 *
 * @param supabase - Cliente con service_role: la función devuelve el autor y no se concede a nadie más.
 * @param busqueda - Categoría y punto del reporte nuevo.
 * @returns Los reportes candidatos, del más cercano al más lejano.
 * @throws Error si la consulta falla.
 */
export async function buscarReportesCercanos(
  supabase: SupabaseClient,
  busqueda: Omit<BusquedaDuplicado, "usuarioId">,
): Promise<ReporteCercano[]> {
  const { data, error } = await supabase.rpc("reportes_duplicados_cerca", {
    lat: busqueda.lat,
    lon: busqueda.lon,
    categoria_id: busqueda.categoriaId,
    radio_m: RADIO_DUPLICADO_METROS,
  })

  if (error) throw new Error("No pudimos buscar reportes cercanos.")

  return ((data ?? []) as FilaReporteCercano[]).map((fila) => ({
    id: fila.id,
    usuarioId: fila.usuario_id,
    titulo: fila.titulo,
    descripcion: fila.descripcion,
    createdAt: fila.created_at,
    metros: fila.metros,
  }))
}

/**
 * Busca el posible duplicado de un reporte nuevo. Si la consulta falla devuelve `null`:
 * un fallo de la búsqueda nunca impide reportar.
 *
 * @param supabase - Cliente con service_role (ver `buscarReportesCercanos`).
 * @param busqueda - Categoría, punto y autor del reporte nuevo.
 * @returns La coincidencia a mostrar o `null`.
 */
export async function buscarDuplicado(
  supabase: SupabaseClient,
  busqueda: BusquedaDuplicado,
): Promise<CoincidenciaDuplicado | null> {
  try {
    const candidatos = await buscarReportesCercanos(supabase, busqueda)
    return clasificarDuplicado(candidatos, busqueda.usuarioId)
  } catch (error) {
    console.error("Error al buscar reportes duplicados:", error)
    return null
  }
}
