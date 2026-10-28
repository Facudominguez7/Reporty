import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { actualizarPuntos, PUNTOS, restarPuntos, sumarPuntos } from "@/database/queries/puntos"
import { REPORT_STATE_IDS, REPORT_STATUS_VOTE_THRESHOLD } from "@/lib/authz/catalog"
import { isAdminRole, getUserRoleContext } from "@/lib/authz/roles"
import {
  getReportImageStorageRefs,
  isMissingReportImageColumnsError,
  type ReportImageRow,
} from "@/lib/media/report-images"
import {
  sendCommentNotificationEmail,
  sendStatusNotificationEmail,
} from "@/lib/notifications/report-notifications"
import { APORTES_COMUNITARIOS, type AporteKey } from "@/lib/reportes/aportes"

type MutationResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

type CommentProfileRelation =
  | {
      username: string
    }
  | {
      username: string
    }[]

type CommentView = {
  id: number
  reporte_id: number
  usuario_id: string
  contenido: string
  tipo_aporte?: string | null
  created_at: string
  profiles: CommentProfileRelation
}

type ReportOwnerRelation =
  | {
      username: string | null
      email: string | null
    }
  | {
      username: string | null
      email: string | null
    }[]
  | null

type ReportContext = {
  id: number
  usuario_id: string | null
  titulo: string
  estado_id: number | null
  deleted_at: string | null
  ownerProfile: ReportOwnerRelation
  reparacion_reportada_at?: string | null
}

type VoteResult = {
  count: number
  stateChangedTo: number | null
  needsAdminReview: boolean
}

type StatusChangeResult = {
  stateChanged: boolean
  estadoId: number
}

type SoftDeleteResult = {
  deleted: boolean
}

type ReportImageStorageRow = ReportImageRow

type CommentPointsContext = {
  comentarioId: number
  comentarioAutorId: string
  reporteId: number
  reporteAutorId: string | null
}

type CommentCreateResult = {
  comment: CommentView
  pointsAwarded: number
}

function getOwnerProfile(relation: ReportOwnerRelation) {
  if (Array.isArray(relation)) {
    return relation[0] ?? null
  }

  return relation ?? null
}

function getCommentUsername(relation: CommentProfileRelation) {
  if (Array.isArray(relation)) {
    return relation[0]?.username ?? null
  }

  return relation.username ?? null
}

function normalizeCommentProfiles(relation: CommentView["profiles"] | null | undefined): CommentProfileRelation {
  if (!relation) {
    return { username: "Usuario" }
  }

  if (Array.isArray(relation)) {
    return relation.map((profile) => ({ username: profile?.username ?? "Usuario" }))
  }

  return { username: relation.username ?? "Usuario" }
}

function toErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message
  }

  return fallback
}

export function isDuplicateRowError(error: { code?: string } | null | undefined) {
  return error?.code === "23505"
}

function isReportClosed(report: Pick<ReportContext, "estado_id">) {
  return report.estado_id === REPORT_STATE_IDS.REPARADO || report.estado_id === REPORT_STATE_IDS.RECHAZADO
}

async function getReportImageRows(
  supabase: SupabaseClient,
  reporteId: number,
): Promise<ReportImageStorageRow[]> {
  let { data, error } = await supabase
    .from("fotos_reporte")
    .select("url, bucket, path, thumbnail_url, thumbnail_bucket, thumbnail_path")
    .eq("reporte_id", reporteId)
    .returns<ReportImageStorageRow[]>()

  if (error && isMissingReportImageColumnsError(error)) {
    ;({ data, error } = await supabase
      .from("fotos_reporte")
      .select("url, bucket, path")
      .eq("reporte_id", reporteId)
      .returns<ReportImageStorageRow[]>())
  }

  if (error && isMissingReportImageColumnsError(error)) {
    ;({ data, error } = await supabase
      .from("fotos_reporte")
      .select("url")
      .eq("reporte_id", reporteId)
      .returns<ReportImageStorageRow[]>())
  }

  if (error) {
    console.error("No pudimos leer las imágenes asociadas al reporte para limpiar Storage:", {
      reporteId,
      message: error.message,
      code: error.code,
    })
    return []
  }

  return data ?? []
}

