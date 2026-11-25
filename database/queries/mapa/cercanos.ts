/**
 * Reportes y mascotas perdidas cerca de la persona (#297), con la función `cerca_de` de PostGIS.
 *
 * Lee sin sesión: lo que se ve cerca es público y lo decide la RLS. La función se llama por POST
 * para que la coordenada viaje en el cuerpo y no en la URL, que queda en los logs de Supabase.
 */
import "server-only"

import { ESTADOS_MAPA } from "@/lib/map/zona"
import type { ElementoCercano } from "@/lib/map/cercanos"
import { createPublicClient } from "@/utils/supabase/public"

/** Fila tal como la devuelve `cerca_de`. */
type FilaCercana = { tipo: string; id: number; titulo: string | null; metros: number }

/** Error de la consulta, sin los parámetros del pedido. */
export type ErrorCercanos = { code?: string; message: string }

/**
 * Busca lo que hay cerca de un punto, ordenado por distancia.
 *
 * @param parametros.lat - Latitud ya redondeada y dentro de Posadas.
 * @param parametros.lon - Longitud ya redondeada y dentro de Posadas.
 * @param parametros.radio - Radio en metros, de 100 a 2000.
 * @returns Los elementos cercanos, o el error de la consulta.
 */
export async function buscarCercanos({
  lat,
  lon,
  radio,
}: {
  lat: number
  lon: number
  radio: number
}): Promise<{ data: ElementoCercano[]; error: ErrorCercanos | null }> {
  const { data, error } = await createPublicClient().rpc("cerca_de", {
    lat,
    lon,
    radio_m: radio,
    estados: [...ESTADOS_MAPA],
  })
  if (error) return { data: [], error }

  const elementos = ((data ?? []) as FilaCercana[])
    .filter((fila): fila is FilaCercana & { tipo: ElementoCercano["tipo"] } => fila.tipo === "reporte" || fila.tipo === "mascota")
    .map((fila) => ({ tipo: fila.tipo, id: Number(fila.id), titulo: fila.titulo ?? "", metros: Number(fila.metros) }))
  return { data: elementos, error: null }
}
