import { describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ selects: [] as string[] }))

vi.mock("next/cache", () => ({ unstable_cache: (load: unknown) => load }))
vi.mock("@/utils/supabase/public", () => ({
  createPublicClient: () => ({
    from: () => ({
      select: (columns: string) => {
        mocks.selects.push(columns)
        const result = columns === "id"
          ? { count: 3, error: null }
          : { data: [{ usuario_id: "user-1" }, { usuario_id: "user-1" }, { usuario_id: "guest" }], error: null }
        const query = { is: () => query, eq: () => query, returns: () => Promise.resolve(result), then: (resolve: (value: unknown) => void) => resolve(result) }
        return query
      },
    }),
  }),
}))
vi.mock("@/database/queries/profiles", () => ({
  getPublicProfilesCount: async () => ({ count: 2, error: null }),
  getPublicProfilesByIds: async () => ({ data: [
    { id: "user-1", username: "Member", puntos: 4, es_invitado: false },
    { id: "guest", username: "Guest", puntos: 0, es_invitado: true },
  ], error: null }),
  indexPublicProfilesById: (profiles: Array<{ id: string }>) => new Map(profiles.map((profile) => [profile.id, profile])),
}))

import { getComunidadPageData } from "./comunidad"

describe("community page data", () => {
  it("loads only contributor IDs and keeps guests out of the ranking", async () => {
    mocks.selects.length = 0
    const result = await getComunidadPageData()

    expect(mocks.selects).toContain("usuario_id")
    expect(result.error).toBeNull()
    expect(result.contributors).toEqual([{ id: "user-1", username: "Member", points: 4, reports: 2 }])
    expect(result.members).toBe(2)
    expect(result.totalReports).toBe(3)
  })
})
