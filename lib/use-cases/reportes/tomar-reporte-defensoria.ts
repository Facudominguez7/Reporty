/**
 * Toma de un reporte por la Defensoría del Pueblo (S1, S5, S6 del feature
 * odd/tasks/defensoria-reclamos.md): crea el reclamo con el número del sistema externo,
 * transiciona el estado a «Tomado por Defensoría» y notifica al autor.
 *
 * El estado es intermedio-terminal: la Defensoría no cierra reportes; el paso a Reparado
 * sigue siendo del flujo de evidencia de la comunidad/administración (S6).
 */
import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { REPORT_STATE_IDS } from "@/lib/authz/catalog"
import { esDefensoria, getUserRoleContext } from "@/lib/authz/roles"
import { registrarCambioEstado } from "@/database/queries/reportes/[id]/historial-estados"
import { pushTomaDefensoria } from "@/lib/push/avisos.server"
import { sendTomaDefensoriaEmail } from "@/lib/notifications/report-notifications"
import { getReportContext } from "./detail-mutations"

/** Resultado uniforme de las mutaciones del módulo de detalle. */
type MutationResult<T> = { success: true; data: T } | { success: false; error: string }

type ResultadoToma = MutationResult<{ numeroReclamo: string }>

/**
 * Registra la toma: valida rol, estado vigente y número de reclamo; inserta el reclamo,
 * actualiza el estado y deja el cambio en el historial con un comentario neutral. El número
 * es privado del autor (S9): nunca viaja por el historial público, ni en tomas nuevas ni en
 * las existentes (la migración de privacidad redacta los comentarios previos).
 *
 * @param supabase - Cliente admin (service role); las tablas tocadas son privadas o de escritura confiable.
 * @param reporteId - Reporte Pendiente a tomar.
 * @param actorUserId - Usuario autenticado con rol Defensoría.
 * @param numeroReclamo - Texto libre no vacío del sistema externo (S5).
 * @returns El número normalizado, o el error para mostrar en la UI.
 */
export async function tomarReporteDefensoriaWorkflow(
  supabase: SupabaseClient,
  reporteId: number,
  actorUserId: string,
  numeroReclamo: string,
): Promise<ResultadoToma> {
  const numero = numeroReclamo.trim()
  if (!numero) {
    return { success: false, error: "El número de reclamo es obligatorio." }
  }

  const rolResult = await getUserRoleContext(supabase, actorUserId)
  if (rolResult.error || !esDefensoria(rolResult.data?.roleId)) {
    return { success: false, error: "Solo la Defensoría del Pueblo puede tomar reportes." }
  }

  const reportResult = await getReportContext(supabase, reporteId)
  if (!reportResult.success) return reportResult
  const report = reportResult.data

  if (report.deleted_at) {
    return { success: false, error: "El reporte ya no está disponible." }
  }
  if (report.estado_id !== REPORT_STATE_IDS.PENDIENTE) {
    return { success: false, error: "El reporte ya fue tomado o no está pendiente." }
  }

  const { error: reclamoError } = await supabase.from("reclamos_defensoria").insert({
    reporte_id: reporteId,
    numero_reclamo: numero,
    tomado_por: actorUserId,
  })
  if (reclamoError) {
    // 23505: violación de unicidad — otro usuario de Defensoría tomó el reporte primero.
    if (reclamoError.code === "23505") {
      return { success: false, error: "El reporte ya tiene un reclamo de la Defensoría." }
    }
    console.error("Error al registrar el reclamo de Defensoría:", reclamoError)
    return { success: false, error: "No pudimos registrar el reclamo. Intentá nuevamente." }
  }

  const { error: estadoError } = await supabase
    .from("reportes")
    .update({ estado_id: REPORT_STATE_IDS.TOMADO_DEFENSORIA })
    .eq("id", reporteId)
    .eq("estado_id", REPORT_STATE_IDS.PENDIENTE)
  if (estadoError) {
    console.error("Error al cambiar el estado a Tomado por Defensoría:", estadoError)
    return { success: false, error: "No pudimos actualizar el estado. Intentá nuevamente." }
  }

  // El historial es público: el comentario queda neutral porque el número de reclamo solo
  // lo ve el autor en su ficha (S9). El reclamo en sí vive en reclamos_defensoria.
  await registrarCambioEstado(
    supabase,
    reporteId,
    REPORT_STATE_IDS.PENDIENTE,
    REPORT_STATE_IDS.TOMADO_DEFENSORIA,
    actorUserId,
    "Tomado por la Defensoría del Pueblo",
  )

  await notificarAutorToma(supabase, report, numero)
  return { success: true, data: { numeroReclamo: numero } }
}

/**
 * Notifica al autor que la Defensoría tomó su reporte: email + notificación en el celular
 * (S1, S4 — la UI nunca dice «push»). Los fallos de notificación no revierten la toma.
 */
async function notificarAutorToma(
  supabase: SupabaseClient,
  report: { id: number; titulo: string; usuario_id: string | null },
  numeroReclamo: string,
): Promise<void> {
  if (!report.usuario_id) return

  try {
    await pushTomaDefensoria(supabase, {
      usuarioId: report.usuario_id,
      reporteId: report.id,
      titulo: report.titulo,
      numeroReclamo,
    })
  } catch (error) {
    console.error("Error al enviar la notificación en el celular de la toma:", error)
  }

  const { data: owner } = await supabase
    .from("profiles")
    .select("username, email")
    .eq("id", report.usuario_id)
    .maybeSingle()
  const email = typeof owner?.email === "string" ? owner.email.trim() : ""
  if (!email) return

  try {
    await sendTomaDefensoriaEmail({
      ownerEmail: email,
      ownerUsername: owner?.username ?? null,
      reporteId: report.id,
      reporteTitulo: report.titulo,
      numeroReclamo,
    })
  } catch (error) {
    console.error("Error al enviar el email de la toma de Defensoría:", error)
  }
}
