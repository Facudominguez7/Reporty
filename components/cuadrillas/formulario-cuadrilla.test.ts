import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), createAdminClient: vi.fn(), crear: vi.fn(), actualizar: vi.fn(), revalidate: vi.fn() }))
vi.mock("@/utils/supabase/server", () => ({ createClient: mocks.createClient }))
vi.mock("@/utils/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }))
vi.mock("@/lib/use-cases/cuadrillas", () => ({ crearCuadrillaWorkflow: mocks.crear, actualizarCuadrillaWorkflow: mocks.actualizar }))
vi.mock("@/lib/use-cases/reportes", () => ({ mutationErrorMessage: (_error: unknown, fallback: string) => fallback }))

import { actualizarCuadrillaAction, crearCuadrillaAction } from "../../app/dashboard/cuadrillas/actions"
import { resolverFormularioCuadrilla, valoresInicialesFormularioCuadrilla } from "./formulario-cuadrilla"

const options = { fields: {}, shouldUseNativeValidation: false }

beforeEach(() => {
  vi.resetAllMocks()
  mocks.createClient.mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: "actor" } } }) } })
  mocks.createAdminClient.mockReturnValue({ fixture: true })
  mocks.crear.mockResolvedValue({ success: true, data: { id: 7 } })
  mocks.actualizar.mockResolvedValue({ success: true, data: { id: 7 } })
})

describe("actual crew form resolver and Server Action boundary", () => {
  it("returns normal field errors and rejects invalid data without external work", async () => {
    const input = { nombre: "ab", descripcion: "", telefono: "" }
    const result = await resolverFormularioCuadrilla(input, undefined, options)
    expect(result.values).toEqual({})
    expect(result.errors).toEqual({ nombre: { message: "El nombre debe tener al menos 3 caracteres.", type: "too_small", ref: undefined } })
    for (const action of [crearCuadrillaAction, (datos: unknown) => actualizarCuadrillaAction(7, datos)]) {
      expect(await action(input)).toEqual({ success: false, error: "El nombre debe tener al menos 3 caracteres." })
    }
    expect(mocks.createClient).not.toHaveBeenCalled()
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
    expect(mocks.crear).not.toHaveBeenCalled()
    expect(mocks.actualizar).not.toHaveBeenCalled()
    expect(mocks.revalidate).not.toHaveBeenCalled()
  })

  for (const mode of ["create", "edit"] as const) {
    it.each(["", "   ", "  contenido  "])(`${mode}: hands raw optional input to the action, which normalizes it once (%j)`, async (optional) => {
      const initial = mode === "edit" ? { nombre: "Cuadrilla anterior", descripcion: null, telefono: null } : undefined
      const defaults = valoresInicialesFormularioCuadrilla(initial)
      expect(defaults).toEqual({ nombre: initial?.nombre ?? "", descripcion: "", telefono: "" })
      const input = { ...defaults, nombre: "  CVE Zod 20261026-1756  ", descripcion: optional, telefono: optional }
      const result = await resolverFormularioCuadrilla(input, undefined, options)
      expect(result.errors).toEqual({})
      // Both actions parse schema INPUT again: passing the resolver's null OUTPUT would fail.
      const response = mode === "create" ? await crearCuadrillaAction(result.values) : await actualizarCuadrillaAction(7, result.values)
      expect(response).toEqual({ success: true, data: { id: 7 } })
      expect(result.values).toEqual(input)
      const normalized = { nombre: "CVE Zod 20261026-1756", descripcion: optional.trim() || null, telefono: optional.trim() || null }
      if (mode === "create") {
        expect(mocks.crear).toHaveBeenCalledExactlyOnceWith({ fixture: true }, "actor", normalized)
        expect(mocks.actualizar).not.toHaveBeenCalled()
      } else {
        expect(mocks.actualizar).toHaveBeenCalledExactlyOnceWith({ fixture: true }, "actor", 7, normalized)
        expect(mocks.crear).not.toHaveBeenCalled()
      }
      expect(mocks.createClient).toHaveBeenCalledTimes(1)
      expect(mocks.createAdminClient).toHaveBeenCalledTimes(1)
      expect(mocks.revalidate).toHaveBeenCalledExactlyOnceWith("/dashboard/cuadrillas")
    })
  }
})
