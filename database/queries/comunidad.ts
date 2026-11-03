import type { PostgrestError } from "@supabase/supabase-js"
import { unstable_cache } from "next/cache"

import { REPORT_STATE_IDS } from "@/lib/authz/catalog"
import { getPublicProfilesByIds, getPublicProfilesCount, indexPublicProfilesById } from "@/database/queries/profiles"
import { createPublicClient } from "@/utils/supabase/public"

type VisibleReport = {
  usuario_id: string | null
}

export type CommunityContributor = {
  id: string
  username: string
  points: number
  reports: number
}

export type CommunityPageData = {
  members: number
  totalReports: number
  solvedReports: number
  pendingReports: number
  contributors: CommunityContributor[]
  error: PostgrestError | null
}

const EMPTY_DATA: CommunityPageData = {
  members: 0,
  totalReports: 0,
  solvedReports: 0,
  pendingReports: 0,
  contributors: [],
  error: null,
}

/** Community numbers are public and identical for every visitor, so a short cache is safe. */
const COMMUNITY_REVALIDATE_SECONDS = 60

/**
 * Loads the community page data with the anon role and caches it between requests.
 * Every read here (visible reports and public profiles) returns the same rows for anon and
 * authenticated users. Query errors throw so a failed read is never stored in the cache.
 */
const loadComunidadPageData = unstable_cache(
  async (): Promise<Omit<CommunityPageData, "error">> => {
    const supabase = createPublicClient()

    const countVisibleReports = (estadoId?: number) => {
      const query = supabase
        .from("reportes")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null)
      return estadoId === undefined ? query : query.eq("estado_id", estadoId)
    }

    // Every query here is independent, so they all run at the same time. The totals stay as
    // exact counts because the row list below is capped by the API's max rows setting.
    const [
      { data: reports, error: reportsError },
      { count: members, error: membersError },
      { count: totalReports, error: totalError },
      { count: solvedReports, error: solvedError },
      { count: pendingReports, error: pendingError },
    ] = await Promise.all([
      supabase
        .from("reportes")
        .select("usuario_id")
        .is("deleted_at", null)
        .returns<VisibleReport[]>(),
      getPublicProfilesCount(supabase),
      countVisibleReports(),
      countVisibleReports(REPORT_STATE_IDS.REPARADO),
      countVisibleReports(REPORT_STATE_IDS.PENDIENTE),
    ])

    const firstError = reportsError ?? membersError ?? totalError ?? solvedError ?? pendingError
    if (firstError) throw firstError

    const reportCounts = new Map<string, number>()
    for (const report of reports ?? []) {
      if (report.usuario_id) {
        reportCounts.set(report.usuario_id, (reportCounts.get(report.usuario_id) ?? 0) + 1)
      }
    }

    // Profiles are needed for every contributor (not only the top 10) because guests
    // must be filtered out before ranking. It is still a single batched query.
    const contributorIds = [...reportCounts.keys()]
    const { data: profiles, error: profilesError } = await getPublicProfilesByIds(supabase, contributorIds)
    if (profilesError) throw profilesError
    const profilesById = indexPublicProfilesById(profiles)

    const contributors = contributorIds
      // Guests (role 5) report like anyone else but do not take part in the ranking.
      .filter((id) => !profilesById.get(id)?.es_invitado)
      .map((id) => {
        const profile = profilesById.get(id)
        return {
          id,
          username: profile?.username?.trim() || "Usuario",
          points: profile?.puntos ?? 0,
          reports: reportCounts.get(id) ?? 0,
        }
      })
      .sort((a, b) => b.reports - a.reports || b.points - a.points || a.id.localeCompare(b.id))
      .slice(0, 10)

    return {
      members: members ?? 0,
      totalReports: totalReports ?? 0,
      solvedReports: solvedReports ?? 0,
      pendingReports: pendingReports ?? 0,
      contributors,
    }
  },
  ["comunidad-page-data"],
  { revalidate: COMMUNITY_REVALIDATE_SECONDS, tags: ["comunidad"] },
)

export async function getComunidadPageData(): Promise<CommunityPageData> {
  try {
    return { ...(await loadComunidadPageData()), error: null }
  } catch (error) {
    console.error("Error al obtener los datos de la comunidad:", error)
    return { ...EMPTY_DATA, error: error as PostgrestError }
  }
}
