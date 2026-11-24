/**
 * GET /api/mapa/reportes: lo que el mapa muestra en la zona visible (#281).
 *
 * Público y cacheable: la respuesta es igual para todos los visitantes (se lee sin sesión,
 * con la misma RLS) y la zona se redondea a la grilla de teselas, así vistas casi iguales
 * comparten la misma URL. Los estados los fija el servidor: nunca devuelve rechazados.
 */
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { cargarZonaMapa } from "@/database/queries/reportes/mapa-por-zona"
import { MAP_MAX_ZOOM, POSADAS_MIN_ZOOM } from "@/lib/map/initial-view"
import { ajustarZonaAlMapa, leerZona } from "@/lib/map/zona"

const CACHE_PUBLICA = "public, s-maxage=30, stale-while-revalidate=60"

const filtroOpcional = z.string().trim().max(100).optional()

const esquemaPedido = z.object({
  zona: z.string(),
  zoom: z.coerce.number().int().min(POSADAS_MIN_ZOOM).max(MAP_MAX_ZOOM),
  search: filtroOpcional,
  categoria: filtroOpcional,
  estado: filtroOpcional,
  prioridad: filtroOpcional,
})

/** Respuesta de error que nunca se cachea. */
function error(mensaje: string, status: number) {
  return NextResponse.json({ error: mensaje }, { status, headers: { "Cache-Control": "no-store" } })
}

/**
 * Devuelve los reportes de la zona como puntos, o como grupos por celda si hay más de 300.
 *
 * @param request - Pedido con `zona=oeste,sur,este,norte`, `zoom` y los filtros del mapa.
 * @returns `{ tipo: "puntos", reportes }` o `{ tipo: "grupos", grupos }`.
 */
export async function GET(request: NextRequest) {
  const pedido = esquemaPedido.safeParse(Object.fromEntries(request.nextUrl.searchParams))
  if (!pedido.success) return error("Parámetros inválidos", 400)

  const { zona: textoZona, zoom, search, categoria, estado, prioridad } = pedido.data
  const zonaPedida = leerZona(textoZona)
  const zona = zonaPedida ? ajustarZonaAlMapa(zonaPedida, zoom) : null
  if (!zona) return error("Zona inválida", 400)

  try {
    const { data, error: errorConsulta } = await cargarZonaMapa({
      zona,
      zoom,
      filtros: { search, categoria, estado, prioridad },
    })
    if (errorConsulta) {
      console.error("Error al cargar el mapa por zona:", errorConsulta)
      return error("No se pudieron cargar los reportes", 500)
    }
    return NextResponse.json(data, { headers: { "Cache-Control": CACHE_PUBLICA } })
  } catch (excepcion) {
    console.error("Error en API /api/mapa/reportes:", excepcion)
    return error("Error interno del servidor", 500)
  }
}
