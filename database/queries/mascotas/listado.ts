import { createPublicClient } from "@/utils/supabase/public"

export type MascotaLista = {
  id: number
  title: string
  description: string
  type: string
  status: "Perdida" | "Encontrada"
  createdAt: string
  image: string
}

type MascotaRow = {
  id?: number
  tipo_animal?: string
  estado?: string
  descripcion?: string | null
  foto_path?: string
  publicada_at?: string
  moderacion_estado?: string
  retirada_at?: string | null
}

export function mapPetForListing(row: MascotaRow, image = ""): MascotaLista | null {
  if (!row || (row.moderacion_estado !== undefined && row.moderacion_estado !== "aprobada") ||
      (row.retirada_at !== undefined && row.retirada_at !== null) || !Number.isInteger(row.id) || !row.tipo_animal || !row.descripcion?.trim() ||
      !row.foto_path || !row.publicada_at || !["perro", "gato", "otro"].includes(row.tipo_animal) ||
      !["perdida", "encontrada"].includes(row.estado ?? "")) return null
  const type = row.tipo_animal === "otro" ? "Otro animal" : row.tipo_animal[0].toUpperCase() + row.tipo_animal.slice(1)
  const status = row.estado === "perdida" ? "Perdida" : "Encontrada"
  const stateWord = row.estado === "perdida" ? "perdido" : "encontrado"
  return {
    id: row.id!, title: `${type} ${stateWord}`, description: row.descripcion.trim(), type,
    status, createdAt: row.publicada_at,
    image,
  }
}

export async function getMascotasListado(filters: { tipo?: string; estado?: string; search?: string; limite?: number; offset?: number } = {}) {
  const limite = Math.min(Math.max(filters.limite ?? 12, 1), 50)
  const offset = Math.max(filters.offset ?? 0, 0)
  const supabase = createPublicClient()
  let query = supabase.from("mascotas_perdidas")
    .select("id,tipo_animal,estado,descripcion,foto_path,publicada_at")
  if (["perro", "gato", "otro"].includes(filters.tipo ?? "")) query = query.eq("tipo_animal", filters.tipo!)
  if (["perdida", "encontrada"].includes(filters.estado ?? "")) query = query.eq("estado", filters.estado!)
  const search = filters.search?.trim().slice(0, 100)
  if (search) query = query.ilike("descripcion", `%${search.replace(/[\\%_]/g, "\\$&")}%`)
  const { data, error } = await query.order("publicada_at", { ascending: false }).range(offset, offset + limite)
  const rows = data ?? []
  const hasMore = rows.length > limite
  return { data: rows.slice(0, limite).map((row) => mapPetForListing(
    row,
    supabase.storage.from("reportes").getPublicUrl(row.foto_path).data.publicUrl,
  )).filter((pet): pet is MascotaLista => pet !== null), hasMore, error }
}
