import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  getUserRoleContext: vi.fn(),
  resolverEvidencia: vi.fn(),
  createAdminClient: vi.fn(() => ({})),
  revalidatePath: vi.fn(),
}))

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock("@/utils/supabase/server", () => ({ createClient: () => ({ auth: { getUser: mocks.getUser } }) }))
vi.mock("@/utils/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }))
vi.mock("@/lib/authz/roles", () => ({ getUserRoleContext: mocks.getUserRoleContext, isAdminRole: () => true }))
vi.mock("@/lib/use-cases/reportes/evidencia-reparacion", () => ({ resolverEvidenciaReparacionWorkflow: mocks.resolverEvidencia }))

import { resolverEvidenciaColaAction } from "./reparaciones-actions"

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getUser.mockResolvedValue({ data: { user: { id: "admin-1", is_anonymous: false } } })
  mocks.getUserRoleContext.mockResolvedValue({ data: { roleId: 1 }, error: null })
})

describe("acciones administrativas de reparaciones", () => {
  it("rechaza identificadores inválidos sin tocar la base", async () => {
    const result = await resolverEvidenciaColaAction("no-es-uuid", "aprobar")
    expect(result).toEqual({ success: false, error: "La solicitud no es válida." })
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
  })
})