async function cleanupReportImages(
  supabase: SupabaseClient,
  reporteId: number,
) {
  const imageRows = await getReportImageRows(supabase, reporteId)
  const imageRefs = getReportImageStorageRefs(imageRows)

  if (imageRefs.length === 0) {
    return
  }

  const refsByBucket = imageRefs.reduce<Record<string, string[]>>((acc, ref) => {
    const currentPaths = acc[ref.bucket] ?? []
    currentPaths.push(ref.path)
    acc[ref.bucket] = currentPaths
    return acc
  }, {})

  for (const [bucket, paths] of Object.entries(refsByBucket)) {
    const { error } = await supabase.storage.from(bucket).remove(paths)

    if (error) {
      console.error("No pudimos borrar una o más imágenes del Storage al eliminar el reporte:", {
        reporteId,
        bucket,
        pathCount: paths.length,
        message: error.message,
      })
    }
  }
}

export async function getReportContext(
  supabase: SupabaseClient,
  reporteId: number,
): Promise<MutationResult<ReportContext>> {
  const { data, error } = await supabase
    .from("reportes")
    .select(
      `
        id,
        usuario_id,
        titulo,
        estado_id,
        deleted_at,
        reparacion_reportada_at,
        ownerProfile:profiles!reportes_usuario_id_fkey(username, email)
      `,
    )
    .eq("id", reporteId)
    .single()

  if (error || !data) {
    return { success: false, error: "No pudimos encontrar el reporte." }
  }

  return {
    success: true,
    data: data as ReportContext,
  }
}

async function ensureAdmin(supabase: SupabaseClient, userId: string): Promise<MutationResult<true>> {
  const { data, error } = await getUserRoleContext(supabase, userId)

  if (error || !isAdminRole(data?.roleId)) {
    return { success: false, error: "No tenés permisos de administrador para esta acción." }
  }

  return { success: true, data: true }
}

export async function applyReportStateChange(
  supabase: SupabaseClient,
  report: ReportContext,
  nextStateId: number,
  actorUserId: string,
  comment?: string,
): Promise<MutationResult<StatusChangeResult>> {
  if (report.deleted_at) {
    return { success: false, error: "El reporte ya no está disponible." }
  }

  if (report.estado_id === nextStateId) {
    return {
      success: true,
      data: { stateChanged: false, estadoId: nextStateId },
    }
  }

  const owner = getOwnerProfile(report.ownerProfile)
  const previousStateId = report.estado_id ?? null

  const { data: updatedReport, error: updateError } = await supabase
    .from("reportes")
    .update({ estado_id: nextStateId })
    .eq("id", report.id)
    .is("deleted_at", null)
    .neq("estado_id", nextStateId)
    .select("id")
    .maybeSingle()

  if (updateError) {
    return { success: false, error: "No pudimos actualizar el estado del reporte." }
  }

  if (!updatedReport) {
    const latestReportResult = await getReportContext(supabase, report.id)

    if (!latestReportResult.success) {
      return latestReportResult
    }

    if (latestReportResult.data.deleted_at) {
      return { success: false, error: "El reporte ya no está disponible." }
    }

    if (latestReportResult.data.estado_id === nextStateId) {
      return {
        success: true,
        data: { stateChanged: false, estadoId: nextStateId },
      }
    }

    return {
      success: false,
      error: "El estado del reporte cambió mientras procesábamos la acción. Recargá e intentá nuevamente.",
    }
  }

  if (report.usuario_id) {
    if (nextStateId === REPORT_STATE_IDS.RECHAZADO) {
      await actualizarPuntos(supabase, report.usuario_id, PUNTOS.REPORTE_RECHAZADO, "Reporte rechazado por votos")
    }

    if (nextStateId === REPORT_STATE_IDS.REPARADO) {
      await sumarPuntos(supabase, report.usuario_id, PUNTOS.REPORTE_VALIDADO_REPARADO, "Reporte validado como reparado")
    }
  }

  const { error: historyError } = await supabase.from("historial_estados").insert({
    reporte_id: report.id,
    estado_anterior_id: previousStateId,
    estado_nuevo_id: nextStateId,
    usuario_id: actorUserId,
    comentario: comment ?? null,
  })

  if (historyError) {
    console.error("Error al registrar historial de estado:", historyError)
  }

  if (report.usuario_id && owner?.email && (nextStateId === REPORT_STATE_IDS.REPARADO || nextStateId === REPORT_STATE_IDS.RECHAZADO)) {
    try {
      await sendStatusNotificationEmail({
        ownerEmail: owner.email,
        ownerUsername: owner.username,
        reporteId: report.id,
        reporteTitulo: report.titulo,
        nuevoEstado: nextStateId === REPORT_STATE_IDS.REPARADO ? "Reparado" : "Rechazado",
        comentario: comment ?? null,
      })
    } catch (notificationError) {
      console.error("Error al enviar notificación de estado:", notificationError)
    }
  }

  return {
    success: true,
    data: { stateChanged: true, estadoId: nextStateId },
  }
}

