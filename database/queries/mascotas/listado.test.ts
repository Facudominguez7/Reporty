import { beforeEach, describe, expect, it, vi } from "vitest"
import { getMascotasListado, getMascotasStatusCounts, mapPetForListing } from "./listado"

const query = vi.hoisted(() => {
  const state = { from: vi.fn(), select: vi.fn(), eq: vi.fn(), ilike: vi.fn(), order: vi.fn(), range: vi.fn(), rows: [] as unknown[], counts: [] as (number | null)[], error: null as unknown, builder: {} as Record<string, unknown> }
  state.builder = { select: state.select, eq: state.eq, ilike: state.ilike, order: state.order, range: state.range, then: (resolve: (value: unknown) => unknown) => Promise.resolve({ count: state.counts.shift() ?? null, error: null }).then(resolve) }
  return state
})
vi.mock("@/utils/supabase/public", () => ({
  createPublicClient: () => ({
    from: query.from.mockImplementation(() => query.builder),
    storage: { from: () => ({ getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn.test/${path}` } }) }) },
  }),
}))

beforeEach(() => {
  for (const method of [query.from, query.select, query.eq, query.ilike, query.order]) method.mockReset().mockReturnValue(query.builder)
  query.range.mockReset().mockImplementation(async () => ({ data: query.rows, error: query.error }))
  query.rows = []
  query.counts = []
  query.error = null
})

describe("mapPetForListing", () => {
  it("maps only approved, non-withdrawn pets with required public data", () => {
    expect(mapPetForListing({
      id: 42, tipo_animal: "perro", estado: "encontrada", descripcion: "Blanco, collar azul",
      publicada_at: "2026-01-02T00:00:00Z",
      moderacion_estado: "aprobada", retirada_at: null,
    })).toMatchObject({
      id: 42, title: "Perro encontrado", description: "Blanco, collar azul",
      status: "Encontrada", createdAt: "2026-01-02T00:00:00Z",
    })
  })

  it.each([
    { moderacion_estado: "rechazada", retirada_at: null },
    { moderacion_estado: "aprobada", retirada_at: "2026-01-03T00:00:00Z" },
  ])("rejects hidden rows %#", (visibility) => {
    expect(mapPetForListing({
      id: 42, tipo_animal: "gato", estado: "perdida", descripcion: "Gato",
      publicada_at: "2026-01-02T00:00:00Z", ...visibility,
    })).toBeNull()
  })

  it("rejects incomplete or unsupported row values", () => {
    expect(mapPetForListing({ id: 1 })).toBeNull()
  })
})

describe("getMascotasListado", () => {
  it("counts all, lost, and found pets under the active kind and search filters", async () => {
    query.counts = [18, 12, 6]
    await expect(getMascotasStatusCounts({ tipo: "gato", search: "collar azul" })).resolves.toEqual({ all: 18, lost: 12, found: 6 })
    expect(query.select).toHaveBeenCalledTimes(3)
    expect(query.eq.mock.calls).toEqual([["tipo_animal", "gato"], ["tipo_animal", "gato"], ["estado", "perdida"], ["tipo_animal", "gato"], ["estado", "encontrada"]])
    expect(query.ilike).toHaveBeenCalledTimes(3)
    expect(query.ilike).toHaveBeenNthCalledWith(1, "descripcion", "%collar azul%")
  })

  it("applies valid pet filters, uses only anon-granted columns, and fetches one extra row", async () => {
    const row = { id: 7, tipo_animal: "gato", estado: "encontrada", descripcion: "Blanca", foto_path: "mascotas/7.webp", publicada_at: "2026-01-01" }
    query.rows = Array.from({ length: 13 }, (_, index) => ({ ...row, id: index + 1 }))
    const result = await getMascotasListado({ tipo: "gato", estado: "encontrada", offset: 12, limite: 12 })
    expect(query.from).toHaveBeenCalledWith("mascotas_perdidas_publicas")
    expect(query.select).toHaveBeenCalledWith("id,tipo_animal,estado,descripcion,publicada_at")
    expect(query.eq.mock.calls).toEqual([["tipo_animal", "gato"], ["estado", "encontrada"]])
    expect(query.order).toHaveBeenCalledWith("publicada_at", { ascending: false })
    expect(query.range).toHaveBeenCalledWith(12, 24)
    expect(result.hasMore).toBe(true)
    expect(result.data).toHaveLength(12)
    expect(result.data[0]).toMatchObject({ id: 1, type: "Gato", status: "Encontrada", image: "/api/mascotas/1/foto" })
  })

  it("searches descriptions with literal escaped wildcard characters without changing pet filters", async () => {
    await getMascotasListado({ search: "  gato%,_\\\\  ", tipo: "gato", estado: "perdida" })
    expect(query.ilike).toHaveBeenCalledWith("descripcion", "%gato\\%,\\_\\\\\\\\%")
    expect(query.eq.mock.calls).toEqual([["tipo_animal", "gato"], ["estado", "perdida"]])
  })

  it("does not send unsupported filters to PostgREST and preserves query errors", async () => {
    const failure = { message: "denied" }
    query.error = failure
    const result = await getMascotasListado({ tipo: "anything", estado: "pendiente" })
    expect(query.eq).not.toHaveBeenCalled()
    expect(result).toMatchObject({ data: [], hasMore: false, error: failure })
  })
})
