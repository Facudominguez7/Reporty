import type { SupabaseClient } from "@supabase/supabase-js"
import { verificarEsAdmin } from "./verificar-admin"
import { createAdminClient } from "@/utils/supabase/admin"

export type AdminMascotaFilters = { search?: string; estado?: string; tipo?: string; page?: number; pageSize?: number }
export type AdminMascota = { id: number; tipo_animal: string; estado: string; descripcion: string; publicada_at: string; retirada_at: string | null }
export type AdminMascotasResult = { data: AdminMascota[]; count: number; page: number; pageSize: number; error: Error | null; unauthorized: boolean }
const DEFAULT_PAGE_SIZE = 12
const MAX_PAGE_SIZE = 50
const positiveInteger = (value: number | undefined, fallback: number) => Number.isSafeInteger(value) && (value ?? 0) > 0 ? value! : fallback

export async function getAdminMascotas(supabase: SupabaseClient, usuarioId: string, filters: AdminMascotaFilters = {}): Promise<AdminMascotasResult> {
  const { isAdmin, error: authError } = await verificarEsAdmin(supabase, usuarioId)
  const page = positiveInteger(filters.page, 1)
  const pageSize = Math.min(positiveInteger(filters.pageSize, DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE)
  if (authError || !isAdmin) return { data: [], count: 0, page, pageSize, error: authError ?? new Error("No tienes permisos de administrador"), unauthorized: true }
  const servicio = createAdminClient()
  let query = servicio.from("mascotas_perdidas").select("id,tipo_animal,estado,descripcion,publicada_at,retirada_at", { count: "exact" })
  const search = filters.search?.trim().slice(0, 100)
  if (search) query = query.ilike("descripcion", `%${search.replace(/[\\%_]/g, "\\$&")}%`)
  if (["perdida", "encontrada"].includes(filters.estado ?? "")) query = query.eq("estado", filters.estado!)
  if (["perro", "gato", "otro"].includes(filters.tipo ?? "")) query = query.eq("tipo_animal", filters.tipo!)
  const { data, count, error } = await query.order("publicada_at", { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1).returns<AdminMascota[]>()
  return { data: data ?? [], count: count ?? 0, page, pageSize, error: error ? new Error(error.message) : null, unauthorized: false }
}

export async function getAdminMascotaFilters(supabase: SupabaseClient, usuarioId: string) {
  const { isAdmin, error } = await verificarEsAdmin(supabase, usuarioId)
  if (error || !isAdmin) return { estados: [], tipos: [], error: error ?? new Error("No autorizado") }
  return { estados: [{ id: "perdida", nombre: "Perdida" }, { id: "encontrada", nombre: "Encontrada" }], tipos: [{ id: "perro", nombre: "Perro" }, { id: "gato", nombre: "Gato" }, { id: "otro", nombre: "Otro" }], error: null }
}
