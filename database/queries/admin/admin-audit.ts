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

export async function getAdminAudit(supabase: SupabaseClient, userId: string, page: number) {
  const { isAdmin, error: roleError } = await verificarEsAdmin(supabase, userId)
  if (roleError || !isAdmin) return { unauthorized: true, events: [], hasNext: false, error: roleError }

  const safePage = Number.isSafeInteger(page) && page > 0 ? page : 1
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("audit_events")
    .select("id, occurred_at, actor_id, report_id, report_title, action")
    .order("occurred_at", { ascending: false })
    .order("id", { ascending: false })
    .range((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  if (error) return { unauthorized: false, events: [], hasNext: false, error }
  const rows = (data ?? []) as Omit<AuditEvent, "actor">[]
  const actorIds = [...new Set(rows.map((row) => row.actor_id).filter((id): id is string => Boolean(id)))]
  const { data: profiles, error: profileError } = actorIds.length
    ? await admin.from("profiles").select("id, username").in("id", actorIds)
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
