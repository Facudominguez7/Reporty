import { NextRequest, NextResponse } from "next/server"

import { listarDonaciones } from "@/database/queries/admin/donaciones"
import { donacionesACsv, leerFiltros, mesActual } from "@/lib/donaciones/panel"

export const dynamic = "force-dynamic"

/**
 * Descarga las donaciones filtradas como CSV. Solo para administradores.
 */
export async function GET(request: NextRequest) {
  const parametros = request.nextUrl.searchParams
  const filtros = leerFiltros({ estado: parametros.get("estado") ?? undefined, mes: parametros.get("mes") ?? undefined })
  const listado = await listarDonaciones(filtros)
  if (!listado.autorizado) return NextResponse.json({ error: "No autorizado" }, { status: 403 })

  const nombre = `donaciones-${filtros.mes ?? mesActual()}${filtros.estado ? `-${filtros.estado}` : ""}.csv`
  return new NextResponse(donacionesACsv(listado.donaciones), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nombre}"`,
      "Cache-Control": "no-store",
    },
  })
}
