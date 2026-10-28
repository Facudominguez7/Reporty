import "server-only"

import { REPORT_STATE_IDS } from "@/lib/authz/catalog"
import { autorizarAdministracion } from "./administracion.server"

const PAGE_SIZE = 20

type Relation<T> = T | T[] | null

type ReviewRow = {
  reporte_id: number
  creado_at: string
  reportes: Relation<{
    id: number
    titulo: string
    descripcion: string | null
    created_at: string
    reportes_vote_summary: Relation<{ votos_no_existe_count: number }>
  }>
}

export type RevisionRechazoReporte = {
  reporteId: number
  titulo: string
  descripcion: string | null
  reportCreatedAt: string
  reviewCreatedAt: string
  noExisteVotes: number
}

function one<T>(relation: Relation<T>): T | null {
  return Array.isArray(relation) ? relation[0] ?? null : relation
}

/** Counts only unresolved community rejection reviews for reports that remain open. */
export async function getCantidadRevisionesRechazoReportes(): Promise<number | null> {
  const { servicio } = await autorizarAdministracion()
  const { count, error } = await servicio.from("reportes_revision_rechazo")
    .select("reporte_id,reportes!inner(id)", { count: "exact", head: true })
    .eq("estado", "pendiente")
    .eq("reportes.estado_id", REPORT_STATE_IDS.PENDIENTE)
    .is("reportes.deleted_at", null)

  return error ? null : count
}

/** Lists the admin inbox without exposing voter identities or trusting client-supplied report data. */
export async function listarRevisionesRechazoReportes(pagina: number): Promise<RevisionRechazoReporte[]> {
  const { servicio } = await autorizarAdministracion()
  const page = Number.isSafeInteger(pagina) ? Math.max(0, Math.min(pagina, 500)) : 0
  const { data, error } = await servicio.from("reportes_revision_rechazo")
    .select("reporte_id,creado_at,reportes!inner(id,titulo,descripcion,created_at,estado_id,deleted_at,reportes_vote_summary(votos_no_existe_count))")
    .eq("estado", "pendiente")
    .eq("reportes.estado_id", REPORT_STATE_IDS.PENDIENTE)
    .is("reportes.deleted_at", null)
    .order("creado_at", { ascending: true })
    .order("reporte_id", { ascending: true })
    .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)

  if (error) throw new Error("No se pudieron consultar las revisiones de reportes.")

  return ((data ?? []) as ReviewRow[]).flatMap((row) => {
    const reporte = one(row.reportes)
    const resumen = reporte && one(reporte.reportes_vote_summary)
    if (!reporte || !resumen) return []
    return [{
      reporteId: reporte.id,
      titulo: reporte.titulo,
      descripcion: reporte.descripcion,
      reportCreatedAt: reporte.created_at,
      reviewCreatedAt: row.creado_at,
      noExisteVotes: resumen.votos_no_existe_count,
    }]
  })
}
