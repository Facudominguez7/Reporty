import { beforeEach, describe, expect, it, vi } from "vitest"
import { getMascotasListado, mapPetForListing } from "./listado"

const query = vi.hoisted(() => {
  const state = { select: vi.fn(), eq: vi.fn(), ilike: vi.fn(), order: vi.fn(), range: vi.fn(), rows: [] as unknown[], error: null as unknown, builder: {} as Record<string, unknown> }
  state.builder = { select: state.select, eq: state.eq, ilike: state.ilike, order: state.order, range: state.range }
  return state
})
vi.mock("@/utils/supabase/public", () => ({
  createPublicClient: () => ({
    from: () => query.builder,
    storage: { from: () => ({ getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn.test/${path}` } }) }) },
  }),
}))

beforeEach(() => {
  for (const method of [query.select, query.eq, query.ilike, query.order]) method.mockReset().mockReturnValue(query.builder)
  query.range.mockReset().mockImplementation(async () => ({ data: query.rows, error: query.error }))
  query.rows = []
  query.error = null
})

describe("mapPetForListing", () => {
  it("maps only approved, non-withdrawn pets with required public data", () => {
    expect(mapPetForListing({
      id: 42, tipo_animal: "perro", estado: "encontrada", descripcion: "Blanco, collar azul",
      foto_path: "mascotas/photo.webp", publicada_at: "2026-01-02T00:00:00Z",
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
      foto_path: "mascotas/photo.webp", publicada_at: "2026-01-02T00:00:00Z", ...visibility,
    })).toBeNull()
  })

  it("rejects incomplete or unsupported row values", () => {
    expect(mapPetForListing({ id: 1 })).toBeNull()
  })
})

describe("getMascotasListado", () => {
  it("applies valid pet filters, uses only anon-granted columns, and fetches one extra row", async () => {
    const row = { id: 7, tipo_animal: "gato", estado: "encontrada", descripcion: "Blanca", foto_path: "mascotas/7.webp", publicada_at: "2026-01-01" }
    query.rows = Array.from({ length: 13 }, (_, index) => ({ ...row, id: index + 1 }))
    const result = await getMascotasListado({ tipo: "gato", estado: "encontrada", offset: 12, limite: 12 })
    expect(query.select).toHaveBeenCalledWith("id,tipo_animal,estado,descripcion,foto_path,publicada_at")
    expect(query.eq.mock.calls).toEqual([["tipo_animal", "gato"], ["estado", "encontrada"]])
    expect(query.order).toHaveBeenCalledWith("publicada_at", { ascending: false })
    expect(query.range).toHaveBeenCalledWith(12, 24)
    expect(result.hasMore).toBe(true)
    expect(result.data).toHaveLength(12)
    expect(result.data[0]).toMatchObject({ id: 1, type: "Gato", status: "Encontrada" })
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
