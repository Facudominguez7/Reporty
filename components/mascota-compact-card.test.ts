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
  expect(html).toContain("Perro perdido")
  expect(html).toContain("Collar rojo")
  expect(html).toContain("Perdida")
  expect(html).toContain("1/11/2026")
  expect(html).toContain("%2Fapi%2Fmascotas%2F12%2Ffoto")
  expect(html).not.toMatch(/prioridad|categoría/i)
})

it.each([["Perdida", "bg-destructive"], ["Encontrada", "bg-primary"]] as const)("styles %s status with its theme color", (status, color) => {
  const html = renderToStaticMarkup(createElement(MascotaCompactCard, { pet: {
    id: 12, title: "Perro", description: "Collar rojo", type: "Perro", status,
    createdAt: "2026-11-01T12:00:00Z", image: "",
  } }))
  expect(html).toMatch(new RegExp(`class="[^"]*${color}[^"]*">${status}</span>`))
})
