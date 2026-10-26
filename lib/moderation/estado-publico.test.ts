import { describe, expect, it, vi } from "vitest"
import { tieneFotografiaPendiente } from "./estado-publico.server"

const { from, eq, limit, select } = vi.hoisted(() => ({
  from: vi.fn(), eq: vi.fn(), limit: vi.fn(), select: vi.fn(),
}))
vi.mock("@/utils/supabase/admin", () => ({ createAdminClient: () => ({ from }) }))

describe("public pending photo status", () => {
  it.each([1, 0])("exposes only a boolean for pending count %s", async (count) => {
    from.mockReturnValue({ select }); select.mockReturnValue({ eq }); eq.mockReturnValue({ eq, limit })
    limit.mockResolvedValue({ count, error: null })
    expect(await tieneFotografiaPendiente(42)).toBe(count > 0)
    expect(from).toHaveBeenCalledWith("moderacion_imagenes")
    expect(select).toHaveBeenCalledWith("id", { count: "exact", head: true })
    expect(eq).toHaveBeenCalledWith("reporte_id", 42)
    expect(eq).toHaveBeenCalledWith("decision", "REVIEW")
  })
  it("does not claim a pending photo on query failure", async () => {
    limit.mockResolvedValue({ count: null, error: { message: "private detail" } })
    expect(await tieneFotografiaPendiente(42)).toBe(false)
  })
})
