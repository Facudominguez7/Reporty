import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
  getUserRoleContext: vi.fn(),
  cambiarEstadoAdminWorkflow: vi.fn(),
  revalidatePath: vi.fn(),
  update: vi.fn(),
}))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock("@/utils/supabase/server", () => ({ createClient: mocks.createClient }))
vi.mock("@/utils/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }))
vi.mock("@/lib/authz/roles", () => ({ getUserRoleContext: mocks.getUserRoleContext, isAdminRole: (roleId: number) => roleId === 1 }))
vi.mock("@/lib/use-cases/reportes", () => ({ cambiarEstadoAdminWorkflow: mocks.cambiarEstadoAdminWorkflow }))

import { resolverRevisionRechazoAction } from "./reportes-actions"
import { REPORT_STATE_IDS, ROLE_IDS } from "@/lib/authz/catalog"

const admin = { from: vi.fn() }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.createClient.mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: "admin-1", is_anonymous: false } } }) } })
  mocks.createAdminClient.mockReturnValue(admin)
  mocks.getUserRoleContext.mockResolvedValue({ data: { roleId: ROLE_IDS.ADMIN }, error: null })
  mocks.cambiarEstadoAdminWorkflow.mockResolvedValue({ success: true, data: { stateChanged: true, estadoId: REPORT_STATE_IDS.RECHAZADO } })
  admin.from.mockImplementation((table: string) => {
    if (table !== "reportes_revision_rechazo") throw new Error(`Unexpected table ${table}`)
    const query = {
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { reporte_id: 9 }, error: null }),
    }
    return {
      select: () => query,
      update: (values: unknown) => { mocks.update(values); return query },
    }
  })
})

describe("resolve report rejection review action", () => {
  it("dismisses a review without changing the report state and records the admin", async () => {
    expect(await resolverRevisionRechazoAction(9, "descartar")).toEqual({ success: true })

    expect(mocks.cambiarEstadoAdminWorkflow).not.toHaveBeenCalled()
    expect(mocks.update).toHaveBeenCalledWith({ estado: "descartada", resuelto_at: expect.any(String), resuelto_por: "admin-1" })
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin", "layout")
  })

  it("uses the existing admin workflow before recording a rejection decision", async () => {
    expect(await resolverRevisionRechazoAction(9, "rechazar")).toEqual({ success: true })

    expect(mocks.cambiarEstadoAdminWorkflow).toHaveBeenCalledWith(
      admin,
      9,
      REPORT_STATE_IDS.RECHAZADO,
      "admin-1",
      "Rechazado tras revisar los votos comunitarios de 'No existe'.",
    )
    expect(mocks.update).toHaveBeenCalledWith({ estado: "rechazada", resuelto_at: expect.any(String), resuelto_por: "admin-1" })
  })

  it("denies the action to non-admins before using the service client", async () => {
    mocks.getUserRoleContext.mockResolvedValue({ data: { roleId: ROLE_IDS.CIUDADANO }, error: null })

    expect(await resolverRevisionRechazoAction(9, "descartar")).toMatchObject({ success: false })
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
  })
})
