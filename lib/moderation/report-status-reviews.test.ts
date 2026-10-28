import { beforeEach, describe, expect, it, vi } from "vitest"

const authorize = vi.hoisted(() => vi.fn())
vi.mock("server-only", () => ({}))
vi.mock("./administracion.server", () => ({ autorizarAdministracion: authorize }))

import { getCantidadRevisionesRechazoReportes, listarRevisionesRechazoReportes } from "./report-status-reviews.server"

beforeEach(() => vi.resetAllMocks())

describe("admin report rejection reviews", () => {
  it("counts only unresolved reviews for open reports", async () => {
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockResolvedValue({ count: 3, error: null }),
    }
    authorize.mockResolvedValue({ servicio: { from: vi.fn().mockReturnValue(query) } })

    expect(await getCantidadRevisionesRechazoReportes()).toBe(3)
    expect(query.select).toHaveBeenCalledWith("reporte_id,reportes!inner(id)", { count: "exact", head: true })
    expect(query.eq).toHaveBeenCalledWith("estado", "pendiente")
    expect(query.eq).toHaveBeenCalledWith("reportes.estado_id", 1)
    expect(query.is).toHaveBeenCalledWith("reportes.deleted_at", null)
  })

  it("lists only pending reviews for open reports with public vote totals", async () => {
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockResolvedValue({ data: [{
        reporte_id: 9,
        creado_at: "2026-10-28T12:00:00Z",
        reportes: {
          id: 9,
          titulo: "Bache",
          descripcion: "La calle está en mal estado",
          created_at: "2026-10-20T12:00:00Z",
          reportes_vote_summary: { votos_no_existe_count: 5 },
        },
      }], error: null }),
    }
    authorize.mockResolvedValue({ servicio: { from: vi.fn().mockReturnValue(query) } })

    expect(await listarRevisionesRechazoReportes(0)).toEqual([{
      reporteId: 9,
      titulo: "Bache",
      descripcion: "La calle está en mal estado",
      reportCreatedAt: "2026-10-20T12:00:00Z",
      reviewCreatedAt: "2026-10-28T12:00:00Z",
      noExisteVotes: 5,
    }])
    expect(query.eq).toHaveBeenCalledWith("estado", "pendiente")
    expect(query.eq).toHaveBeenCalledWith("reportes.estado_id", 1)
    expect(query.is).toHaveBeenCalledWith("reportes.deleted_at", null)
    expect(query.range).toHaveBeenCalledWith(0, 19)
  })
})
