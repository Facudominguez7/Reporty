import { beforeEach, describe, expect, it, vi } from "vitest"

import { APORTES_COMUNITARIOS, mergeReportActivity, parseAporteKey } from "@/lib/reportes/aportes"
import { actualizarDatosReporteAdminWorkflow, applyReportStateChange, crearComentarioWorkflow, quitarFotoReporteAdminWorkflow, reemplazarFotoReporteAdminWorkflow } from "@/lib/use-cases/reportes/detail-mutations"

const mocks = vi.hoisted(() => ({
  sumarPuntos: vi.fn(), getUserRoleContext: vi.fn(), isAdminRole: vi.fn(),
  reemplazarFoto: vi.fn(), quitarFoto: vi.fn(), validarImagen: vi.fn(),
}))
vi.mock("server-only", () => ({}))
vi.mock("@/lib/moderation/imagenes-reporte.server", () => ({
  moderarYGuardarImagenReporte: mocks.reemplazarFoto,
  eliminarFotoReportePublicada: mocks.quitarFoto,
}))
vi.mock("@/lib/media/report-image-validation.server", () => ({ validateUploadedReportImage: mocks.validarImagen }))
vi.mock("@/lib/authz/roles", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/authz/roles")>()),
  getUserRoleContext: mocks.getUserRoleContext,
  isAdminRole: mocks.isAdminRole,
}))
vi.mock("@/database/queries/puntos", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/database/queries/puntos")>()),
  sumarPuntos: mocks.sumarPuntos,
}))

beforeEach(() => {
  mocks.sumarPuntos.mockReset().mockResolvedValue({ success: true, error: null })
  mocks.getUserRoleContext.mockReset().mockResolvedValue({ data: { roleId: 2 }, error: null })
  mocks.isAdminRole.mockReset().mockReturnValue(true)
  mocks.reemplazarFoto.mockReset().mockResolvedValue({ estado: "REVIEW", publicada: false, motivos: [], advertencias: [] })
  mocks.quitarFoto.mockReset().mockResolvedValue({ success: true, cleanupPending: false })
  mocks.validarImagen.mockReset().mockResolvedValue(undefined)
})

describe("admin report edits", () => {
  it("updates only editable report fields after verifying admin access", async () => {
    const update = vi.fn()
    const updateQuery = {
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: 4 }, error: null }),
    }
    const reportQuery = {
      eq: () => ({ single: async () => ({ data: { id: 4, usuario_id: "owner", titulo: "Old", estado_id: 1, lat: -34.6, lon: -58.4, deleted_at: null, ownerProfile: null }, error: null }) }),
    }
    const supabase = {
      from: (table: string) => table === "reportes" ? {
        select: () => reportQuery,
        update: (values: unknown) => { update(values); return updateQuery },
      } : {},
    } as never

    const input = { titulo: "New title", descripcion: "Valid description", categoriaId: 3, prioridadId: 2, lat: -34.6, lon: -58.4 }
    const result = await actualizarDatosReporteAdminWorkflow(supabase, 4, "admin", input)

    expect(result).toEqual({ success: true, data: true })
    expect(mocks.getUserRoleContext).toHaveBeenCalledWith(supabase, "admin")
    expect(update).toHaveBeenCalledWith({ titulo: "New title", descripcion: "Valid description", categoria_id: 3, prioridad_id: 2, lat: -34.6, lon: -58.4 })
    expect(updateQuery.eq).toHaveBeenCalledWith("id", 4)
    expect(updateQuery.is).toHaveBeenCalledWith("deleted_at", null)
  })

  it("rejects changed coordinates outside the service area", async () => {
    const reportQuery = { eq: () => ({ single: async () => ({ data: { id: 4, usuario_id: "owner", titulo: "Old", estado_id: 1, lat: -27.36, lon: -55.9, deleted_at: null, ownerProfile: null }, error: null }) }) }
    const update = vi.fn()
    const supabase = { from: () => ({
      select: () => reportQuery,
      update: () => { update(); return {} },
    }) } as never
    const result = await actualizarDatosReporteAdminWorkflow(supabase, 4, "admin", {
      titulo: "New title", descripcion: "Valid description", categoriaId: 3, prioridadId: 2, lat: 0, lon: 0,
    })
    expect(result).toMatchObject({ success: false, error: expect.stringContaining("dentro de Posadas") })
    expect(update).not.toHaveBeenCalled()
  })

  it("rejects non-admin edits without writing", async () => {
    mocks.isAdminRole.mockReturnValue(false)
    const from = vi.fn()
    const result = await actualizarDatosReporteAdminWorkflow({ from } as never, 4, "user", {
      titulo: "New title", descripcion: "Valid description", categoriaId: 3, prioridadId: 2, lat: null, lon: null,
    })
    expect(result).toMatchObject({ success: false, error: expect.stringContaining("permisos") })
    expect(from).not.toHaveBeenCalled()
  })
})

