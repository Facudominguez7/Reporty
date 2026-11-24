import "server-only"

import { cache } from "react"

import { leerFilaReporte } from "@/database/queries/reportes/[id]/get-reporte-detalle"
import { getPrimaryReportImageUrl } from "@/lib/media/report-images"
import type { ReportSeo } from "@/lib/seo/report-metadata"
import { createPublicClient } from "@/utils/supabase/public"

type NameRelation = { nombre: string | null } | { nombre: string | null }[] | null

function nombre(relation: NameRelation) {
  return (Array.isArray(relation) ? relation[0]?.nombre : relation?.nombre) ?? null
}

/**
 * What search engines and link previews need from a report: the same for every visitor. It reuses
 * the detail page's per-request row read (`leerFilaReporte`), so a visit reads the report once.
 * `reporte` is null when the report does not exist or was deleted; `error` means the lookup itself
 * failed, which must not be mistaken for a missing report.
 */
export const getReporteSeo = cache(async (id: string): Promise<{ reporte: ReportSeo | null; error: unknown }> => {
  if (!/^\d+$/.test(id)) return { reporte: null, error: null }

  const { data, error } = await leerFilaReporte(id)

  if (error) return { reporte: null, error }
  if (!data) return { reporte: null, error: null }

  return {
    reporte: {
      id: data.id,
      titulo: data.titulo,
      descripcion: data.descripcion,
      created_at: data.created_at,
      categoria: nombre(data.categorias),
      estado: nombre(data.estados),
      imageUrl: getPrimaryReportImageUrl(data.fotos_reporte),
    },
    error: null,
  }
})

/** Every report that is still published, for the sitemap. */
export async function getSitemapReportes() {
  const { data, error } = await createPublicClient()
    .from("reportes")
    .select("id, created_at")
    .is("deleted_at", null)
    .order("id", { ascending: false })
    .limit(50000)

  if (error) console.error("Error al cargar los reportes del sitemap:", error)
  return (data ?? []) as Array<{ id: number; created_at: string }>
}