async function softDeleteComment(
  supabase: SupabaseClient,
  comentarioId: number,
  actorUserId?: string,
): Promise<MutationResult<CommentPointsContext>> {
  let contextQuery = supabase
    .from("comentarios_reporte")
    .select("id, reporte_id, usuario_id")
    .eq("id", comentarioId)
    .is("deleted_at", null)

  if (actorUserId) {
    contextQuery = contextQuery.eq("usuario_id", actorUserId)
  }

  const { data: commentRow, error: commentError } = await contextQuery.maybeSingle()

  if (commentError) {
    return { success: false, error: "No pudimos eliminar el comentario." }
  }

  if (!commentRow) {
    return {
      success: false,
      error: actorUserId
        ? "El comentario ya fue eliminado o no te pertenece."
        : "El comentario ya fue eliminado o no está disponible.",
    }
  }

  const reportResult = await getReportContext(supabase, commentRow.reporte_id)
  if (!reportResult.success) {
    return reportResult
  }

  let deleteQuery = supabase
    .from("comentarios_reporte")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", comentarioId)
    .is("deleted_at", null)

  if (actorUserId) {
    deleteQuery = deleteQuery.eq("usuario_id", actorUserId)
  }

  const { data, error } = await deleteQuery.select("id").maybeSingle()

  if (error) {
    return { success: false, error: "No pudimos eliminar el comentario." }
  }

  if (!data) {
    return {
      success: false,
      error: actorUserId
        ? "El comentario ya fue eliminado o no te pertenece."
        : "El comentario ya fue eliminado o no está disponible.",
    }
  }

  return {
    success: true,
    data: {
      comentarioId: commentRow.id,
      comentarioAutorId: commentRow.usuario_id,
      reporteId: commentRow.reporte_id,
      reporteAutorId: reportResult.data.usuario_id,
    },
  }
}

async function softDeleteReport(
  supabase: SupabaseClient,
  reporteId: number,
  actorUserId?: string,
): Promise<MutationResult<SoftDeleteResult>> {
  let query = supabase
    .from("reportes")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", reporteId)
    .is("deleted_at", null)

  if (actorUserId) {
    query = query.eq("usuario_id", actorUserId)
  }

  const { data, error } = await query.select("id").maybeSingle()

  if (error) {
    return { success: false, error: "No pudimos eliminar el reporte." }
  }

  if (!data) {
    return {
      success: false,
      error: actorUserId
        ? "El reporte ya fue eliminado o no te pertenece."
        : "El reporte ya fue eliminado o no está disponible.",
    }
  }

  await cleanupReportImages(supabase, reporteId)

  return { success: true, data: { deleted: true } }
}

