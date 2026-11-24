import type { SupabaseClient } from "@supabase/supabase-js"
import { describe, expect, it } from "vitest"

import { getReporteVoteSummary } from "./votos"

/**
 * Cliente de Supabase falso: anota cada tabla consultada y responde según la tabla, como
 * PostgREST, con el resumen de votos o con la presencia del voto propio.
 */
function clienteFalso(tablas: string[], votosPropios: string[] = []) {
  return {
    from(tabla: string) {
      tablas.push(tabla)
      const builder: Record<string, unknown> = {}
      builder.select = () => builder
      builder.eq = () => builder
      builder.maybeSingle = async () =>
        tabla === "reportes_vote_summary"
          ? { data: { reporte_id: 5, votos_no_existe_count: 2, votos_reparado_count: 3 }, error: null }
          : { data: votosPropios.includes(tabla) ? { id: 1 } : null, error: null }
      return builder
    },
  } as unknown as SupabaseClient
}

describe("getReporteVoteSummary", () => {
  it("pide el conteo de votos sin esperar a conocer al usuario", async () => {
    const tablas: string[] = []
    let resolverUsuario: (id: string | null) => void = () => {}
    const usuarioId = new Promise<string | null>((resolver) => { resolverUsuario = resolver })

    const resumen = getReporteVoteSummary(clienteFalso(tablas, ["votos_reparado"]), "5", usuarioId)
    await new Promise((resolver) => setTimeout(resolver, 0))

    expect(tablas).toEqual(["reportes_vote_summary"])

    resolverUsuario("user-1")
    const { data } = await resumen

    expect(tablas).toEqual(["reportes_vote_summary", "votos_no_existe", "votos_reparado"])
    expect(data).toEqual({
      noExiste: { count: 2, hasVoted: false },
      reparado: { count: 3, hasVoted: true },
    })
  })

  it("sin usuario solo pide el conteo", async () => {
    const tablas: string[] = []

    const { data } = await getReporteVoteSummary(clienteFalso(tablas), "5", Promise.resolve(null))

    expect(tablas).toEqual(["reportes_vote_summary"])
    expect(data).toEqual({
      noExiste: { count: 2, hasVoted: false },
      reparado: { count: 3, hasVoted: false },
    })
  })

  it("con un id ya conocido sigue marcando los votos propios", async () => {
    const tablas: string[] = []

    const { data } = await getReporteVoteSummary(clienteFalso(tablas, ["votos_no_existe"]), "5", "user-1")

    expect(data?.noExiste.hasVoted).toBe(true)
    expect(data?.reparado.hasVoted).toBe(false)
  })
})
