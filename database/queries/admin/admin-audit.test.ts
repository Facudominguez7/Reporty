import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ verify: vi.fn(), admin: vi.fn() }))
vi.mock("server-only", () => ({}))
vi.mock("./verificar-admin", () => ({ verificarEsAdmin: mocks.verify }))
vi.mock("@/utils/supabase/admin", () => ({ createAdminClient: mocks.admin }))

import { getAdminAudit } from "./admin-audit"

beforeEach(() => vi.resetAllMocks())

describe("getAdminAudit", () => {
  it("never uses service role when caller is not an admin", async () => {
    mocks.verify.mockResolvedValue({ isAdmin: false, error: null })
    const result = await getAdminAudit({} as never, "operator", 1)
    expect(result.unauthorized).toBe(true)
    expect(result.events).toEqual([])
    expect(mocks.admin).not.toHaveBeenCalled()
  })

  it("reads newest events first and resolves usernames", async () => {
    mocks.verify.mockResolvedValue({ isAdmin: true, error: null })
    const range = vi.fn().mockResolvedValue({ data: [{ id: 7, actor_id: "user-1", action: "report_created", occurred_at: "2026-01-01", report_id: 3, report_title: "Bache" }], error: null })
    const order = vi.fn().mockReturnThis()
    const selectEvents = vi.fn().mockReturnValue({ order, range })
    const profiles = { select: vi.fn().mockReturnValue({ in: vi.fn().mockResolvedValue({ data: [{ id: "user-1", username: "Ana" }], error: null }) }) }
    mocks.admin.mockReturnValue({ from: vi.fn((table) => table === "audit_events" ? { select: selectEvents } : profiles) })

    const result = await getAdminAudit({} as never, "admin", 2)
    expect(result.events[0].actor).toBe("Ana")
    expect(order).toHaveBeenNthCalledWith(1, "occurred_at", { ascending: false })
    expect(order).toHaveBeenNthCalledWith(2, "id", { ascending: false })
    expect(range).toHaveBeenCalledWith(20, 40)
  })
})
