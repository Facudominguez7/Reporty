import { beforeEach, describe, expect, it, vi } from "vitest"

const { getUser, createAdminClient, createClient, sessionRpc, cleanupPhoto } = vi.hoisted(() => ({
  getUser: vi.fn(), createAdminClient: vi.fn(), createClient: vi.fn(), sessionRpc: vi.fn(), cleanupPhoto: vi.fn(),
}))
vi.mock("@/utils/supabase/server", () => ({ createClient }))
vi.mock("@/utils/supabase/admin", () => ({ createAdminClient }))
vi.mock("@/lib/use-cases/mascotas/create-pet", () => ({ crearMascotaWorkflow: vi.fn() }))
vi.mock("@/lib/moderation/mascotas-withdrawal.server", () => ({ limpiarFotoMascotaRetirada: cleanupPhoto }))
vi.mock("@/lib/authz/roles", () => ({ getUserRoleContext: vi.fn(), isGuestRole: (id: number) => id === 5 }))

import { getUserRoleContext } from "@/lib/authz/roles"
import { crearMascotaWorkflow } from "@/lib/use-cases/mascotas/create-pet"
import { crearMascotaAction, retirarMascotaPropiaAction } from "./actions"

function form(image?: File) {
  const data = new FormData()
  data.set("tipoAnimal", "perro")
  data.set("descripcion", "Perro marrón con collar")
  data.set("lat", "-34")
  data.set("lon", "-56")
  data.set("telefono", "1122334455")
  if (image) data.set("image", image)
  return data
}

beforeEach(() => {
  vi.clearAllMocks()
  createClient.mockResolvedValue({ auth: { getUser }, rpc: sessionRpc })
  cleanupPhoto.mockResolvedValue({ removed: false, pending: true, publiclyAccessible: true })
  createAdminClient.mockReturnValue({})
  vi.mocked(getUserRoleContext).mockResolvedValue({ data: { roleId: 2, roleName: "Usuario" }, error: null } as never)
  vi.mocked(crearMascotaWorkflow).mockResolvedValue({ success: true, data: { mascotaId: 8, moderation: "REVIEW", pointsAwarded: 0 } } as never)
})

describe("crearMascotaAction", () => {
  it("withdraws only through the verified owner session and reports pending public cleanup explicitly", async () => {
    getUser.mockResolvedValueOnce({ data: { user: { id: "owner", is_anonymous: false } }, error: null })
    sessionRpc.mockResolvedValueOnce({ data: true, error: null })

    const result = await retirarMascotaPropiaAction(7)

    expect(sessionRpc).toHaveBeenCalledWith("retirar_mascota_propia", { p_mascota_id: 7 })
    expect(cleanupPhoto).toHaveBeenCalledWith(expect.anything(), 7)
    expect(result).toMatchObject({ success: true, data: { cleanupPending: true, publiclyAccessible: true } })
  })

  it("reports an unchanged found publication without attempting photo cleanup", async () => {
    getUser.mockResolvedValueOnce({ data: { user: { id: "owner", is_anonymous: false } }, error: null })
    sessionRpc.mockResolvedValueOnce({ data: false, error: null })
    const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: { id: 7, retirada_at: null }, error: null }) }
    createAdminClient.mockReturnValue({ from: vi.fn().mockReturnValue(query) })
    expect(await retirarMascotaPropiaAction(7)).toMatchObject({ success: false, error: expect.stringContaining("encontrada") })
    expect(cleanupPhoto).not.toHaveBeenCalled()
  })

  it("requires a photo before obtaining a service client", async () => {
    const result = await crearMascotaAction(form())
    expect(result).toMatchObject({ success: false })
    expect(getUser).not.toHaveBeenCalled()
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it("rejects missing coordinates before authenticating or creating a service client", async () => {
    const data = form(new File(["photo"], "pet.webp", { type: "image/webp" }))
    data.delete("lat")
    const result = await crearMascotaAction(data)
    expect(result).toMatchObject({ success: false })
    expect(getUser).not.toHaveBeenCalled()
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it("rejects missing and anonymous sessions without trusting submitted identity", async () => {
    getUser.mockResolvedValueOnce({ data: { user: null }, error: null })
    const missing = await crearMascotaAction(form(new File(["photo"], "pet.webp", { type: "image/webp" })))
    expect(missing.success).toBe(false)

    getUser.mockResolvedValueOnce({ data: { user: { id: "guest", is_anonymous: true } }, error: null })
    const anonymous = await crearMascotaAction(form(new File(["photo"], "pet.webp", { type: "image/webp" })))
    expect(anonymous.success).toBe(false)
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it("rejects an authenticated identity whose database role is the guest role", async () => {
    getUser.mockResolvedValueOnce({ data: { user: { id: "guest", is_anonymous: false } }, error: null })
    vi.mocked(getUserRoleContext).mockResolvedValueOnce({ data: { roleId: 5, roleName: "Invitado" }, error: null } as never)
    const result = await crearMascotaAction(form(new File(["photo"], "pet.webp", { type: "image/webp" })))
    expect(result).toMatchObject({ success: false })
    expect(crearMascotaWorkflow).not.toHaveBeenCalled()
  })

  it("uses only the authenticated session owner and requires a registered database role", async () => {
    getUser.mockResolvedValueOnce({ data: { user: { id: "owner", is_anonymous: false } }, error: null })
    const data = form(new File(["photo"], "pet.webp", { type: "image/webp" }))
    data.set("propietarioId", "attacker")
    data.set("estado", "encontrada")

    await crearMascotaAction(data)

    expect(crearMascotaWorkflow).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ propietarioId: "owner" }))
    expect(crearMascotaWorkflow).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ propietarioId: "attacker" }))
  })
})
