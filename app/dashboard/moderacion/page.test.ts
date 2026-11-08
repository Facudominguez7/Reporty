/** Verifica la frontera de página y el render sin rutas privadas. */
import { beforeEach, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
const dobles = vi.hoisted(() => ({ listar: vi.fn(), redirigir: vi.fn((ruta: string) => { throw new Error(ruta) }) }))
vi.mock("@/lib/moderation/administracion.server", () => ({ listarImagenesAdministrativas: dobles.listar }))
vi.mock("next/navigation", () => ({ redirect: dobles.redirigir, useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock("./actions", () => ({ revisarImagenAction: vi.fn(), reintentarAvisosMascotaAction: vi.fn(), conciliarAvisoMascotaAction: vi.fn(), editarMascotaAction: vi.fn() }))
import Pagina, { dynamic, revalidate, metadata } from "./page"
beforeEach(() => vi.clearAllMocks())
it.each([401, 403])("denegación %s no renderiza cola", async (estado) => {
  dobles.listar.mockRejectedValue({ estado })
  await expect(Pagina({ searchParams: Promise.resolve({}) })).rejects.toThrow(estado === 401 ? "/auth" : "/dashboard")
})
it.each([false, true])("retiro sin enlace al detalle; conciliación=%s sin email", async (conciliacion) => {
  dobles.listar.mockResolvedValue([{ id: "solicitud", reporteId: 7, decision: "REJECTED", estado: "rechazada", motivos: ["Rechazo"], fecha: "2026-01-01", cargaPendiente: false, aviso: { estado: "reclamado", intentos: 2, conciliacion } }])
  const html = renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({ terminales: "1" }) }))
  expect(html).toContain("retirado")
  expect(html).not.toContain('href="/reportes/7"')
  expect(html).not.toContain("/api/moderacion/imagenes/solicitud")
  expect(html).toContain(conciliacion ? "Confirmar aceptación verificada en Resend" : "Reintentar advertencia al autor")
  expect(html).not.toContain(conciliacion ? "Reintentar advertencia al autor" : "Confirmar aceptación verificada en Resend")
  expect(html).not.toContain("@ejemplo")
})
it("muestra conciliación de mascota, clave verificable y no revela destinatario ni token", async () => {
  dobles.listar.mockResolvedValue([{ id: "mascota-12", mascotaId: 12, reporteId: 0, decision: "APPROVED", estado: "publicada", motivos: [], fecha: "2026-01-01", cargaPendiente: false, esReemplazo: false, tipo: "mascota", mascota: { id: 12, tipoAnimal: "perro", descripcion: "Perdida", lat: -34, lon: -56, telefono: "555", estado: "encontrada" }, avisoMascota: { id: 45, estado: "conciliacion", conciliacion: true, intentos: 2, primerIntentoAt: "2026-01-01T00:00:00Z", conciliadoAt: null } }])
  const html = renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({}) }))
  expect(html).toContain("aceptación incierta; requiere verificación manual, no se reenvía")
  expect(html).toContain("mascota/45")
  expect(html).toContain("Registrar aceptación verificada, sin reenviar")
  expect(html).not.toContain("destinatario@")
  expect(html).not.toContain("secreto-token")
})
it("página dinámica no indexable con preview exclusivamente autenticado", async () => {
  dobles.listar.mockResolvedValue([{ id: "solicitud", reporteId: 7, decision: "REVIEW", estado: "pendiente", motivos: ["Revisión necesaria"], fecha: "2026-01-01", cargaPendiente: false }])
  const html = renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({ pagina: "0" }) }))
  expect(html).toContain("/api/moderacion/imagenes/solicitud")
  expect(html).not.toMatch(/reportes-pendientes|sha256|path_privado/)
  expect(html).toContain("Rechazar"); expect(html).toContain("Aprobar")
  expect(dynamic).toBe("force-dynamic"); expect(revalidate).toBe(0)
  expect(metadata.robots).toEqual({ index: false, follow: false })
})
