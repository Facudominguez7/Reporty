/** Contratos de acciones: errores seguros y revalidación solo tras éxito. */
import { beforeEach, expect, it, vi } from "vitest"
const dobles = vi.hoisted(() => ({ ejecutar: vi.fn(), revalidar: vi.fn() }))
vi.mock("@/lib/moderation/administracion.server", () => ({ ejecutarRevision: dobles.ejecutar }))
vi.mock("next/cache", () => ({ revalidatePath: dobles.revalidar }))
import { revisarImagenAction } from "./actions"
beforeEach(() => vi.clearAllMocks())
it("éxito revalida administración y lectores sin estado municipal", async () => {
  dobles.ejecutar.mockResolvedValue({ exito: true, mensaje: "Listo", reporteId: 7 })
  await revisarImagenAction("id", "aprobar")
  expect(dobles.ejecutar).toHaveBeenCalledWith("id", "aprobar")
  expect(dobles.revalidar.mock.calls.map(([ruta]) => ruta)).toEqual(["/dashboard/moderacion", "/reportes/7", "/mapa", "/reportes", "/mis-reportes", "/dashboard", "/", "/sitemap.xml"])
})
it("conflicto o denegación no revalida ni filtra excepción", async () => {
  dobles.ejecutar.mockResolvedValueOnce({ exito: false, mensaje: "Otro administrador decidió." })
  expect(await revisarImagenAction("id", "rechazar")).toMatchObject({ exito: false })
  dobles.ejecutar.mockRejectedValueOnce(new Error("credencial secreta"))
  expect(await revisarImagenAction("id", "rechazar")).toEqual({ exito: false, mensaje: "No se pudo completar la operación. Verificá tus permisos y actualizá la cola." })
  expect(dobles.revalidar).not.toHaveBeenCalled()
})
