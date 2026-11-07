import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { expect, it, vi } from "vitest"

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock("next/image", () => ({ default: (props: Record<string, unknown>) => createElement("img", props) }))
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock("@/app/dashboard/moderacion/actions", () => ({ cambiarEstadoMascotaAdminAction: vi.fn(), retirarMascotaAdminAction: vi.fn() }))
import { MascotasAdminTable } from "./mascotas-admin-table"

it("renders each pet as an incident-style card with its photo, state, and detail navigation", () => {
  const html = renderToStaticMarkup(createElement(MascotasAdminTable, {
    mascotas: [{ id: 12, tipo_animal: "gato", estado: "perdida", descripcion: "Gata blanca", publicada_at: "2026-11-01T12:00:00Z", retirada_at: null }],
    estados: [{ id: "perdida", nombre: "Perdida" }, { id: "encontrada", nombre: "Encontrada" }],
    tipos: [{ id: "gato", nombre: "Gato" }],
  }))
  expect(html).toContain('role="link"')
  expect(html).toContain('aria-label="Abrir mascota 12"')
  expect(html).toContain('src="/api/mascotas/12/foto"')
  expect(html).toContain("Gata blanca")
  expect(html).toContain('aria-label="Cambiar estado de mascota 12"')
  expect(html).not.toContain("<table")
})
