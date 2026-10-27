import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { verificarEsAdmin } from "@/database/queries/admin/verificar-admin"
import { createAdminClient } from "@/utils/supabase/admin"

export type AuditEvent = {
  id: number
  occurred_at: string
  actor_id: string | null
  actor: string
  report_id: number | null
  report_title: string | null
  action: "report_created" | "comment_created" | "vote_repaired" | "vote_not_exists"
}

const PAGE_SIZE = 20

export type AuditFilters = {
  user?: string
  action?: AuditEvent["action"]
  days?: 7 | 30
}

export async function getAdminAudit(supabase: SupabaseClient, userId: string, page: number, filters: AuditFilters = {}) {
  const { isAdmin, error: roleError } = await verificarEsAdmin(supabase, userId)
  if (roleError || !isAdmin) return { unauthorized: true, events: [], hasNext: false, error: roleError }

  const safePage = Number.isSafeInteger(page) && page > 0 ? page : 1
  const admin = createAdminClient()
  const search = filters.user?.trim().slice(0, 100)
  let actorIds: string[] | undefined
  if (search) {
    const { data: matches, error: searchError } = await admin.from("profiles")
      .select("id").ilike("username", `%${search.replace(/[%_\\]/g, "\\$&")}%`)
    if (searchError) return { unauthorized: false, events: [], hasNext: false, error: searchError }
    actorIds = (matches ?? []).map(({ id }) => id)
    if (!actorIds.length) return { unauthorized: false, events: [], hasNext: false, error: null }
  }

  let query = admin.from("audit_events").select("id, occurred_at, actor_id, report_id, report_title, action")
  if (actorIds) query = query.in("actor_id", actorIds)
  if (filters.action) query = query.eq("action", filters.action)
  if (filters.days) query = query.gte("occurred_at", new Date(Date.now() - filters.days * 86_400_000).toISOString())
  const { data, error } = await query.order("occurred_at", { ascending: false })
    .order("id", { ascending: false })
    .range((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  if (error) return { unauthorized: false, events: [], hasNext: false, error }
  const rows = (data ?? []) as Omit<AuditEvent, "actor">[]
  const pageActorIds = [...new Set(rows.map((row) => row.actor_id).filter((id): id is string => Boolean(id)))]
  const { data: profiles, error: profileError } = pageActorIds.length
    ? await admin.from("profiles").select("id, username").in("id", pageActorIds)
    : { data: [], error: null }
  if (profileError) return { unauthorized: false, events: [], hasNext: false, error: profileError }
  const names = new Map((profiles ?? []).map((profile) => [profile.id, profile.username]))

  return {
    unauthorized: false,
    events: rows.slice(0, PAGE_SIZE).map((row) => ({
      ...row,
      actor: (row.actor_id && names.get(row.actor_id)) || (row.actor_id ? `Usuario ${row.actor_id.slice(0, 8)}` : "Usuario sin identificar"),
    })),
    hasNext: rows.length > PAGE_SIZE,
    error: null,
  }
}
