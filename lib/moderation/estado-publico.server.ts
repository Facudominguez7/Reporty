import "server-only"
import { createAdminClient } from "@/utils/supabase/admin"

/** Public status only: never return moderation rows, reasons or private object paths. */
export async function tieneFotografiaPendiente(reporteId: number): Promise<boolean> {
  try {
    const { count, error } = await createAdminClient()
      .from("moderacion_imagenes")
      .select("id", { count: "exact", head: true })
      .eq("reporte_id", reporteId)
      .eq("decision", "REVIEW")
      .limit(1)
    return !error && (count ?? 0) > 0
  } catch {
    return false
  }
}
