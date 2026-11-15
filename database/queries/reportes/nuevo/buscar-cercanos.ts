import type { SupabaseClient } from "@supabase/supabase-js"

import { REPORT_STATE_IDS } from "@/lib/authz/catalog"
import {
  cajaDeBusqueda,
  clasificarDuplicado,
  RADIO_DUPLICADO_METROS,
  type CoincidenciaDuplicado,
  type PuntoGeografico,
  type ReporteCercano,
} from "@/lib/reportes/duplicados"

type FilaReporteCercano = {
  id: number
  usuario_id: string | null
  titulo: string
  descripcion: string | null
  created_at: string
  lat: number | null
  lon: number | null
}

export type BusquedaDuplicado = PuntoGeografico & {
  categoriaId: number
  /** Quien carga el reporte; `null` sin sesión. */
  usuarioId: string | null
}

/**
 * Lee los reportes abiertos (Pendiente) de la misma categoría dentro del rectángulo que contiene
 * el radio de duplicados, sin los eliminados ni retirados.
 *
 * @param supabase - Cliente con permiso de lectura sobre `reportes`.
 * @param busqueda - Categoría y punto del reporte nuevo.
 * @returns Los reportes candidatos, sin medir todavía la distancia exacta.
 * @throws Error si la consulta falla.
 */
export async function buscarReportesCercanos(
  supabase: SupabaseClient,
  busqueda: Omit<BusquedaDuplicado, "usuarioId">,
): Promise<ReporteCercano[]> {
  const caja = cajaDeBusqueda(busqueda, RADIO_DUPLICADO_METROS)
  const { data, error } = await supabase
    .from("reportes")
    .select("id, usuario_id, titulo, descripcion, created_at, lat, lon")
    .eq("categoria_id", busqueda.categoriaId)
    .eq("estado_id", REPORT_STATE_IDS.PENDIENTE)
    .is("deleted_at", null)
    .gte("lat", caja.latMin)
    .lte("lat", caja.latMax)
    .gte("lon", caja.lonMin)
    .lte("lon", caja.lonMax)
    .limit(50)

  if (error) throw new Error("No pudimos buscar reportes cercanos.")

  return ((data ?? []) as FilaReporteCercano[]).map((fila) => ({
    id: fila.id,
    usuarioId: fila.usuario_id,
    titulo: fila.titulo,
    descripcion: fila.descripcion,
    createdAt: fila.created_at,
    lat: fila.lat,
    lon: fila.lon,
  }))
}

/**
 * Busca el posible duplicado de un reporte nuevo. Si la consulta falla devuelve `null`:
 * un fallo de la búsqueda nunca impide reportar.
 *
 * @param supabase - Cliente con permiso de lectura sobre `reportes`.
 * @param busqueda - Categoría, punto y autor del reporte nuevo.
 * @returns La coincidencia a mostrar o `null`.
 */
export async function buscarDuplicado(
  supabase: SupabaseClient,
  busqueda: BusquedaDuplicado,
): Promise<CoincidenciaDuplicado | null> {
  try {
    const candidatos = await buscarReportesCercanos(supabase, busqueda)
    return clasificarDuplicado(candidatos, busqueda, busqueda.usuarioId)
  } catch (error) {
    console.error("Error al buscar reportes duplicados:", error)
    return null
  }
}
