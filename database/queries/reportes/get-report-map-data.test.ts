import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { getReportCardData, getReportMapData } from "./get-reportes"

const mocks = vi.hoisted(() => {
  const calls: unknown[][] = []
  const rows: unknown[] = []
  // Records every query builder call and resolves like a Supabase query when awaited.
  const builder: object = new Proxy(
    {},
    {
      get(_target, method) {
        if (method === "then") {
          return (resolve: (value: unknown) => void) => resolve({ data: rows, error: null })
        }
        return (...args: unknown[]) => {
          calls.push([method, ...args])
          return builder
        }
      },
    },
  )
  return { calls, rows, builder, obtenerEstadoOperativo: vi.fn(), getPublicProfiles: vi.fn() }
})

vi.mock("next/cache", () => ({ unstable_cache: (load: unknown) => load }))
vi.mock("@/utils/supabase/server", () => ({ createClient: async () => ({ from: () => mocks.builder }) }))
vi.mock("@/utils/supabase/public", () => ({ createPublicClient: vi.fn() }))
vi.mock("@/database/queries/profiles", () => ({
  getPublicProfilesByIds: mocks.getPublicProfiles,
  indexPublicProfilesById: (profiles: Array<{ id: string; username: string }> | null) => new Map((profiles ?? []).map((profile) => [profile.id, profile])),
}))
vi.mock("@/database/queries/cuadrillas", () => ({
  obtenerEstadoOperativoPublicoPorReporte: mocks.obtenerEstadoOperativo,
}))

const PENDIENTE_ID = 1

const pendingRow = {
  id: 7,
  usuario_id: null,
  titulo: "Bache",
  descripcion: null,
  created_at: "2026-10-01T00:00:00Z",
  lat: -27.4,
  lon: -55.9,
  categoria: null,
  prioridad: null,
  estado: { nombre: "Pendiente" },
  fotos: null,
}

describe("getReportMapData", () => {
  beforeEach(() => {
    mocks.calls.length = 0
    mocks.rows.length = 0
    mocks.obtenerEstadoOperativo.mockReset().mockResolvedValue(new Map())
    mocks.getPublicProfiles.mockReset().mockResolvedValue({ data: [{ id: "user-1", username: "Author" }] })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("skips author profiles only when compact cards explicitly opt out", async () => {
    mocks.rows.push({ ...pendingRow, usuario_id: "user-1" })

    const result = await getReportCardData({}, { includeAuthors: false })

    expect(mocks.getPublicProfiles).not.toHaveBeenCalled()
    expect(result.data).toMatchObject([{ id: 7, title: "Bache" }])
  })

  it("keeps authors for the existing card and map callers", async () => {
    mocks.rows.push({ ...pendingRow, usuario_id: "user-1" })

    const cards = await getReportCardData()
    const map = await getReportMapData()

    expect(mocks.getPublicProfiles).toHaveBeenCalledTimes(2)
    expect(cards.data[0].author).toBe("Author")
    expect(map.data[0].author).toBe("Author")
  })

  it("keeps only pending reports in the query when asked to", async () => {
    mocks.rows.push(pendingRow)

    const { data, error } = await getReportMapData({ soloPendientes: true })

    expect(mocks.calls).toContainEqual(["eq", "estado_id", PENDIENTE_ID])
    expect(error).toBeNull()
    expect(data.map((report) => report.id)).toEqual([7])
  })

  it("keeps every state when only pending reports are not requested", async () => {
    await getReportMapData({ categoria: "Bache" })

    expect(mocks.calls.some(([, column]) => column === "estado_id")).toBe(false)
  })

  it("filters Agua by category ID 8", async () => {
    await getReportMapData({ categoria: "Agua" })

    expect(mocks.calls).toContainEqual(["eq", "categoria_id", 8])
  })

  it("skips the crew status lookup while crews are turned off", async () => {
    vi.stubEnv("CUADRILLAS_ENABLED", undefined)
    mocks.rows.push(pendingRow)

    const { data } = await getReportMapData()

    expect(mocks.obtenerEstadoOperativo).not.toHaveBeenCalled()
    expect(data).toMatchObject([{ id: 7, estadoOperativo: null, cuadrillaNombre: null }])
  })

  it("attaches the crew status when crews are turned on", async () => {
    vi.stubEnv("CUADRILLAS_ENABLED", "true")
    mocks.rows.push(pendingRow)
    mocks.obtenerEstadoOperativo.mockResolvedValue(
      new Map([[7, { estadoOperativo: "en_progreso", cuadrillaNombre: "Cuadrilla Norte" }]]),
    )

    const { data } = await getReportMapData()

    expect(mocks.obtenerEstadoOperativo).toHaveBeenCalledWith(expect.anything(), [7])
    expect(data).toMatchObject([{ id: 7, estadoOperativo: "en_progreso", cuadrillaNombre: "Cuadrilla Norte" }])
  })
})
