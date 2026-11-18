import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { expect, it, vi } from "vitest"

vi.mock("@/components/admin/admin-nav", () => ({ AdminNav: () => null }))

import { AdminDashboardShell } from "./dashboard-shell"
import { ROLE_IDS } from "@/lib/authz/catalog"

const propsDefensoria = {
  email: "staff@example.com",
  roleId: ROLE_IDS.DEFENSORIA,
  pendingReviews: null,
  variante: "defensoria",
  children: "Bandeja de reportes",
} as const

const propsAdmin = {
  email: "admin@example.com",
  roleId: ROLE_IDS.ADMIN,
  pendingReviews: 2,
  children: "Reportes de administración",
}

it("mantiene una sola región principal en Defensoría", () => {
  const panel = createElement(AdminDashboardShell, propsDefensoria)
  const html = renderToStaticMarkup(createElement("main", { id: "main-content" }, panel))

  expect(html.match(/<main\b/g)).toHaveLength(1)
  expect(html).toContain("Bandeja de reportes")
})

it("no reserva espacio para la barra inferior en Defensoría, igual que Admin", () => {
  const html = renderToStaticMarkup(createElement(AdminDashboardShell, propsDefensoria))

  expect(html).not.toContain("pb-[var(--bottom-nav-space)]")
})

it("conserva el contenedor de administración sin espacio para la barra inferior", () => {
  const html = renderToStaticMarkup(createElement(AdminDashboardShell, propsAdmin))

  expect(html).toContain('<main class="mx-auto')
  expect(html).not.toContain("pb-[var(--bottom-nav-space)]")
})
