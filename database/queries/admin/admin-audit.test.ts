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

  it("does not read audit rows when no username matches", async () => {
    mocks.verify.mockResolvedValue({ isAdmin: true, error: null })
    const from = vi.fn(() => ({ select: vi.fn(() => ({ ilike: vi.fn().mockResolvedValue({ data: [], error: null }) })) }))
    mocks.admin.mockReturnValue({ from })

    const result = await getAdminAudit({} as never, "admin", 1, { user: "unknown" })
    expect(result.events).toEqual([])
    expect(from).toHaveBeenCalledTimes(1)
    expect(from).toHaveBeenCalledWith("profiles")
  })

  it("keeps the unfiltered timeline available", async () => {
    mocks.verify.mockResolvedValue({ isAdmin: true, error: null })
    const range = vi.fn().mockResolvedValue({ data: [], error: null })
    const order = vi.fn().mockReturnThis()
    const from = vi.fn(() => ({ select: vi.fn(() => ({ order, range })) }))
    mocks.admin.mockReturnValue({ from })

    const result = await getAdminAudit({} as never, "admin", 1)
    expect(result.events).toEqual([])
    expect(from).toHaveBeenCalledWith("audit_events")
    expect(range).toHaveBeenCalledWith(0, 20)
  })

  it("filters activity by username, action and period before paginating", async () => {
    mocks.verify.mockResolvedValue({ isAdmin: true, error: null })
    const range = vi.fn().mockResolvedValue({ data: [{ id: 7, actor_id: "user-1", action: "report_created", occurred_at: "2026-01-01", report_id: 3, report_title: "Bache" }], error: null })
    const order = vi.fn().mockReturnThis()
    const inAudit = vi.fn().mockReturnThis()
    const eq = vi.fn().mockReturnThis()
    const gte = vi.fn().mockReturnThis()
    const ilike = vi.fn().mockResolvedValue({ data: [{ id: "user-1" }], error: null })
    const profileLookup = vi.fn().mockResolvedValue({ data: [{ id: "user-1", username: "Ana" }], error: null })
    mocks.admin.mockReturnValue({ from: vi.fn((table) => table === "audit_events"
      ? { select: vi.fn().mockReturnValue({ order, in: inAudit, eq, gte, range }) }
      : { select: vi.fn((fields) => fields === "id" ? { ilike } : { in: profileLookup }) }) })

    const result = await getAdminAudit({} as never, "admin", 2, { user: "Ana", action: "report_created", days: 7 })
    expect(result.events[0].actor).toBe("Ana")
    expect(ilike).toHaveBeenCalledWith("username", "%Ana%")
    expect(inAudit).toHaveBeenCalledWith("actor_id", ["user-1"])
    expect(eq).toHaveBeenCalledWith("action", "report_created")
    expect(gte).toHaveBeenCalledWith("occurred_at", expect.any(String))
    expect(order).toHaveBeenNthCalledWith(1, "occurred_at", { ascending: false })
    expect(order).toHaveBeenNthCalledWith(2, "id", { ascending: false })
    expect(range).toHaveBeenCalledWith(20, 40)
  })
})
