/** Contratos de acciones: errores seguros y revalidación solo tras éxito. */
import { beforeEach, expect, it, vi } from "vitest"
const dobles = vi.hoisted(() => ({ ejecutar: vi.fn(), editar: vi.fn(), auth: vi.fn(), procesar: vi.fn(), conciliar: vi.fn(), revalidar: vi.fn(), createClient: vi.fn() }))
vi.mock("@/lib/moderation/administracion.server", () => ({ ejecutarRevision: dobles.ejecutar, editarMascotaAdministrativamente: dobles.editar, autorizarAdministracion: dobles.auth, conciliarAvisoMascotaAdministrativamente: dobles.conciliar }))
vi.mock("@/lib/moderation/avisos-mascotas.server", () => ({ procesarAvisosMascota: dobles.procesar }))
vi.mock("next/cache", () => ({ revalidatePath: dobles.revalidar }))
vi.mock("@/utils/supabase/server", () => ({ createClient: dobles.createClient }))
import { cambiarEstadoMascotaAdminAction, conciliarAvisoMascotaAction, editarMascotaAction, reintentarAvisosMascotaAction, retirarMascotaAdminAction, revisarImagenAction } from "./actions"
beforeEach(() => { vi.clearAllMocks(); dobles.auth.mockResolvedValue({ servicio: {} }) })
it("éxito revalida administración y lectores sin estado municipal", async () => {
  dobles.ejecutar.mockResolvedValue({ exito: true, mensaje: "Listo", reporteId: 7 })
  await revisarImagenAction("id", "aprobar")
  expect(dobles.ejecutar).toHaveBeenCalledWith("id", "aprobar")
  expect(dobles.revalidar.mock.calls.map(([ruta]) => ruta)).toEqual(["/dashboard/moderacion", "/reportes/7", "/mapa", "/reportes", "/mis-reportes", "/dashboard", "/", "/sitemap.xml"])
})
it("edición exitosa revalida las rutas de mascota", async () => {
  dobles.editar.mockResolvedValue({ exito: true, mascotaId: 12, mensaje: "Listo" })
  expect(await editarMascotaAction({ id: 12, tipoAnimal: "gato", descripcion: "Actualizada", lat: 1, lon: 2, telefono: "555", estado: "perdida" })).toMatchObject({ exito: true })
  expect(dobles.editar).toHaveBeenCalledOnce()
  expect(dobles.revalidar.mock.calls.map(([ruta]) => ruta)).toEqual(["/dashboard/moderacion", "/mascotas/12", "/mapa", "/reportes", "/sitemap.xml"])
})
it("mantiene aviso incierto visible y no afirma reenvío fuera de la ventana", async () => {
  dobles.procesar.mockResolvedValue("conciliacion")
  expect(await reintentarAvisosMascotaAction(12)).toMatchObject({ exito: false, mensaje: expect.stringContaining("no se reenviará automáticamente") })
  expect(dobles.auth).toHaveBeenCalledOnce()
  dobles.conciliar.mockResolvedValue(true)
  expect(await conciliarAvisoMascotaAction(7)).toMatchObject({ exito: true, mensaje: expect.stringContaining("no se envió otro correo") })
  expect(dobles.conciliar).toHaveBeenCalledWith(7)
})
it("conflicto o denegación no revalida ni filtra excepción", async () => {
  dobles.ejecutar.mockResolvedValueOnce({ exito: false, mensaje: "Otro administrador decidió." })
  expect(await revisarImagenAction("id", "rechazar")).toMatchObject({ exito: false })
  dobles.ejecutar.mockRejectedValueOnce(new Error("credencial secreta"))
  expect(await revisarImagenAction("id", "rechazar")).toEqual({ exito: false, mensaje: "No se pudo completar la operación. Verificá tus permisos y actualizá la cola." })
  expect(dobles.revalidar).not.toHaveBeenCalled()
})
it("rechaza estados inválidos y retira usando solo el RPC moderado", async () => {
  expect((await cambiarEstadoMascotaAdminAction(1, "retirada")).exito).toBe(false)
  const rpc = vi.fn().mockResolvedValue({ data: true, error: null }); dobles.createClient.mockResolvedValue({ rpc })
  expect(await retirarMascotaAdminAction(12)).toMatchObject({ exito: true, mascotaId: 12 })
  expect(dobles.auth).toHaveBeenCalled()
  expect(rpc).toHaveBeenCalledWith("retirar_mascota_moderacion", { p_mascota_id: 12 })
})
