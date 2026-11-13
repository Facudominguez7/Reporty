import { describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ selects: [] as string[] }))

const ADMIN_IDS = [
  "6949c7cc-cf4c-41d0-8b7a-baf2ed151150",
  "0aeac4be-56a4-4bf3-9a30-a530ad484b17",
  "bd9e54a7-7649-41da-a14e-72c42f44b449",
]

vi.mock("next/cache", () => ({ unstable_cache: (load: unknown) => load }))
vi.mock("@/utils/supabase/public", () => ({
  createPublicClient: () => ({
    from: () => ({
      select: (columns: string) => {
        mocks.selects.push(columns)
        const result = columns === "id"
          ? { count: 3, error: null }
          : { data: [
            { usuario_id: "user-1" }, { usuario_id: "user-1" }, { usuario_id: "guest" },
            ...ADMIN_IDS.flatMap((usuario_id) => [{ usuario_id }, { usuario_id }, { usuario_id }]),
          ], error: null }
        const query = { is: () => query, eq: () => query, returns: () => Promise.resolve(result), then: (resolve: (value: unknown) => void) => resolve(result) }
        return query
      },
    }),
  }),
}))
vi.mock("@/database/queries/profiles", () => ({
  getPublicProfilesCount: async () => ({ count: 5, error: null }),
  getPublicProfilesByIds: async () => ({ data: [
    { id: "user-1", username: "Member", puntos: 4, es_invitado: false },
    { id: "guest", username: "Guest", puntos: 0, es_invitado: true },
    ...ADMIN_IDS.map((id) => ({ id, username: id, puntos: 100, es_invitado: false })),
  ], error: null }),
  indexPublicProfilesById: (profiles: Array<{ id: string }>) => new Map(profiles.map((profile) => [profile.id, profile])),
}))

import { getComunidadPageData } from "./comunidad"

describe("community page data", () => {
  it("excludes administrators and guests from the ranking without changing community totals", async () => {
    mocks.selects.length = 0
    const result = await getComunidadPageData()

    expect(mocks.selects).toContain("usuario_id")
    expect(result.error).toBeNull()
    expect(result.contributors).toEqual([{ id: "user-1", username: "Member", points: 4, reports: 2 }])
    expect(result.contributors.some(({ id }) => ADMIN_IDS.includes(id))).toBe(false)
    expect(result.members).toBe(5)
    expect(result.totalReports).toBe(3)
  })
})
