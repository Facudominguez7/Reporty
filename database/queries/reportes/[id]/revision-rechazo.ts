import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Indica si el reporte tiene una revisión de rechazo pendiente (abierta al llegar a cinco
 * votos «No existe»). Cada reporte tiene a lo sumo una: una vez descartada no se reabre.
 *
 * @param supabase - Cliente con rol de servicio: la tabla es privada.
 * @param reporteId - Reporte a consultar.
 * @returns `true` solo si la revisión existe y está pendiente; un error cuenta como `false`.
 */
export async function hayRevisionRechazoPendiente(supabase: SupabaseClient, reporteId: number): Promise<boolean> {
  const { data, error } = await supabase
    .from("reportes_revision_rechazo")
    .select("estado")
    .eq("reporte_id", reporteId)
    .maybeSingle()
  return !error && (data as { estado?: string } | null)?.estado === "pendiente"
}
