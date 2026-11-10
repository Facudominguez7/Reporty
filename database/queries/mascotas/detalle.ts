import { createPublicClient } from "@/utils/supabase/public"

/** Ficha pública de una mascota. `address` es la calle guardada al publicarla, si se encontró. */
export type MascotaDetail = { id: number; species: string; description: string; status: "Perdida" | "Encontrada"; createdAt: string; phone: string; image: string; coordinates?: [number, number]; address?: string }
type Row = { id?: number; tipo_animal?: string; estado?: string; descripcion?: string|null; telefono?: string; publicada_at?: string; lat?: number | null; lon?: number | null; direccion?: string | null }
const COLUMNAS = "id,tipo_animal,estado,descripcion,lat,lon,telefono,publicada_at"
/** Convierte la fila pública en la ficha; `null` si le falta un dato obligatorio. */
export function mapPetDetail(row: Row, image = ""): MascotaDetail | null {
  if (!Number.isSafeInteger(row?.id) || row.id! <= 0 || !["perro", "gato", "otro"].includes(row.tipo_animal ?? "") || !["perdida", "encontrada"].includes(row.estado ?? "") || !row.descripcion?.trim() || !row.telefono?.trim() || !row.publicada_at) return null
  return { id: row.id!, species: row.tipo_animal === "otro" ? "Otro animal" : row.tipo_animal![0].toUpperCase() + row.tipo_animal!.slice(1), description: row.descripcion.trim(), status: row.estado === "perdida" ? "Perdida" : "Encontrada", createdAt: row.publicada_at, phone: row.telefono.trim(), image, ...(typeof row.lat === "number" && Number.isFinite(row.lat) && typeof row.lon === "number" && Number.isFinite(row.lon) ? { coordinates: [row.lat, row.lon] as [number, number] } : {}), ...(row.direccion?.trim() ? { address: row.direccion.trim() } : {}) }
}
/**
 * Lee la ficha pública de una mascota. Si la columna `direccion` todavía no existe
 * (migración sin aplicar, error 42703) vuelve a leer sin ella, para que la ficha no
 * se caiga por un dato complementario.
 */
export async function getMascotaDetalle(id: number) {
  if (!Number.isSafeInteger(id) || id <= 0) return { data: null, error: null }
  const supabase = createPublicClient()
  const leer = (columnas: string) => supabase.from("mascotas_perdidas_publicas").select(columnas).eq("id", id).maybeSingle<Row>()
  let { data, error } = await leer(`${COLUMNAS},direccion`)
  if (error?.code === "42703") ({ data, error } = await leer(COLUMNAS))
  return { data: data ? mapPetDetail(data, `/api/mascotas/${id}/foto`) : null, error }
}
