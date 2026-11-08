import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { expect, it } from "vitest"
import { MascotaCompactCard } from "./mascota-compact-card"

it("renders a pet card with its stable detail link and pet-specific fields", () => {
  const html = renderToStaticMarkup(createElement(MascotaCompactCard, { pet: {
    id: 12, title: "Perro perdido", description: "Collar rojo", type: "Perro", status: "Perdida",
    createdAt: "2026-11-01T12:00:00Z", image: "/api/mascotas/12/foto",
  } }))
  expect(html).toContain('href="/mascotas/12"')
  expect(html).toMatch(/class="[^"]*rounded-full[^"]*"/)
  expect(html).toMatch(/<span data-slot="badge" class="[^"]*bg-\[var\(--pet-type\)\][^"]*">Perro<\/span>/)
  expect(html).toContain("Perro perdido")
  expect(html).toContain("Collar rojo")
  expect(html).toContain("Perdido")
  expect(html).toContain("1/11/2026")
  expect(html).toContain("%2Fapi%2Fmascotas%2F12%2Ffoto")
  expect(html).not.toMatch(/prioridad|categoría/i)
})

it("keeps the selected pet filters in its detail link", () => {
  const returnTo = "/reportes?vista=mascotas&tipo=gato&estadoMascota=Encontrada"
  const html = renderToStaticMarkup(createElement(MascotaCompactCard, { pet: {
    id: 12, title: "Gato encontrado", description: "Collar azul", type: "Gato", status: "Encontrada",
    createdAt: "2026-11-01T12:00:00Z", image: "",
  }, returnTo }))
  expect(html).toContain('href="/mascotas/12?returnTo=%2Freportes%3Fvista%3Dmascotas%26tipo%3Dgato%26estadoMascota%3DEncontrada"')
})

it.each([["Perdida", "Perdido", "bg-destructive"], ["Encontrada", "Encontrado", "bg-primary"]] as const)("styles %s status consistently with its title", (status, label, color) => {
  const html = renderToStaticMarkup(createElement(MascotaCompactCard, { pet: {
    id: 12, title: "Perro", description: "Collar rojo", type: "Perro", status,
    createdAt: "2026-11-01T12:00:00Z", image: "",
  } }))
  expect(html).toMatch(new RegExp(`class="[^"]*${color}[^"]*">${label}</span>`))
})
