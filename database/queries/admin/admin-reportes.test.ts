import { describe, expect, it, vi } from "vitest"

const verify = vi.hoisted(() => vi.fn())
vi.mock("./verificar-admin", () => ({ verificarEsAdmin: verify }))

import { getAdminReportes } from "./admin-reportes"

describe("getAdminReportes", () => {
  it("does not query reports for a non-admin", async () => {
    verify.mockResolvedValue({ isAdmin: false, error: null })
    const supabase = { from: vi.fn() }
    const result = await getAdminReportes(supabase as never, "citizen-1")
    expect(result.unauthorized).toBe(true)
    expect(result.data).toEqual([])
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it("returns an authorization error without exposing rows when role lookup fails", async () => {
    const error = new Error("role lookup failed")
    verify.mockResolvedValue({ isAdmin: false, error })
    const result = await getAdminReportes({ from: vi.fn() } as never, "unknown")
    expect(result).toMatchObject({ unauthorized: true, error })
  })
})
