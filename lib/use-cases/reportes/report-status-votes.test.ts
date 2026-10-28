import { beforeEach, describe, expect, it, vi } from "vitest"

const effects = vi.hoisted(() => ({
  sumarPuntos: vi.fn(),
  actualizarPuntos: vi.fn(),
  updateReport: vi.fn(),
}))

vi.mock("server-only", () => ({}))
vi.mock("@/database/queries/puntos", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/database/queries/puntos")>()),
  sumarPuntos: effects.sumarPuntos,
  actualizarPuntos: effects.actualizarPuntos,
}))

import { marcarReporteReparadoWorkflow, votarNoExisteWorkflow, votarReparadoWorkflow } from "@/lib/use-cases/reportes/detail-mutations"

function reportClient({ voteCount, ownerId = "report-owner" }: { voteCount: number; ownerId?: string }) {
  const report = { id: 9, usuario_id: ownerId, titulo: "Bache", estado_id: 1, deleted_at: null, ownerProfile: null }
  return {
    from(table: string) {
      if (table === "reportes") {
        const query = {
          eq: () => query,
          is: () => query,
          neq: () => query,
          select: () => query,
          single: async () => ({ data: report, error: null }),
          maybeSingle: async () => ({ data: { id: 9 }, error: null }),
        }
        return {
          select: () => query,
          update: (...args: unknown[]) => { effects.updateReport(...args); return query },
        }
      }
      if (table === "votos_no_existe" || table === "votos_reparado") {
        return {
          insert: async () => ({ error: null }),
          select: () => ({ eq: async () => ({ count: voteCount, error: null }) }),
        }
      }
      if (table === "historial_estados") return { insert: async () => ({ error: null }) }
      throw new Error(`Unexpected table ${table}`)
    },
  } as never
}

beforeEach(() => {
  vi.clearAllMocks()
  effects.sumarPuntos.mockResolvedValue({ success: true, error: null })
  effects.actualizarPuntos.mockResolvedValue({ success: true, error: null })
})

describe("community report status votes", () => {
  it("routes five 'No existe' votes to admin review without rejecting the report", async () => {
    const result = await votarNoExisteWorkflow(reportClient({ voteCount: 5 }), 9, "voter")

    expect(result).toMatchObject({ success: true, data: { count: 5, stateChangedTo: null, needsAdminReview: true } })
    expect(effects.updateReport).not.toHaveBeenCalled()
  })

  it("does not send four 'No existe' votes to admin review", async () => {
    const result = await votarNoExisteWorkflow(reportClient({ voteCount: 4 }), 9, "voter")

    expect(result).toMatchObject({ success: true, data: { count: 4, stateChangedTo: null, needsAdminReview: false } })
    expect(effects.updateReport).not.toHaveBeenCalled()
  })

  it("does not change report state before five repaired votes", async () => {
    const result = await votarReparadoWorkflow(reportClient({ voteCount: 4 }), 9, "voter")

    expect(result).toMatchObject({ success: true, data: { count: 4, stateChangedTo: null } })
    expect(effects.updateReport).not.toHaveBeenCalled()
  })

  it("marks the report repaired at five community votes", async () => {
    const result = await votarReparadoWorkflow(reportClient({ voteCount: 5 }), 9, "voter")

    expect(result).toMatchObject({ success: true, data: { count: 5, stateChangedTo: 2 } })
    expect(effects.updateReport).toHaveBeenCalledWith({ estado_id: 2 })
  })

  it("allows the report author to flag a repair without changing the final status", async () => {
    const client = reportClient({ voteCount: 0 })
    const result = await marcarReporteReparadoWorkflow(client, 9, "report-owner")

    expect(result).toMatchObject({ success: true, data: { reported: true } })
    expect(effects.updateReport).toHaveBeenCalledWith({ reparacion_reportada_at: expect.any(String) })
  })

  it("prevents a non-author from submitting the creator-only resolution signal", async () => {
    const result = await marcarReporteReparadoWorkflow(reportClient({ voteCount: 0 }), 9, "voter")

    expect(result).toMatchObject({ success: false })
    expect(effects.updateReport).not.toHaveBeenCalled()
  })

  it("prevents the report author from voting to close their own report as repaired", async () => {
    const result = await votarReparadoWorkflow(reportClient({ voteCount: 5 }), 9, "report-owner")

    expect(result).toMatchObject({ success: false, error: "No podés votar que tu propio reporte está reparado." })
    expect(effects.sumarPuntos).not.toHaveBeenCalled()
    expect(effects.updateReport).not.toHaveBeenCalled()
  })
})
