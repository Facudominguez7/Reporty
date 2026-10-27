import type { SupabaseClient } from "@supabase/supabase-js"

import { verificarEsAdmin } from "./verificar-admin"

export type AdminReportFilters = {
  search?: string
  estado?: string
  categoria?: string
  page?: number
  pageSize?: number
}

export type AdminReport = {
  id: number
  titulo: string
  descripcion: string | null
  created_at: string
  estado_id: number
  categoria: { nombre: string } | null
  prioridad: { nombre: string } | null
  estado: { id: number; nombre: string } | null
  autor: { username: string | null } | null
}

export type AdminReportesResult = {
  data: AdminReport[]
  count: number
  page: number
  pageSize: number
  error: Error | null
  unauthorized: boolean
}

const DEFAULT_PAGE_SIZE = 12
const MAX_PAGE_SIZE = 50

function positiveInteger(value: number | undefined, fallback: number) {
  return Number.isSafeInteger(value) && (value ?? 0) > 0 ? value! : fallback
}

/** Lista reportes visibles para administración. La autorización se comprueba aquí también. */
export async function getAdminReportes(
  supabase: SupabaseClient,
  usuarioId: string,
  filters: AdminReportFilters = {},
): Promise<AdminReportesResult> {
  const { isAdmin, error: authError } = await verificarEsAdmin(supabase, usuarioId)
  if (authError || !isAdmin) {
    return {
      data: [],
      count: 0,
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
      error: authError ?? new Error("No tienes permisos de administrador"),
      unauthorized: true,
    }
  }

  const page = positiveInteger(filters.page, 1)
  const pageSize = Math.min(positiveInteger(filters.pageSize, DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE)
  const search = filters.search?.trim().slice(0, 100)

  let query = supabase
    .from("reportes")
    .select(
      `id, titulo, descripcion, created_at, estado_id,
       categoria:categorias!reportes_categoria_id_fkey(nombre),
       prioridad:prioridades!reportes_prioridad_id_fkey(nombre),
       estado:estados!reportes_estado_id_fkey(id, nombre),
       autor:profiles!reportes_usuario_id_fkey(username)`,
      { count: "exact" },
    )
    .is("deleted_at", null)

  if (search) query = query.or(`titulo.ilike.%${search}%,descripcion.ilike.%${search}%`)
  if (filters.estado && filters.estado !== "all") query = query.eq("estado_id", Number(filters.estado))
  if (filters.categoria && filters.categoria !== "all") query = query.eq("categoria_id", Number(filters.categoria))

  const { data, count, error } = await query
    .order("created_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1)
    .returns<AdminReport[]>()

  return {
    data: data ?? [],
    count: count ?? 0,
    page,
    pageSize,
    error: error ? new Error(error.message) : null,
    unauthorized: false,
  }
}

export async function getAdminReportFilters(supabase: SupabaseClient, usuarioId: string) {
  const { isAdmin, error } = await verificarEsAdmin(supabase, usuarioId)
  if (error || !isAdmin) return { categorias: [], estados: [], error: error ?? new Error("No autorizado") }

  const [{ data: categorias, error: categoriasError }, { data: estados, error: estadosError }] = await Promise.all([
    supabase.from("categorias").select("id, nombre").order("nombre"),
    supabase.from("estados").select("id, nombre").order("id"),
  ])

  return {
    categorias: categorias ?? [],
    estados: estados ?? [],
    error: categoriasError ?? estadosError ?? null,
  }
}
