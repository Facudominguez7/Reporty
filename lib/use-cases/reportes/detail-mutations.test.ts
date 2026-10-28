import { beforeEach, describe, expect, it, vi } from "vitest"

import { APORTES_COMUNITARIOS, mergeReportActivity, parseAporteKey } from "@/lib/reportes/aportes"
import { applyReportStateChange, crearComentarioWorkflow } from "@/lib/use-cases/reportes/detail-mutations"

const mocks = vi.hoisted(() => ({ sumarPuntos: vi.fn() }))
vi.mock("server-only", () => ({}))
vi.mock("@/database/queries/puntos", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/database/queries/puntos")>()),
  sumarPuntos: mocks.sumarPuntos,
}))

beforeEach(() => {
  mocks.sumarPuntos.mockReset().mockResolvedValue({ success: true, error: null })
})

describe("report status transition concurrency", () => {
  it("does not overwrite an admin status change made after the workflow read the report", async () => {
    let currentState = 3
    const updateFilters: Array<[string, unknown]> = []
    const historyInsert = vi.fn().mockResolvedValue({ error: null })
    const updateQuery = {
      eq: (column: string, value: unknown) => { updateFilters.push([column, value]); return updateQuery },
      is: () => updateQuery,
      neq: () => updateQuery,
      select: () => updateQuery,
      maybeSingle: async () => {
        const hasExpectedState = updateFilters.some(([column, value]) => column === "estado_id" && value === 1)
        if (currentState !== 1 && !hasExpectedState) {
          currentState = 2
          return { data: { id: 4 }, error: null }
        }
        return { data: null, error: null }
      },
    }
    const supabase = {
      from: (table: string) => table === "reportes"
        ? {
            update: () => updateQuery,
            select: () => ({ eq: () => ({ single: async () => ({ data: {
              id: 4,
              usuario_id: "owner",
              titulo: "Reporte",
              estado_id: currentState,
              deleted_at: null,
              reparacion_reportada_at: null,
              ownerProfile: null,
            }, error: null }) }) }),
          }
        : { insert: historyInsert },
    } as never

    const result = await applyReportStateChange(supabase, {
      id: 4,
      usuario_id: "owner",
      titulo: "Reporte",
      estado_id: 1,
      deleted_at: null,
      reparacion_reportada_at: null,
      ownerProfile: null,
    }, 2, "voter")

    expect(result).toMatchObject({ success: false, error: expect.stringContaining("cambió") })
    expect(updateFilters).toContainEqual(["estado_id", 1])
    expect(currentState).toBe(3)
    expect(historyInsert).not.toHaveBeenCalled()
    expect(mocks.sumarPuntos).not.toHaveBeenCalled()
  })
})

describe("report activity contributions", () => {
  it("accepts only the seven predefined contribution keys", () => {
    expect(APORTES_COMUNITARIOS).toHaveLength(7)
    expect(parseAporteKey("problema_sigue_igual")).toBe("problema_sigue_igual")
    expect(parseAporteKey("texto libre")).toBeNull()
    expect(parseAporteKey("")).toBeNull()
  })

  it("stores a predefined update and awards existing points only after a successful insert", async () => {
    const insertContribution = vi.fn()
    const savedComment = {
      id: 12,
      reporte_id: 4,
      usuario_id: "user-1",
      contenido: "El problema sigue igual",
      tipo_aporte: "problema_sigue_igual",
      created_at: "2026-01-01T12:00:00Z",
      profiles: { username: "Vecina" },
    }
    const supabase = {
      from: (table: string) => table === "reportes"
        ? { select: () => ({ eq: () => ({ single: async () => ({ data: { id: 4, usuario_id: "owner", titulo: "Reporte", estado_id: 1, deleted_at: null, ownerProfile: null }, error: null }) }) }) }
        : { insert: (values: unknown) => { insertContribution(values); return { select: () => ({ single: async () => ({ data: savedComment, error: null }) }) } } },
    } as never

    const result = await crearComentarioWorkflow(supabase, 4, "user-1", "problema_sigue_igual")

    expect(result).toMatchObject({ success: true, data: { pointsAwarded: 2, comment: savedComment } })
    expect(insertContribution).toHaveBeenCalledWith({
      reporte_id: 4,
      usuario_id: "user-1",
      contenido: "El problema sigue igual",
      tipo_aporte: "problema_sigue_igual",
    })
    expect(mocks.sumarPuntos).toHaveBeenCalledTimes(1)
    expect(mocks.sumarPuntos).toHaveBeenCalledWith(supabase, "user-1", 2, "Comentar en reporte ajeno")
  })

  it("allows repeated active contributions and awards points for each", async () => {
    let commentId = 12
    const supabase = {
      from: (table: string) => table === "reportes"
        ? { select: () => ({ eq: () => ({ single: async () => ({ data: { id: 4, usuario_id: "owner", titulo: "Reporte", estado_id: 1, deleted_at: null, ownerProfile: null }, error: null }) }) }) }
        : { insert: () => ({ select: () => ({ single: async () => ({ data: { id: commentId++, reporte_id: 4, usuario_id: "user-1", contenido: "El problema sigue igual", tipo_aporte: "problema_sigue_igual", created_at: "2026-01-01T12:00:00Z", profiles: { username: "Vecina" } }, error: null }) }) }) },
    } as never

    const first = await crearComentarioWorkflow(supabase, 4, "user-1", "problema_sigue_igual")
    const second = await crearComentarioWorkflow(supabase, 4, "user-1", "problema_sigue_igual")

    expect(first.success).toBe(true)
    expect(second.success).toBe(true)
    expect(mocks.sumarPuntos).toHaveBeenCalledTimes(2)
    expect(mocks.sumarPuntos).toHaveBeenNthCalledWith(1, supabase, "user-1", 2, "Comentar en reporte ajeno")
    expect(mocks.sumarPuntos).toHaveBeenNthCalledWith(2, supabase, "user-1", 2, "Comentar en reporte ajeno")
  })

  it("merges contributions and status history chronologically without rewriting legacy text", () => {
    const activity = mergeReportActivity(
      [
        { id: 1, reporte_id: 4, usuario_id: "u1", contenido: "Texto histórico libre", tipo_aporte: null, created_at: "2026-01-03T12:00:00Z", profiles: { username: "Ana" } },
        { id: 2, reporte_id: 4, usuario_id: "u2", contenido: "El problema mejoró, pero continúa", tipo_aporte: "problema_mejoro_continua", created_at: "2026-01-01T12:00:00Z", profiles: { username: "Sol" } },
      ],
      [{ id: 9, reporte_id: 4, estado_nuevo_id: 2, created_at: "2026-01-02T12:00:00Z", comentario: "Por votación", estado_nuevo: { id: 2, nombre: "Reparado" }, usuario: null }],
    )

    expect(activity.map((entry) => entry.kind)).toEqual(["contribution", "status", "contribution"])
    expect(activity[1]).toMatchObject({ content: "El reporte cambió a Reparado", detail: "Por votación" })
    expect(activity[2]).toMatchObject({ content: "Texto histórico libre", legacy: true })
  })
})
