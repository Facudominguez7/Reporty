import "server-only"
import { hayRevisionRechazoPendiente } from "@/database/queries/reportes/[id]/revision-rechazo"
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

/** Exposes only a boolean; contact actions require an explicitly approved image. */
export async function tieneFotografiaAprobada(reporteId: number): Promise<boolean> {
  try {
    const { count, error } = await createAdminClient()
      .from("moderacion_imagenes")
      .select("id", { count: "exact", head: true })
      .eq("reporte_id", reporteId)
      .eq("decision", "APPROVED")
      .limit(1)
    return !error && (count ?? 0) > 0
  } catch {
    return false
  }
}

/**
 * Solo dice si un administrador está revisando el reporte por votos «No existe»;
 * nunca expone la fila, quién votó ni cuántos votos hay.
 *
 * @param reporteId - Reporte a consultar.
 */
export async function tieneRevisionRechazoPendiente(reporteId: number): Promise<boolean> {
  try {
    return await hayRevisionRechazoPendiente(createAdminClient(), reporteId)
  } catch {
    return false
  }
}
