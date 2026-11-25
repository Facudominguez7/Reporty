/**
 * Barrio de los reportes (#299), con la función `barrios_de_reportes` de PostGIS.
 *
 * El barrio no se guarda en `reportes`: la base lo calcula con los límites importados de la IDE
 * de Posadas. La función es security invoker, así que solo devuelve los reportes que el cliente
 * recibido puede ver por RLS.
 */
import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

/** Fila tal como la devuelve `barrios_de_reportes`. */
type FilaBarrio = { reporte_id: number; barrio: string | null }

/**
 * Busca el barrio de varios reportes en una sola consulta (hasta 100).
 *
 * El barrio es un dato de apoyo: si la consulta falla o lanza (por ejemplo, sin red), se registra el error y se devuelve un mapa
 * vacío, así la ficha o el panel se muestran igual, sin barrio.
 *
 * @param supabase - Cliente con el que se lee (público para la ficha, con sesión en Defensoría).
 * @param ids - IDs de los reportes.
 * @returns Barrio de cada reporte visible, `null` si cae fuera de todos los barrios.
 */
export async function getBarriosDeReportes(supabase: SupabaseClient, ids: number[]): Promise<Map<number, string | null>> {
  const barrios = new Map<number, string | null>()
  if (ids.length === 0) return barrios

  let respuesta: { data: unknown; error: unknown }
  try {
    respuesta = await supabase.rpc("barrios_de_reportes", { ids })
  } catch (error) {
    respuesta = { data: null, error }
  }
  const { data, error } = respuesta
  if (error) {
    console.error("Error al obtener el barrio de los reportes:", error)
    return barrios
  }

  for (const fila of (data ?? []) as FilaBarrio[]) {
    barrios.set(Number(fila.reporte_id), fila.barrio ?? null)
  }
  return barrios
}
