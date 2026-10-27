import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  cambiar: vi.fn(),
  eliminar: vi.fn(),
}))

vi.mock("@/utils/supabase/server", () => ({ createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser } })) }))
vi.mock("@/utils/supabase/admin", () => ({ createAdminClient: vi.fn(() => ({ })) }))
vi.mock("@/lib/use-cases/reportes", () => ({
  cambiarEstadoAdminWorkflow: mocks.cambiar,
  eliminarReporteAdminWorkflow: mocks.eliminar,
}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

import { cambiarEstadoReporteAction, eliminarReporteAction } from "./actions"

describe("admin report actions", () => {
  beforeEach(() => vi.clearAllMocks())

  it("rejects status changes without a server session", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } })
    expect(await cambiarEstadoReporteAction(4, 2)).toEqual({
      success: false,
      error: "Tenés que iniciar sesión para administrar reportes.",
    })
    expect(mocks.cambiar).not.toHaveBeenCalled()
  })

  it("passes the authenticated actor to the guarded status workflow", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "admin-1" } } })
    mocks.cambiar.mockResolvedValue({ success: true, error: null })
    await cambiarEstadoReporteAction(4, 2)
    expect(mocks.cambiar).toHaveBeenCalledWith(expect.anything(), 4, 2, "admin-1", expect.any(String))
  })

  it("validates report ids before soft deletion", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "admin-1" } } })
    const result = await eliminarReporteAction(0)
    expect(result.success).toBe(false)
    expect(mocks.eliminar).not.toHaveBeenCalled()
  })
})
