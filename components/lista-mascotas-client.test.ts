import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { expect, it, vi } from "vitest"

const search = vi.hoisted(() => ({ query: "vista=mascotas&tipo=gato&estadoMascota=Encontrada&searchMascota=collar" }))
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(search.query) }))
import { ListaMascotasClient } from "./lista-mascotas-client"

it("passes all active pet filters into each detail link", () => {
  const html = renderToStaticMarkup(createElement(ListaMascotasClient, {
    initialPets: [{
      id: 12, title: "Gato encontrado", description: "Collar azul", type: "Gato", status: "Encontrada",
      createdAt: "2026-11-01T12:00:00Z", image: "",
    }], initialHasMore: false,
  }))
  expect(html).toContain('href="/mascotas/12?returnTo=%2Freportes%3Fvista%3Dmascotas%26tipo%3Dgato%26estadoMascota%3DEncontrada%26searchMascota%3Dcollar"')
})
