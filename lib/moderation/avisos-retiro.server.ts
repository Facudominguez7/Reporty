/** Entrega privada durable: nunca modifica publicación, reporte ni puntos. */
import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import { sendReportWithdrawalEmail } from "@/lib/notifications/report-notifications"

// Resend conserva claves 24 h. Margen de cinco minutos para transporte/relojes.
export const VENTANA_REINTENTO_MS = (24 * 60 - 5) * 60000
export type EstadoAviso = "pendiente" | "enviado" | "conciliacion"

/** El llamador ya autorizó servicio. Reclamo DB ancla primer intento antes de toda red. */
export async function enviarAvisoRetiro(servicio: SupabaseClient, reporteId: number): Promise<EstadoAviso> {
  try {
    const reclamo = await servicio.rpc("reclamar_aviso_retiro", { p_reporte_id: reporteId })
    if (reclamo.error || !reclamo.data) return "pendiente"
    const { data: fila, error } = await servicio.from("avisos_retiro_reporte")
      .select("destinatario,estado,token,primer_intento_at,reclamado_hasta").eq("reporte_id", reporteId).single()
    if (error || !fila || fila.estado !== "reclamado" || fila.token !== reclamo.data || !fila.destinatario) return "pendiente"
    if (!(Date.parse(fila.reclamado_hasta) > Date.now())) return "pendiente"
    const inicio = Date.parse(fila.primer_intento_at)
    if (!Number.isFinite(inicio) || Date.now() - inicio >= VENTANA_REINTENTO_MS) return "conciliacion"
    const respuesta = await sendReportWithdrawalEmail({ destinatario: fila.destinatario, reporteId })
    if (respuesta.error || !respuesta.data?.id) return "pendiente"
    const confirmacion = await servicio.rpc("confirmar_aviso_retiro", { p_reporte_id: reporteId, p_token: reclamo.data })
    return !confirmacion.error && confirmacion.data === true ? "enviado" : "pendiente"
  } catch {
    // Timeout y aceptación incierta son indistinguibles. No confirmar, registrar PII ni restaurar.
    return "pendiente"
  }
}
