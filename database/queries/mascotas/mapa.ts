import { createPublicClient } from "@/utils/supabase/public"

export type MascotaMapa = {
  id: number
  species: string
  description: string
  status: "Perdida" | "Encontrada"
  createdAt: string
  phone: string
  image: string
  coordinates: [number, number]
}

type MascotaMapRow = {
  id?: number; tipo_animal?: string; estado?: string; descripcion?: string | null
  lat?: number; lon?: number; telefono?: string; publicada_at?: string
}

export function mapPetForMap(row: MascotaMapRow, image = ""): MascotaMapa | null {
  if (!Number.isInteger(row?.id) || !["perro", "gato", "otro"].includes(row.tipo_animal ?? "") ||
      !["perdida", "encontrada"].includes(row.estado ?? "") || !row.descripcion?.trim() ||
      !Number.isFinite(row.lat) || !Number.isFinite(row.lon) || !row.telefono?.trim() || !row.publicada_at) return null
  const species = row.tipo_animal === "otro" ? "Otro animal" : row.tipo_animal![0].toUpperCase() + row.tipo_animal!.slice(1)
  return { id: row.id!, species, description: row.descripcion.trim(), status: row.estado === "perdida" ? "Perdida" : "Encontrada",
    createdAt: row.publicada_at, phone: row.telefono.trim(), image, coordinates: [row.lat!, row.lon!] }
}

export async function getMascotasMapa() {
  const supabase = createPublicClient()
  const { data, error } = await supabase.from("mascotas_perdidas_publicas")
    .select("id,tipo_animal,estado,descripcion,lat,lon,telefono,publicada_at")
    .order("publicada_at", { ascending: false })
  return { data: (data ?? []).map((row) => mapPetForMap(row, `/api/mascotas/${row.id}/foto`))
    .filter((pet): pet is MascotaMapa => pet !== null), error }
}
