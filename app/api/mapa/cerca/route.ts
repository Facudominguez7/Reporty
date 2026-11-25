/**
 * POST /api/mapa/cerca: reportes y mascotas perdidas cerca de la persona (#297).
 *
 * La coordenada llega en el cuerpo (no en la URL, que queda en los logs), se redondea a 4
 * decimales y se usa para una sola consulta. No se guarda, no se escribe en los logs y la
 * respuesta no se cachea.
 */
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { buscarCercanos } from "@/database/queries/mapa/cercanos"
import {
  RADIO_CERCANOS_MAXIMO,
  RADIO_CERCANOS_MINIMO,
  dentroDePosadas,
  redondearCoordenada,
} from "@/lib/map/cercanos"

const SIN_CACHE = { "Cache-Control": "no-store" }

const esquemaPedido = z.object({
  lat: z.number().finite(),
  lon: z.number().finite(),
  radio: z.number().int().min(RADIO_CERCANOS_MINIMO).max(RADIO_CERCANOS_MAXIMO),
})

/** Respuesta de error, sin caché. */
function error(mensaje: string, status: number) {
  return NextResponse.json({ error: mensaje }, { status, headers: SIN_CACHE })
}

/**
 * Devuelve lo que hay cerca de la persona, ordenado por distancia.
 *
 * @param request - Pedido con `{ lat, lon, radio }` en el cuerpo JSON.
 * @returns `{ cercanos }`, o un error 400 si el punto está fuera de Posadas o el radio fuera de rango.
 */
export async function POST(request: NextRequest) {
  let cuerpo: unknown
  try {
    cuerpo = await request.json()
  } catch {
    return error("Parámetros inválidos", 400)
  }

  const pedido = esquemaPedido.safeParse(cuerpo)
  if (!pedido.success) return error("Parámetros inválidos", 400)

  const lat = redondearCoordenada(pedido.data.lat)
  const lon = redondearCoordenada(pedido.data.lon)
  if (!dentroDePosadas(lat, lon)) return error("La ubicación está fuera de Posadas", 400)

  // Los logs solo llevan el código y el mensaje del error: nunca la coordenada.
  try {
    const { data, error: errorConsulta } = await buscarCercanos({ lat, lon, radio: pedido.data.radio })
    if (errorConsulta) {
      console.error("Error al buscar cercanos:", { code: errorConsulta.code, message: errorConsulta.message })
      return error("No se pudo buscar lo que hay cerca", 500)
    }
    return NextResponse.json({ cercanos: data }, { headers: SIN_CACHE })
  } catch (excepcion) {
    console.error("Error en API /api/mapa/cerca:", excepcion instanceof Error ? excepcion.name : "desconocido")
    return error("Error interno del servidor", 500)
  }
}
