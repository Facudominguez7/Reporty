import type { SupabaseClient } from "@supabase/supabase-js"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { getComentariosReporte } from "./comentarios"
import { getReporteDetalle } from "./get-reporte-detalle"
import { getHistorialEstados } from "./historial-estados"

// The report row is read with the cookie-less public client, shared with the SEO metadata.
vi.mock("@/utils/supabase/public", () => ({ createPublicClient: () => clienteFalso() }))

vi.mock("./votos", () => ({
  getReporteVoteSummary: vi.fn().mockResolvedValue({ data: { total: 0 }, error: null }),
}))

/** Filas que devuelve cada tabla y registro de las tablas y `select` pedidos. */
const estado = vi.hoisted(() => ({
  filas: {} as Record<string, unknown>,
  tablas: [] as string[],
  selects: [] as string[],
}))

/**
 * Cliente de Supabase falso: anota cada tabla consultada y su `select`, y responde con las filas
 * cargadas para esa tabla, como si fuera la consulta de PostgREST.
 */
function clienteFalso() {
  return {
    from(tabla: string) {
      estado.tablas.push(tabla)
      const respuesta = { data: estado.filas[tabla] ?? null, error: null }
      const builder: Record<string, unknown> = {}
      for (const metodo of ["eq", "is", "in", "order", "returns"]) builder[metodo] = () => builder
      builder.select = (columnas: string) => {
        estado.selects.push(columnas)
        return builder
      }
      builder.single = async () => respuesta
      builder.maybeSingle = async () => respuesta
      builder.then = (resolver: (valor: unknown) => void) => resolver(respuesta)
      return builder
    },
  } as unknown as SupabaseClient
}

/** Cliente con sesión que no debe usarse para la fila del reporte: falla si se consulta. */
function clienteSinTablas() {
  return {
    from(tabla: string) {
      throw new Error(`la fila del reporte no debe leerse con el cliente de sesión (${tabla})`)
    },
  } as unknown as SupabaseClient
}

beforeEach(() => {
  estado.filas = {}
  estado.tablas = []
  estado.selects = []
})

describe("perfiles en la misma consulta del detalle", () => {
  it("trae el autor del reporte en la misma consulta, sin pedir public_profiles aparte", async () => {
    estado.filas.reportes = { id: 5, usuario_id: "u1", fotos_reporte: [], profiles: { username: "ana" } }

    const { data } = await getReporteDetalle(clienteSinTablas(), "5")

    expect(estado.tablas).toEqual(["reportes"])
    expect(estado.selects[0]).toContain("profiles:public_profiles!usuario_id(username)")
    expect(data?.profiles).toEqual({ username: "ana" })
  })

  it("deja el autor en null si no tiene perfil público", async () => {
    estado.filas.reportes = { id: 5, usuario_id: "u1", fotos_reporte: [], profiles: null }

    const { data } = await getReporteDetalle(clienteSinTablas(), "5")

    expect(data?.profiles).toBeNull()
  })

  it("trae el autor de cada comentario en la misma consulta, con «Usuario» si falta", async () => {
    estado.filas.comentarios_reporte = [
      { id: 1, usuario_id: "u1", contenido: "a", perfil: { username: "ana" } },
      { id: 2, usuario_id: "u2", contenido: "b", perfil: null },
    ]

    const { data } = await getComentariosReporte(clienteFalso(), "5")

    expect(estado.tablas).toEqual(["comentarios_reporte"])
    expect(estado.selects[0]).toContain("perfil:public_profiles!usuario_id(username)")
    expect(data).toEqual([
      { id: 1, usuario_id: "u1", contenido: "a", profiles: { username: "ana" } },
      { id: 2, usuario_id: "u2", contenido: "b", profiles: { username: "Usuario" } },
    ])
  })

  it("trae quién cambió cada estado en la misma consulta", async () => {
    estado.filas.historial_estados = [
      { id: 1, usuario_id: "u1", perfil: { username: "ana" } },
      { id: 2, usuario_id: "u2", perfil: null },
      { id: 3, usuario_id: null, perfil: null },
    ]

    const { data } = await getHistorialEstados(clienteFalso(), "5")

    expect(estado.tablas).toEqual(["historial_estados"])
    expect(estado.selects[0]).toContain("perfil:public_profiles!usuario_id(username)")
    expect(data).toEqual([
      { id: 1, usuario_id: "u1", usuario: { username: "ana" } },
      { id: 2, usuario_id: "u2", usuario: { username: null } },
      { id: 3, usuario_id: null, usuario: null },
    ])
  })
})