async function revokeCommentPointsIfNeeded(
  supabase: SupabaseClient,
  context: CommentPointsContext,
) {
  if (context.reporteAutorId === context.comentarioAutorId) {
    return
  }

  const revokeResult = await restarPuntos(
    supabase,
    context.comentarioAutorId,
    PUNTOS.COMENTAR_REPORTE,
    `Eliminar comentario ${context.comentarioId} del reporte ${context.reporteId}`,
  )

  if (!revokeResult.success) {
    console.error("No pudimos revertir los puntos del comentario eliminado:", revokeResult.error)
  }
}

async function createVote(
  supabase: SupabaseClient,
  table: "votos_no_existe" | "votos_reparado",
  reportId: number,
  userId: string,
) {
  const { error: insertError } = await supabase.from(table).insert({
    reporte_id: reportId,
    usuario_id: userId,
  })

  if (isDuplicateRowError(insertError)) {
    return { success: false as const, error: "Ya habías votado este reporte." }
  }

  if (insertError) {
    return { success: false as const, error: "No pudimos registrar tu voto." }
  }

  const { count, error: countError } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("reporte_id", reportId)

  if (countError) {
    return { success: false as const, error: "No pudimos actualizar el contador de votos." }
  }

  return { success: true as const, count: count ?? 0 }
}

export async function votarNoExisteWorkflow(
  supabase: SupabaseClient,
  reporteId: number,
  actorUserId: string,
): Promise<MutationResult<VoteResult>> {
  const reportResult = await getReportContext(supabase, reporteId)
  if (!reportResult.success) {
    return reportResult
  }

  const report = reportResult.data

  if (report.deleted_at) {
    return { success: false, error: "El reporte ya no está disponible." }
  }

  if (isReportClosed(report)) {
    return { success: false, error: "No podés votar un reporte que ya está cerrado." }
  }

  if (report.usuario_id === actorUserId) {
    return { success: false, error: "No podés votar 'No Existe' sobre tu propio reporte." }
  }

  const voteResult = await createVote(supabase, "votos_no_existe", reporteId, actorUserId)
  if (!voteResult.success) {
    return voteResult
  }

  await sumarPuntos(supabase, actorUserId, PUNTOS.VOTAR_NO_EXISTE, "Votar 'No Existe' en reporte")

  return {
    success: true,
    data: {
      count: voteResult.count,
      stateChangedTo: null,
      needsAdminReview: voteResult.count >= REPORT_STATUS_VOTE_THRESHOLD,
    },
  }
}

export async function votarReparadoWorkflow(
  supabase: SupabaseClient,
  reporteId: number,
  actorUserId: string,
): Promise<MutationResult<VoteResult>> {
  const reportResult = await getReportContext(supabase, reporteId)
  if (!reportResult.success) {
    return reportResult
  }

  const report = reportResult.data

  if (report.deleted_at) {
    return { success: false, error: "El reporte ya no está disponible." }
  }

  if (isReportClosed(report)) {
    return { success: false, error: "No podés votar un reporte que ya está cerrado." }
  }

  if (report.usuario_id === actorUserId) {
    return { success: false, error: "No podés votar que tu propio reporte está reparado." }
  }

  const voteResult = await createVote(supabase, "votos_reparado", reporteId, actorUserId)
  if (!voteResult.success) {
    return voteResult
  }

  await sumarPuntos(supabase, actorUserId, PUNTOS.VOTAR_REPARADO, "Votar 'Reparado' en reporte")

  let stateChangedTo: number | null = null

  if (voteResult.count >= REPORT_STATUS_VOTE_THRESHOLD) {
    const stateResult = await applyReportStateChange(
      supabase,
      report,
      REPORT_STATE_IDS.REPARADO,
      actorUserId,
      `Marcado como reparado por ${voteResult.count} votos de usuarios`,
    )

    if (!stateResult.success) {
      return stateResult
    }

    stateChangedTo = stateResult.data.stateChanged ? stateResult.data.estadoId : null
  }

  return {
    success: true,
    data: {
      count: voteResult.count,
      stateChangedTo,
      needsAdminReview: false,
    },
  }
}

