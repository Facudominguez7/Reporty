import "server-only"
import { hayRevisionRechazoPendiente } from "@/database/queries/reportes/[id]/revision-rechazo"
import { createAdminClient } from "@/utils/supabase/admin"

/**
 * Estado público de las fotografías de un reporte, leído en una sola consulta: si alguna espera
 * moderación y si alguna fue aprobada explícitamente (lo que habilita las acciones de contacto).
 * Solo expone dos booleanos; nunca filas, motivos ni rutas privadas.
 *
 * @param reporteId - Reporte a consultar.
 * @returns `{ pendiente, aprobada }`; ambos en `false` si la consulta falla.
 */
export async function estadoFotografias(reporteId: number): Promise<{ pendiente: boolean; aprobada: boolean }> {
  try {
    const { data, error } = await createAdminClient()
      .from("moderacion_imagenes")
      .select("decision")
      .eq("reporte_id", reporteId)
      .in("decision", ["REVIEW", "APPROVED"])
    if (error || !data) return { pendiente: false, aprobada: false }
    const decisiones = new Set(data.map((fila: { decision: string }) => fila.decision))
    return { pendiente: decisiones.has("REVIEW"), aprobada: decisiones.has("APPROVED") }
  } catch {
    return { pendiente: false, aprobada: false }
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
