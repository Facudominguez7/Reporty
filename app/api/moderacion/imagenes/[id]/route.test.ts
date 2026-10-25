/** Contrato HTTP real del proxy privado, sin Storage ni sesiones reales. */
import { beforeEach, expect, it, vi } from "vitest"
const dobles = vi.hoisted(() => ({ obtener: vi.fn() }))
vi.mock("@/lib/moderation/administracion.server", () => ({ obtenerImagenPrivada: dobles.obtener }))
import { GET } from "./route"
beforeEach(() => vi.clearAllMocks())
it.each([401, 403, 404, 400])("error %s no revela existencia y prohíbe caché", async (estado) => {
  dobles.obtener.mockRejectedValue({ estado })
  const respuesta = await GET(new Request("http://localhost/api/moderacion/imagenes/x"), { params: Promise.resolve({ id: "x" }) })
  expect(respuesta.status).toBe(estado)
  expect(respuesta.headers.get("Cache-Control")).toBe("private, no-store, max-age=0")
  expect(respuesta.headers.get("X-Content-Type-Options")).toBe("nosniff")
  expect(await respuesta.text()).toBe("Imagen no disponible")
})
it("preview privado WebP nunca redirige a Storage", async () => {
  dobles.obtener.mockResolvedValue(new Uint8Array([1, 2, 3]))
  const respuesta = await GET(new Request("http://localhost/"), { params: Promise.resolve({ id: "id" }) })
  expect(respuesta.status).toBe(200)
  expect(respuesta.headers.get("Content-Type")).toBe("image/webp")
  expect(respuesta.headers.get("Cache-Control")).toContain("no-store")
  expect(respuesta.headers.get("X-Content-Type-Options")).toBe("nosniff")
  expect(respuesta.headers.get("Location")).toBeNull()
})