export async function marcarReporteReparadoWorkflow(
  supabase: SupabaseClient,
  reporteId: number,
  actorUserId: string,
): Promise<MutationResult<{ reported: true }>> {
  const reportResult = await getReportContext(supabase, reporteId)
  if (!reportResult.success) return reportResult

  const report = reportResult.data
  if (report.deleted_at || report.estado_id !== REPORT_STATE_IDS.PENDIENTE) {
    return { success: false, error: "El reporte ya no está disponible para informar una reparación." }
  }
  if (report.usuario_id !== actorUserId) {
    return { success: false, error: "Solo quien creó el reporte puede informar que se resolvió." }
  }
  if (report.reparacion_reportada_at) return { success: true, data: { reported: true } }

  const { data, error } = await supabase.from("reportes")
    .update({ reparacion_reportada_at: new Date().toISOString() })
    .eq("id", reporteId)
    .eq("usuario_id", actorUserId)
    .eq("estado_id", REPORT_STATE_IDS.PENDIENTE)
    .is("deleted_at", null)
    .is("reparacion_reportada_at", null)
    .select("id")
    .maybeSingle()

  if (error) return { success: false, error: "No pudimos registrar el aviso de reparación." }
  if (data) return { success: true, data: { reported: true } }

  const latest = await getReportContext(supabase, reporteId)
  return latest.success && latest.data.usuario_id === actorUserId && latest.data.reparacion_reportada_at
    ? { success: true, data: { reported: true } }
    : { success: false, error: "El reporte cambió mientras registrábamos el aviso. Actualizá e intentá nuevamente." }
}

export async function crearComentarioWorkflow(
  supabase: SupabaseClient,
  reporteId: number,
  actorUserId: string,
  aporteKey: AporteKey,
): Promise<MutationResult<CommentCreateResult>> {
  const aporte = APORTES_COMUNITARIOS.find(({ key }) => key === aporteKey)
  if (!aporte) {
    return { success: false, error: "Elegí una actualización válida." }
  }
  const cleanContent = aporte.label

  const reportResult = await getReportContext(supabase, reporteId)
  if (!reportResult.success) {
    return reportResult
  }

  const report = reportResult.data

  if (report.deleted_at) {
    return { success: false, error: "El reporte ya no está disponible." }
  }

  if (isReportClosed(report)) {
    return { success: false, error: "No podés comentar un reporte que ya está cerrado." }
  }

  const { data, error } = await supabase
    .from("comentarios_reporte")
    .insert({
      reporte_id: reporteId,
      usuario_id: actorUserId,
      contenido: cleanContent,
      tipo_aporte: aporte.key,
    })
    .select(
      `
        id,
        reporte_id,
        usuario_id,
        contenido,
        created_at,
        profiles(username)
      `,
    )
    .single()

  if (error || !data) {
    return { success: false, error: "No pudimos publicar tu comentario." }
  }

  const pointsAwarded = report.usuario_id === actorUserId ? 0 : PUNTOS.COMENTAR_REPORTE

  if (pointsAwarded > 0) {
    const pointsResult = await sumarPuntos(supabase, actorUserId, pointsAwarded, "Comentar en reporte ajeno")

    if (!pointsResult.success) {
      console.error("No pudimos acreditar puntos tras comentar un reporte ajeno:", pointsResult.error)
    }
  }

  const owner = getOwnerProfile(report.ownerProfile)
  if (report.usuario_id && report.usuario_id !== actorUserId && owner?.email) {
    try {
      await sendCommentNotificationEmail({
        ownerEmail: owner.email,
        ownerUsername: owner.username,
        commenterUsername: getCommentUsername((data as CommentView).profiles),
        reporteId,
        reporteTitulo: report.titulo,
        comentarioContenido: cleanContent,
      })
    } catch (notificationError) {
      console.error("Error al enviar notificación de comentario:", notificationError)
    }
  }

  return {
    success: true,
    data: {
      comment: {
        ...(data as Omit<CommentView, "profiles"> & { profiles?: CommentView["profiles"] | null }),
        profiles: normalizeCommentProfiles((data as CommentView).profiles),
      },
      pointsAwarded,
    },
  }
}

