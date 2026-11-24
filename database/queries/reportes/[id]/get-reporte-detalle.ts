import { SupabaseClient } from "@supabase/supabase-js";
import { cache } from "react";
import {
  isMissingReportImageColumnsError,
  type ReportImageRow,
  type ResolvedReportImageRow,
  resolveReportImageRows,
} from "@/lib/media/report-images";
import { createPublicClient } from "@/utils/supabase/public";
import { getReporteVoteSummary, type ReporteVoteSummary } from "./votos";

const buildReporteDetalleSelect = (includeCanonicalImageFields: boolean) => `
      id,
      titulo,
      descripcion,
      lat,
      lon,
      direccion,
      created_at,
      usuario_id,
      estado_id,
      categoria_id,
      prioridad_id,
      categorias (nombre),
      prioridades (nombre),
      estados (id, nombre),
      fotos_reporte (${includeCanonicalImageFields ? "id, url, bucket, path, thumbnail_url, thumbnail_bucket, thumbnail_path" : "id, url"}),
      profiles:public_profiles!usuario_id(username)
    `

export type ReportNameRelation = { nombre: string | null } | { nombre: string | null }[] | null

export type ReportStateRelation = { id: number; nombre: string | null } | { id: number; nombre: string | null }[] | null

export type ReportUsernameRelation = { username: string | null } | { username: string | null }[] | null

type ReporteDetalleRow = {
  id: number
  titulo: string
  descripcion: string | null
  lat: number | null
  lon: number | null
  /** Dirección legible guardada al crear el reporte; `null` si no se encontró. */
  direccion?: string | null
  created_at: string
  usuario_id: string
  estado_id: number
  categoria_id: number | null
  prioridad_id: number | null
  categorias: ReportNameRelation
  prioridades: ReportNameRelation
  estados: ReportStateRelation
  fotos_reporte: Array<ReportImageRow & { id: number }> | null
  profiles?: ReportUsernameRelation
}

type ReporteDetalleView = Omit<ReporteDetalleRow, "fotos_reporte"> & {
  fotos_reporte: ResolvedReportImageRow<ReportImageRow & { id: number }>[]
  votos: ReporteVoteSummary
}

export type ReporteDetalle = ReporteDetalleView

/**
 * Lee la fila publicada de un reporte con sus relaciones, una sola vez por pedido.
 *
 * La comparten la página del detalle y `generateMetadata` (vía `getReporteSeo`): `cache` de React
 * hace que, dentro de un mismo pedido, las dos reciban la misma lectura en lugar de pedir la fila
 * dos veces. Usa el cliente público (rol anónimo) porque la fila es igual para todos: la RLS de
 * `reportes` solo filtra `deleted_at is null`, igual para `anon` y `authenticated`.
 *
 * @param reporteId - ID del reporte, tal como llega en la URL.
 * @returns `data` con la fila o `null` si no existe; `error` si la lectura falló.
 */
export const leerFilaReporte = cache(async (reporteId: string) => {
  const cliente = createPublicClient()
  let { data, error } = await cliente
    .from("reportes")
    .select(buildReporteDetalleSelect(true))
    .eq("id", reporteId)
    .is("deleted_at", null)
    .returns<ReporteDetalleRow[]>()
    .maybeSingle()

  if (error && isMissingReportImageColumnsError(error)) {
    ({ data, error } = await cliente
      .from("reportes")
      .select(buildReporteDetalleSelect(false))
      .eq("id", reporteId)
      .is("deleted_at", null)
      .returns<ReporteDetalleRow[]>()
      .maybeSingle())
  }

  return { data: (data ?? null) as ReporteDetalleRow | null, error }
})

/**
 * Recupera el registro completo de un reporte identificado por su ID, incluyendo relaciones relacionadas.
 *
 * @param reporteId - ID del reporte a recuperar
 * @returns Un objeto con `data` y `error`. `data` contiene el reporte (campos: `id`, `titulo`, `descripcion`, `lat`, `lon`, `direccion`, `created_at`, `usuario_id`, `estado_id`, y relaciones `categorias.nombre`, `prioridades.nombre`, `estados.{id,nombre}`, `fotos_reporte.url`, `profiles.username`) o `null` si no se encontró; `error` contiene el error de la consulta o `null` si la operación tuvo éxito.
 */
export async function getReporteDetalle(
  supabase: SupabaseClient,
  reporteId: string,
  usuarioId?: string | null | PromiseLike<string | null | undefined>,
) {
  // The vote counts start now; only the visitor's own-vote lookup waits for the user id, which
  // may still be loading. The report row below never waits for it.
  const voteSummaryPromise = getReporteVoteSummary(supabase, reporteId, usuarioId)
  // Unused when the report lookup fails; the handler keeps that path free of unhandled rejections.
  voteSummaryPromise.catch(() => {})

  // The row comes from the per-request shared read, so the metadata does not fetch it again.
  const { data: fila, error: errorFila } = await leerFilaReporte(reporteId)
  // `maybeSingle` returns no error for a missing row; the page expects one, as with `single`.
  const error = errorFila ?? (fila ? null : { message: "Reporte no encontrado", code: "PGRST116" })

  if (error) {
    console.error("Error al obtener reporte:", error);
    return { data: null, error };
  }

  const reporte = fila
  // El autor llega en la misma fila (relación usuario_id → public_profiles), sin otro viaje.
  const autor = Array.isArray(reporte?.profiles) ? reporte.profiles[0] : reporte?.profiles
  const voteSummaryResult = await voteSummaryPromise

  if (voteSummaryResult.error) {
    console.error("Error al obtener resumen de votos del reporte:", voteSummaryResult.error)
  }

  return {
    data: reporte
      ? {
          ...reporte,
          profiles: autor ? { username: autor.username } : null,
          fotos_reporte: resolveReportImageRows(reporte.fotos_reporte),
          votos: voteSummaryResult.data,
        } satisfies ReporteDetalleView
      : null,
    error: null,
  };
}