describe("admin report photo edits", () => {
  it("moderates a replacement under the report owner's identity and target photo", async () => {
    const reportQuery = { eq: () => ({ single: async () => ({ data: { id: 4, usuario_id: "owner", titulo: "Report", estado_id: 1, deleted_at: null, ownerProfile: null }, error: null }) }) }
    const photoQuery = { eq: () => photoQuery, maybeSingle: async () => ({ data: { id: 22 }, error: null }) }
    const activeReplacementQuery = { eq: () => activeReplacementQuery, in: () => activeReplacementQuery, maybeSingle: async () => ({ data: null, error: null }) }
    const supabase = { from: (table: string) => table === "reportes" ? { select: () => reportQuery } : table === "fotos_reporte" ? { select: () => photoQuery } : { select: () => activeReplacementQuery } } as never
    const image = new File(["image"], "report.png", { type: "image/png" })

    const result = await reemplazarFotoReporteAdminWorkflow(supabase, 4, 22, "admin", image)

    expect(result).toMatchObject({ success: true, data: { estado: "REVIEW", publicada: false } })
    expect(mocks.reemplazarFoto).toHaveBeenCalledWith(supabase, { reporteId: 4, propietarioId: "owner", image, reemplazaFotoId: 22 })
    expect(mocks.validarImagen).toHaveBeenCalledWith(image)
  })

  it("blocks a second replacement while the selected photo has an active review", async () => {
    const reportQuery = { eq: () => ({ single: async () => ({ data: { id: 4, usuario_id: "owner", titulo: "Report", estado_id: 1, deleted_at: null, ownerProfile: null }, error: null }) }) }
    const photoQuery = { eq: () => photoQuery, maybeSingle: async () => ({ data: { id: 22 }, error: null }) }
    const activeQuery = { eq: () => activeQuery, in: () => activeQuery, maybeSingle: async () => ({ data: { id: "pending" }, error: null }) }
    const supabase = { from: (table: string) => table === "reportes" ? { select: () => reportQuery } : table === "fotos_reporte" ? { select: () => photoQuery } : { select: () => activeQuery } } as never
    const image = new File(["image"], "report.png", { type: "image/png" })

    expect(await reemplazarFotoReporteAdminWorkflow(supabase, 4, 22, "admin", image)).toMatchObject({ success: false, error: expect.stringContaining("pendiente de revisión") })
    expect(mocks.reemplazarFoto).not.toHaveBeenCalled()
    expect(mocks.validarImagen).not.toHaveBeenCalled()
  })

  it("removes only a photo after admin authorization", async () => {
    const reportQuery = { eq: () => ({ single: async () => ({ data: { id: 4, usuario_id: "owner", titulo: "Report", estado_id: 1, deleted_at: null, ownerProfile: null }, error: null }) }) }
    const supabase = { from: () => ({ select: () => reportQuery }) } as never

    expect(await quitarFotoReporteAdminWorkflow(supabase, 4, 22, "admin")).toEqual({ success: true, data: { cleanupPending: false } })
    expect(mocks.quitarFoto).toHaveBeenCalledWith(supabase, 4, 22)
  })
})

describe("report status transition concurrency", () => {
  it("uses an IS NULL predicate when changing a report with no current state", async () => {
    let currentState: number | null = null
    const updateIsFilters: Array<[string, unknown]> = []
    const historyInsert = vi.fn().mockResolvedValue({ error: null })
    const updateQuery = {
      eq: () => updateQuery,
      is: (column: string, value: unknown) => { updateIsFilters.push([column, value]); return updateQuery },
      select: () => updateQuery,
      maybeSingle: async () => {
        const hasExpectedNullState = updateIsFilters.some(([column, value]) => column === "estado_id" && value === null)
        if (currentState === null && hasExpectedNullState) {
          currentState = 2
          return { data: { id: 4 }, error: null }
        }
        return { data: null, error: null }
      },
    }
    const supabase = {
      from: (table: string) => table === "reportes"
        ? { update: () => updateQuery }
        : { insert: historyInsert },
    } as never

    const result = await applyReportStateChange(supabase, {
      id: 4,
      usuario_id: "owner",
      titulo: "Reporte",
      estado_id: null,
      lat: null,
      lon: null,
      deleted_at: null,
      ownerProfile: null,
    }, 2, "admin")

    expect(result).toMatchObject({ success: true, data: { stateChanged: true, estadoId: 2 } })
    expect(updateIsFilters).toContainEqual(["estado_id", null])
    expect(currentState).toBe(2)
    expect(historyInsert).toHaveBeenCalledTimes(1)
  })

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
      lat: null,
      lon: null,
      deleted_at: null,
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
