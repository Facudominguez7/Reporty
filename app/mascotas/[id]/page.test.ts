import { beforeEach, describe, expect, it, vi } from "vitest"

const { getMascotaDetalle, createClient, createAdminClient, notFound, maybeSingle, getUserRoleContext } = vi.hoisted(() => ({
  getMascotaDetalle: vi.fn(), createClient: vi.fn(), createAdminClient: vi.fn(), notFound: vi.fn(), maybeSingle: vi.fn(), getUserRoleContext: vi.fn(),
}))
vi.mock("@/lib/authz/roles", () => ({ getUserRoleContext, isAdminRole: (role: number) => role === 1 }))
vi.mock("@/database/queries/mascotas/detalle", () => ({ getMascotaDetalle }))
vi.mock("@/utils/supabase/server", () => ({ createClient }))
vi.mock("@/utils/supabase/admin", () => ({ createAdminClient }))
vi.mock("next/navigation", () => ({ notFound }))
vi.mock("./detalle-mascota", () => ({ DetalleMascota: () => null }))

import MascotaDetallePage from "./page"

const pet = { id: 12, species: "Perro", status: "Perdida", description: "Collar rojo", createdAt: "2026-11-01T12:00:00Z", phone: "123456", image: "/api/mascotas/12/foto" }
const render = (id = "12") => MascotaDetallePage({ params: Promise.resolve({ id }) })

describe("pet detail page ownership", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getMascotaDetalle.mockResolvedValue({ data: pet, error: null })
    notFound.mockImplementation(() => { throw new Error("NOT_FOUND") })
    maybeSingle.mockResolvedValue({ data: { id: 12 } })
    getUserRoleContext.mockResolvedValue({ data: { roleId: 2 }, error: null })
    const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle }
    createAdminClient.mockReturnValue({ from: vi.fn().mockReturnValue(query) })
  })

  it("enables editing for a verified admin who does not own the pet", async () => {
    maybeSingle.mockResolvedValue({ data: null })
    getUserRoleContext.mockResolvedValue({ data: { roleId: 1 }, error: null })
    createClient.mockResolvedValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "admin", is_anonymous: false } }, error: null }) } })
    expect((await render()).props).toMatchObject({ isOwner: false, isAdmin: true })
    getUserRoleContext.mockResolvedValue({ data: { roleId: 1 }, error: new Error("role lookup") })
    expect((await render()).props.isAdmin).toBe(false)
  })

  it("checks the authenticated account against the publication owner", async () => {
    createClient.mockResolvedValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "owner", is_anonymous: false } }, error: null }) } })
    expect((await render()).props.isOwner).toBe(true)
    const query = createAdminClient.mock.results[0].value.from.mock.results[0].value
    expect(query.eq).toHaveBeenCalledWith("id", 12)
    expect(query.eq).toHaveBeenCalledWith("propietario_id", "owner")
    maybeSingle.mockResolvedValue({ data: null })
    expect((await render()).props.isOwner).toBe(false)
  })

  it("does not expose owner controls for anonymous users or failed authentication", async () => {
    for (const result of [
      { data: { user: null }, error: null },
      { data: { user: { id: "guest", is_anonymous: true } }, error: null },
      { data: { user: { id: "owner", is_anonymous: false } }, error: new Error("auth failed") },
    ]) {
      createClient.mockResolvedValue({ auth: { getUser: vi.fn().mockResolvedValue(result) } })
      expect((await render()).props.isOwner).toBe(false)
    }
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it("rejects invalid IDs and missing public pets", async () => {
    await expect(render("0")).rejects.toThrow("NOT_FOUND")
    expect(getMascotaDetalle).not.toHaveBeenCalled()
    createClient.mockResolvedValue({})
    getMascotaDetalle.mockResolvedValue({ data: null, error: null })
    await expect(render()).rejects.toThrow("NOT_FOUND")
  })
})
