/** Verifica la frontera de página y el render sin rutas privadas. */
import { beforeEach, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
const dobles = vi.hoisted(() => ({ listar: vi.fn(), redirigir: vi.fn((ruta: string) => { throw new Error(ruta) }) }))
vi.mock("@/lib/moderation/administracion.server", () => ({ listarImagenesAdministrativas: dobles.listar }))
vi.mock("next/navigation", () => ({ redirect: dobles.redirigir, useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock("./actions", () => ({ revisarImagenAction: vi.fn() }))
import Pagina, { dynamic, revalidate, metadata } from "./page"
beforeEach(() => vi.clearAllMocks())
it.each([401, 403])("denegación %s no renderiza cola", async (estado) => {
  dobles.listar.mockRejectedValue({ estado })
  await expect(Pagina({ searchParams: Promise.resolve({}) })).rejects.toThrow(estado === 401 ? "/auth" : "/dashboard")
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
