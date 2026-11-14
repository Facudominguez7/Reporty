import { beforeEach, describe, expect, it, vi } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"

import { eliminarCuentaWorkflow } from "./eliminar-cuenta"

type Archivo = { bucket: string; path: string }

/**
 * Cliente de servicio falso: responde la RPC y registra qué archivos se borran por bucket.
 */
function crearServicio(rpc: { data: Archivo[] | null; error: { message: string } | null }, errorStorage = false) {
  const removidos: Record<string, string[][]> = {}
  const servicio = {
    rpc: vi.fn(async () => rpc),
    storage: {
      from: vi.fn((bucket: string) => ({
        remove: vi.fn(async (paths: string[]) => {
          ;(removidos[bucket] ??= []).push(paths)
          return errorStorage ? { data: null, error: { message: "caido" } } : { data: [], error: null }
        }),
      })),
    },
  }
  return { servicio: servicio as unknown as SupabaseClient & typeof servicio, removidos }
}

describe("eliminarCuentaWorkflow", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {})
  })

  it("borra la cuenta con la RPC y después los archivos agrupados por bucket", async () => {
    const { servicio, removidos } = crearServicio({
      data: [
        { bucket: "reportes", path: "10/a" },
        { bucket: "reportes-pendientes", path: "u1/x" },
        { bucket: "reportes", path: "10/a-miniatura" },
      ],
      error: null,
    })

    const resultado = await eliminarCuentaWorkflow(servicio, "u1")

    expect(resultado).toEqual({ success: true, data: { archivosEliminados: 3, archivosConError: 0 } })
    expect(servicio.rpc).toHaveBeenCalledWith("eliminar_cuenta_usuario", { p_usuario: "u1" })
    expect(removidos).toEqual({
      reportes: [["10/a", "10/a-miniatura"]],
      "reportes-pendientes": [["u1/x"]],
    })
  })

  it("borra los archivos en tandas de 100", async () => {
    const data = Array.from({ length: 205 }, (_, i) => ({ bucket: "reportes", path: `p/${i}` }))
    const { servicio, removidos } = crearServicio({ data, error: null })

    await eliminarCuentaWorkflow(servicio, "u1")

    expect(removidos.reportes.map((tanda) => tanda.length)).toEqual([100, 100, 5])
  })

  it("si falla el Storage la cuenta igual queda eliminada y se informa cuántos archivos quedaron", async () => {
    const { servicio } = crearServicio({ data: [{ bucket: "reportes", path: "10/a" }], error: null }, true)

    const resultado = await eliminarCuentaWorkflow(servicio, "u1")

    expect(resultado).toEqual({ success: true, data: { archivosEliminados: 0, archivosConError: 1 } })
    expect(console.error).toHaveBeenCalled()
  })

  it("no toca el Storage si la RPC falla", async () => {
    const { servicio } = crearServicio({ data: null, error: { message: "boom" } })

    const resultado = await eliminarCuentaWorkflow(servicio, "u1")

    expect(resultado).toEqual({ success: false, error: "No pudimos eliminar tu cuenta. Probá de nuevo en unos minutos." })
    expect(servicio.storage.from).not.toHaveBeenCalled()
  })

  it("explica que un administrador no puede eliminar su cuenta desde la app", async () => {
    const { servicio } = crearServicio({ data: null, error: { message: "administrador_no_eliminable" } })

    const resultado = await eliminarCuentaWorkflow(servicio, "admin")

    expect(resultado).toEqual({
      success: false,
      error: "Las cuentas de administrador no se pueden eliminar desde la app.",
    })
  })
})
