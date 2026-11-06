import { NextRequest, NextResponse } from "next/server"
import { getMascotasListado } from "@/database/queries/mascotas/listado"

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams
    const parse = (key: string, fallback: number) => {
      const value = Number.parseInt(params.get(key) ?? "", 10)
      return Number.isFinite(value) && value >= 0 ? value : fallback
    }
    const { data, error, hasMore } = await getMascotasListado({
      tipo: params.get("tipo") ?? undefined,
      estado: params.get("estadoMascota") ?? undefined,
      search: params.get("searchMascota") ?? undefined,
      offset: parse("offset", 0), limite: parse("limite", 12),
    })
    if (error) return NextResponse.json({ error: "Error al obtener mascotas" }, { status: 500 })
    return NextResponse.json({ data, hasMore })
  } catch (error) {
    console.error("Error en API /api/mascotas:", error)
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}
