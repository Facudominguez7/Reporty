import { beforeEach, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), auth: vi.fn(), cleanup: vi.fn(), revalidate: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }))
vi.mock("@/utils/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: mocks.auth }, rpc: mocks.rpc }) }))
vi.mock("@/utils/supabase/admin", () => ({ createAdminClient: () => ({}) }))
vi.mock("@/lib/moderation/mascotas-withdrawal.server", () => ({ limpiarFotoMascotaRetirada: mocks.cleanup }))
import { retirarMascotaAdminAction } from "./admin-actions"

beforeEach(() => { mocks.rpc.mockReset(); mocks.auth.mockReset(); mocks.cleanup.mockReset(); mocks.revalidate.mockReset() })

it("retira la publicación mediante el RPC protegido y limpia su foto", async () => {
  mocks.auth.mockResolvedValue({ data: { user: { id: "admin", is_anonymous: false } }, error: null })
  mocks.rpc.mockResolvedValue({ data: true, error: null })
  mocks.cleanup.mockResolvedValue({ removed: true, pending: false, publiclyAccessible: false })
  expect(await retirarMascotaAdminAction(12)).toMatchObject({ success: true })
  expect(mocks.rpc).toHaveBeenCalledWith("retirar_mascota_moderacion", { p_mascota_id: 12 })
  expect(mocks.cleanup).toHaveBeenCalledWith({}, 12)
  expect(mocks.revalidate).toHaveBeenCalledWith("/mascotas/12")
})

it("rejects invalid ids before database access", async () => {
  expect(await retirarMascotaAdminAction(0)).toMatchObject({ success: false })
  expect(mocks.rpc).not.toHaveBeenCalled()
})
