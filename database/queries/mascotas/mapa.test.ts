import { beforeEach, describe, expect, it, vi } from "vitest"
import { getMascotasMapa, mapPetForMap } from "./mapa"

const query = vi.hoisted(() => {
  const state = { select: vi.fn(), is: vi.fn(), order: vi.fn(), rows: [] as unknown[], error: null as unknown, builder: {} as Record<string, unknown> }
  state.builder = { select: state.select, is: state.is, order: state.order }
  return state
})
vi.mock("@/utils/supabase/public", () => ({
  createPublicClient: () => ({
    from: () => query.builder,
    storage: { from: () => ({ getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn.test/${path}` } }) }) },
  }),
}))

beforeEach(() => {
  for (const method of [query.select, query.is, query.order]) method.mockReset().mockReturnValue(query.builder)
  query.order.mockImplementation(async () => ({ data: query.rows, error: query.error }))
  query.rows = []
  query.error = null
})

describe("mascotas en mapa", () => {
  it("maps public pet data and coordinates for both statuses", () => {
    expect(mapPetForMap({ id: 3, tipo_animal: "gato", estado: "encontrada", descripcion: "Blanca", lat: -27, lon: -55, telefono: "123", foto_path: "pets/a.jpg", publicada_at: "2026-01-01" }, "https://cdn.test/a.jpg"))
      .toMatchObject({ id: 3, species: "Gato", status: "Encontrada", coordinates: [-27, -55], phone: "123", image: "https://cdn.test/a.jpg" })
  })

  it("queries approved, non-withdrawn pets without filtering either state", async () => {
    query.rows = [
      { id: 1, tipo_animal: "perro", estado: "perdida", descripcion: "Perro", lat: -27, lon: -55, telefono: "123", foto_path: "a.jpg", publicada_at: "2026-01-01" },
      { id: 2, tipo_animal: "gato", estado: "encontrada", descripcion: "Gato", lat: -27.1, lon: -55.1, telefono: "456", foto_path: "b.jpg", publicada_at: "2026-01-02" },
    ]
    const result = await getMascotasMapa()
    expect(query.select).toHaveBeenCalledWith("id,tipo_animal,estado,descripcion,lat,lon,telefono,foto_path,publicada_at")
    expect(query.is).not.toHaveBeenCalled()
    expect(query.select.mock.calls[0][0]).not.toContain("retirada_at")
    expect(result.data.map((pet) => pet.status)).toEqual(["Perdida", "Encontrada"])
  })

  it("rejects invalid and hidden records", () => {
    expect(mapPetForMap({ id: 1, tipo_animal: "perro", estado: "perdida", descripcion: " ", lat: 0, lon: 0, telefono: "1", foto_path: "a", publicada_at: "now" })).toBeNull()
  })
})