export async function eliminarComentarioPropioWorkflow(
  supabase: SupabaseClient,
  comentarioId: number,
  actorUserId: string,
): Promise<MutationResult<true>> {
  const deleteResult = await softDeleteComment(supabase, comentarioId, actorUserId)
  if (!deleteResult.success) {
    return deleteResult
  }

  await revokeCommentPointsIfNeeded(supabase, deleteResult.data)

  return { success: true, data: true }
}

export async function eliminarComentarioAdminWorkflow(
  supabase: SupabaseClient,
  comentarioId: number,
  actorUserId: string,
): Promise<MutationResult<true>> {
  const adminResult = await ensureAdmin(supabase, actorUserId)
  if (!adminResult.success) {
    return adminResult
  }

  const deleteResult = await softDeleteComment(supabase, comentarioId)
  if (!deleteResult.success) {
    return deleteResult
  }

  await revokeCommentPointsIfNeeded(supabase, deleteResult.data)

  return { success: true, data: true }
}

export async function eliminarReportePropioWorkflow(
  supabase: SupabaseClient,
  reporteId: number,
  actorUserId: string,
): Promise<MutationResult<true>> {
  const deleteResult = await softDeleteReport(supabase, reporteId, actorUserId)
  if (!deleteResult.success) {
    return deleteResult
  }

  await actualizarPuntos(supabase, actorUserId, PUNTOS.ELIMINAR_REPORTE_PROPIO, "Eliminar reporte propio")

  return { success: true, data: true }
}

export async function eliminarReporteAdminWorkflow(
  supabase: SupabaseClient,
  reporteId: number,
  actorUserId: string,
): Promise<MutationResult<true>> {
  const adminResult = await ensureAdmin(supabase, actorUserId)
  if (!adminResult.success) {
    return adminResult
  }

  const reportResult = await getReportContext(supabase, reporteId)
  if (!reportResult.success) {
    return reportResult
  }

  const deleteResult = await softDeleteReport(supabase, reporteId)
  if (!deleteResult.success) {
    return deleteResult
  }

  const reportOwnerId = reportResult.data.usuario_id
  if (reportOwnerId && reportOwnerId !== actorUserId) {
    const pointsResult = await actualizarPuntos(
      supabase,
      reportOwnerId,
      PUNTOS.ELIMINAR_REPORTE_PROPIO,
      "Eliminar reporte por administrador",
    )

    if (!pointsResult.success) {
      console.error("No pudimos descontar puntos al autor del reporte eliminado por admin:", pointsResult.error)
    }
  }

  return { success: true, data: true }
}

export async function cambiarEstadoAdminWorkflow(
  supabase: SupabaseClient,
  reporteId: number,
  nuevoEstadoId: number,
  actorUserId: string,
  comentario?: string,
): Promise<MutationResult<StatusChangeResult>> {
  const adminResult = await ensureAdmin(supabase, actorUserId)
  if (!adminResult.success) {
    return adminResult
  }

  const reportResult = await getReportContext(supabase, reporteId)
  if (!reportResult.success) {
    return reportResult
  }

  return applyReportStateChange(
    supabase,
    reportResult.data,
    nuevoEstadoId,
    actorUserId,
    comentario?.trim() || "Cambio de estado realizado por administrador",
  )
}

export function mutationErrorMessage(error: unknown, fallback: string) {
  return toErrorMessage(error, fallback)
}
