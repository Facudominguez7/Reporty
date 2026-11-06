import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { buildMascotasSearchHref, BuscadorMascotas } from "./buscador-mascotas"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/reportes",
  useSearchParams: () => new URLSearchParams("vista=mascotas&searchMascota=gato"),
}))

describe("pet search navigation", () => {
  it("matches the incident search field styling with pet-specific accessible copy", () => {
    const html = renderToStaticMarkup(React.createElement(BuscadorMascotas))
    expect(html).toContain('placeholder="Buscar mascotas..."')
    expect(html).toContain('aria-label="Buscar mascotas"')
    expect(html).toContain('value="gato"')
    expect(html).toContain("h-11 rounded-full border-border/70 bg-card/80 pl-11 pr-11 shadow-sm")
    expect(html).toContain('aria-label="Limpiar búsqueda de mascotas"')
  })
  it("uses a separate query key and preserves incident and pet filters while resetting pagination", () => {
    expect(buildMascotasSearchHref("vista=mascotas&search=bache&tipo=gato&estadoMascota=perdida&offset=24", "  collar azul  "))
      .toBe("/reportes?vista=mascotas&search=bache&tipo=gato&estadoMascota=perdida&searchMascota=collar+azul")
  })

  it("clears only pet search and safely encodes query text", () => {
    expect(buildMascotasSearchHref("vista=mascotas&search=bache&searchMascota=viejo&estadoMascota=encontrada&offset=12", "  "))
      .toBe("/reportes?vista=mascotas&search=bache&estadoMascota=encontrada")
    expect(buildMascotasSearchHref("vista=mascotas", "gato&estado=pendiente"))
      .toBe("/reportes?vista=mascotas&searchMascota=gato%26estado%3Dpendiente")
  })
})
