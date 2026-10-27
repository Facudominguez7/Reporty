import "server-only"

import { createClient } from "@/utils/supabase/server"
import { createAdminClient } from "@/utils/supabase/admin"
import { getUserRoleContext, isAdminRole } from "@/lib/authz/roles"

const PAGE_SIZE = 25
const AUTH_PAGE_SIZE = 1000

export type AdminUserFilter = "accounts" | "guests" | "all"

type ProfileRow = {
  id: string
  username: string | null
  rol_id: number | null
  roles: { nombre: string | null } | Array<{ nombre: string | null }> | null
}

export type AdminUser = {
  id: string
  email: string | null
  username: string | null
  roleId: number | null
  roleName: string
  createdAt: string | null
  lastSignInAt: string | null
  bannedUntil: string | null
  isAnonymous: boolean
  reportCount: number
}

function isBlocked(bannedUntil: string | null) {
  return Boolean(bannedUntil && Date.parse(bannedUntil) > Date.now())
}

function matchesFilter(user: AdminUser, filter: AdminUserFilter) {
  if (filter === "all") return true
  if (filter === "guests") return user.isAnonymous || !user.email
  return Boolean(user.email) && !user.isAnonymous
}

function matchesSearch(user: AdminUser, search: string) {
  if (!search) return true
  const value = search.toLocaleLowerCase()
  return [user.username, user.email].some((field) => field?.toLocaleLowerCase().includes(value))
}

export async function getAdminUsers(page = 1, filter: AdminUserFilter = "accounts", rawSearch = "") {
  const sessionClient = await createClient()
  const { data: authData } = await sessionClient.auth.getUser()
  if (!authData.user) return { users: [], hasNext: false, unauthorized: true }

  const { data: roleContext, error: roleError } = await getUserRoleContext(sessionClient, authData.user.id)
  if (roleError || !isAdminRole(roleContext?.roleId)) {
    return { users: [], hasNext: false, unauthorized: true }
  }

  const safePage = Number.isSafeInteger(page) && page > 0 ? page : 1
  const admin = createAdminClient()
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: AUTH_PAGE_SIZE })
  if (error) throw new Error("No se pudo cargar el listado de usuarios.")

  const authUsers = data.users ?? []
  const ids = authUsers.map((user) => user.id)
  const [{ data: profiles, error: profilesError }, { data: reports, error: reportsError }] = await Promise.all([
    ids.length
      ? admin.from("profiles").select("id, username, rol_id, roles(nombre)").in("id", ids).returns<ProfileRow[]>()
      : Promise.resolve({ data: [], error: null }),
    ids.length
      ? admin.from("reportes").select("usuario_id").in("usuario_id", ids).is("deleted_at", null)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (profilesError) throw new Error("No se pudo cargar el listado de perfiles.")
  if (reportsError) throw new Error("No se pudo cargar la cantidad de reportes.")

  const profilesById = new Map((profiles ?? []).map((profile) => [profile.id, profile]))
  const reportCounts = new Map<string, number>()
  for (const report of reports ?? []) {
    if (report.usuario_id) reportCounts.set(report.usuario_id, (reportCounts.get(report.usuario_id) ?? 0) + 1)
  }

  const search = rawSearch.trim().slice(0, 100)
  const users = authUsers.map((user): AdminUser => {
    const profile = profilesById.get(user.id)
    const role = Array.isArray(profile?.roles) ? profile.roles[0]?.nombre : profile?.roles?.nombre
    const bannedUntil = (user as typeof user & { banned_until?: string | null }).banned_until ?? null
    return {
      id: user.id,
      email: user.email ?? null,
      username: profile?.username ?? null,
      roleId: profile?.rol_id ?? null,
      roleName: role ?? "Sin rol",
      createdAt: user.created_at ?? null,
      lastSignInAt: user.last_sign_in_at ?? null,
      bannedUntil,
      isAnonymous: user.is_anonymous ?? false,
      reportCount: reportCounts.get(user.id) ?? 0,
    }
  }).filter((user) => matchesFilter(user, filter) && matchesSearch(user, search))

  const offset = (safePage - 1) * PAGE_SIZE
  return {
    users: users.slice(offset, offset + PAGE_SIZE),
    hasNext: users.length > offset + PAGE_SIZE,
    unauthorized: false,
    total: users.length,
    filter,
  }
}

export { isBlocked }
