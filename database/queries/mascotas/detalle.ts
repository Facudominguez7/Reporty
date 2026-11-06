import { createPublicClient } from "@/utils/supabase/public"

export type MascotaDetail = { id: number; species: string; description: string; status: "Perdida" | "Encontrada"; createdAt: string; phone: string; image: string; coordinates?: [number, number] }
type Row = { id?: number; tipo_animal?: string; estado?: string; descripcion?: string|null; telefono?: string; publicada_at?: string; lat?: number | null; lon?: number | null }
export function mapPetDetail(row: Row, image = ""): MascotaDetail | null {
  if (!Number.isSafeInteger(row?.id) || row.id! <= 0 || !["perro", "gato", "otro"].includes(row.tipo_animal ?? "") || !["perdida", "encontrada"].includes(row.estado ?? "") || !row.descripcion?.trim() || !row.telefono?.trim() || !row.publicada_at) return null
  return { id: row.id!, species: row.tipo_animal === "otro" ? "Otro animal" : row.tipo_animal![0].toUpperCase() + row.tipo_animal!.slice(1), description: row.descripcion.trim(), status: row.estado === "perdida" ? "Perdida" : "Encontrada", createdAt: row.publicada_at, phone: row.telefono.trim(), image, ...(typeof row.lat === "number" && Number.isFinite(row.lat) && typeof row.lon === "number" && Number.isFinite(row.lon) ? { coordinates: [row.lat, row.lon] as [number, number] } : {}) }
}
export async function getMascotaDetalle(id: number) {
  if (!Number.isSafeInteger(id) || id <= 0) return { data: null, error: null }
  const supabase = createPublicClient()
  const { data, error } = await supabase.from("mascotas_perdidas_publicas").select("id,tipo_animal,estado,descripcion,lat,lon,telefono,publicada_at").eq("id", id).maybeSingle()
  return { data: data ? mapPetDetail(data, `/api/mascotas/${id}/foto`) : null, error }
}
