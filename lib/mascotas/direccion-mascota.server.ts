import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"

import { obtenerDireccion } from "@/lib/geocodificacion/direccion-inversa"

/**
 * Busca la calle de una mascota publicada y la guarda en `mascotas_perdidas.direccion`.
 *
 * Se llama al publicar la mascota y cuando un administrador corrige su ubicación.
 * Es un complemento: nunca lanza, así una falla de Nominatim o de la base no frena
 * la publicación; la ficha muestra el mapa sin la calle.
 *
 * @param servicio - Cliente con service role (sólo él puede escribir la columna).
 * @param mascotaId - Id de la publicación.
 * @param lat - Latitud de la mascota.
 * @param lon - Longitud de la mascota.
 * @param buscar - Geocodificación inversa (inyectable para pruebas).
 * @returns La dirección guardada, o `null` si no se encontró o no se pudo guardar.
 */
export async function guardarDireccionMascota(
  servicio: SupabaseClient,
  mascotaId: number,
  lat: number,
  lon: number,
  buscar: (lat: number, lon: number) => Promise<string | null> = obtenerDireccion,
): Promise<string | null> {
  try {
    const direccion = await buscar(lat, lon)
    if (!direccion) return null
    const { error } = await servicio.from("mascotas_perdidas").update({ direccion }).eq("id", mascotaId)
    return error ? null : direccion
  } catch {
    return null
  }
}
