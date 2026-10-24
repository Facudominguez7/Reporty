import { describe, expect, it, vi } from "vitest"

const { createClient, createAdminClient } = vi.hoisted(() => ({
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
}))

vi.mock("@/utils/supabase/server", () => ({ createClient }))
vi.mock("@/utils/supabase/admin", () => ({ createAdminClient }))

import { crearReporteAction } from "./actions"

describe("crearReporteAction", () => {
  it("rejects a location outside the municipalities before creating a client", async () => {
    const formData = new FormData()
    formData.set("titulo", "Bache en la calle")
    formData.set("descripcion", "El bache está frente a la plaza.")
    formData.set("categoriaId", "1")
    formData.set("prioridadId", "1")
    formData.set("lat", "-27.32")
    formData.set("lon", "-55.89")
    formData.set("submissionId", "e1a3f644-9c40-4a40-9000-000000000001")

    await expect(crearReporteAction(formData)).resolves.toEqual({
      success: false,
      error: "La ubicación debe estar dentro de Posadas, Garupá o Candelaria.",
    })
    expect(createClient).not.toHaveBeenCalled()
    expect(createAdminClient).not.toHaveBeenCalled()
  })
})
