import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  signOut: vi.fn(),
  createAdminClient: vi.fn(() => ({ servicio: true })),
  eliminarCuenta: vi.fn(),
  getUserRoleContext: vi.fn(),
  revalidatePath: vi.fn(),
}))
vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser, signOut: mocks.signOut } }),
}))
vi.mock("@/utils/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock("@/lib/use-cases/cuenta/eliminar-cuenta", () => ({ eliminarCuentaWorkflow: mocks.eliminarCuenta }))
vi.mock("@/lib/authz/roles", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/authz/roles")>()),
  getUserRoleContext: mocks.getUserRoleContext,
}))

import { CONFIRMACION_ELIMINAR_CUENTA } from "@/lib/cuenta/eliminacion"
import { eliminarCuentaAction } from "./actions"

describe("eliminarCuentaAction", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUser.mockResolvedValue({ data: { user: { id: "u1", is_anonymous: false } } })
    mocks.getUserRoleContext.mockResolvedValue({ data: { roleId: 2 }, error: null })
    mocks.eliminarCuenta.mockResolvedValue({ success: true, data: { archivosEliminados: 2, archivosConError: 0 } })
    mocks.signOut.mockResolvedValue({ error: null })
  })

  it("la palabra de confirmación es ELIMINAR", () => {
    expect(CONFIRMACION_ELIMINAR_CUENTA).toBe("ELIMINAR")
  })

  it("exige escribir la confirmación exacta antes de borrar", async () => {
    expect(await eliminarCuentaAction("eliminar ya")).toEqual({
      success: false,
      error: "Escribí ELIMINAR para confirmar.",
    })
    expect(mocks.eliminarCuenta).not.toHaveBeenCalled()
  })

  it("acepta la confirmación sin importar mayúsculas ni espacios", async () => {
    expect(await eliminarCuentaAction("  eliminar ")).toEqual({ success: true })
  })

  it("exige una sesión", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } })

    expect(await eliminarCuentaAction("ELIMINAR")).toEqual({
      success: false,
      error: "Tenés que iniciar sesión para eliminar tu cuenta.",
    })
    expect(mocks.eliminarCuenta).not.toHaveBeenCalled()
  })

  it("rechaza a los administradores sin llegar a la base", async () => {
    mocks.getUserRoleContext.mockResolvedValue({ data: { roleId: 1 }, error: null })

    expect(await eliminarCuentaAction("ELIMINAR")).toEqual({
      success: false,
      error: "Las cuentas de administrador no se pueden eliminar desde la app.",
    })
    expect(mocks.eliminarCuenta).not.toHaveBeenCalled()
  })

  it("borra la cuenta de la sesión actual con el cliente de servicio y limpia la sesión", async () => {
    expect(await eliminarCuentaAction("ELIMINAR")).toEqual({ success: true })

    expect(mocks.eliminarCuenta).toHaveBeenCalledWith({ servicio: true }, "u1")
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" })
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout")
  })

  it("también permite eliminar una cuenta de invitado", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "g1", is_anonymous: true } } })
    mocks.getUserRoleContext.mockResolvedValue({ data: { roleId: 5 }, error: null })

    expect(await eliminarCuentaAction("ELIMINAR")).toEqual({ success: true })
    expect(mocks.eliminarCuenta).toHaveBeenCalledWith({ servicio: true }, "g1")
  })

  it("devuelve el error del caso de uso y no cierra la sesión", async () => {
    mocks.eliminarCuenta.mockResolvedValue({ success: false, error: "No pudimos eliminar tu cuenta." })

    expect(await eliminarCuentaAction("ELIMINAR")).toEqual({ success: false, error: "No pudimos eliminar tu cuenta." })
    expect(mocks.signOut).not.toHaveBeenCalled()
  })

  it("si limpiar la sesión falla, la cuenta igual se informa como eliminada", async () => {
    mocks.signOut.mockRejectedValue(new Error("sin sesión"))

    expect(await eliminarCuentaAction("ELIMINAR")).toEqual({ success: true })
  })
})
