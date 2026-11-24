import { createElement, type ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("next/navigation", () => ({ usePathname: () => "/admin" }))
vi.mock("next/link", () => ({ default: ({ href, children, ...props }: { href: string; children: ReactNode }) => createElement("a", { href, ...props }, children) }))
vi.mock("@/components/sign-out-section", () => ({ SignOutSection: () => null }))

import { AdminNav } from "./admin-nav"
import { ROLE_IDS } from "@/lib/authz/catalog"

describe("navegación del panel de Defensoría", () => {
  it("muestra Reporty / Defensoría y solo enlaces de reportes", () => {
    const html = renderToStaticMarkup(createElement(AdminNav, { email: "defensoria@example.com", roleId: ROLE_IDS.DEFENSORIA, pendingReviews: null, variante: "defensoria" }))
    expect(html).toContain("/ DEFENSORÍA")
    expect(html).toContain('href="/defensoria"')
    expect(html).toContain(">Reportes<")
    expect(html).not.toContain('href="/admin')
  })

  it("no convierte el rol Defensoría en un rol de administración", () => {
    expect(renderToStaticMarkup(createElement(AdminNav, { email: "defensoria@example.com", roleId: ROLE_IDS.DEFENSORIA, pendingReviews: null }))).toBe("")
  })
})

describe("AdminNav pending reviews", () => {
  it("shows the count on desktop and mobile only when reviews are pending", () => {
    const html = renderToStaticMarkup(createElement(AdminNav, { email: "admin@example.com", roleId: ROLE_IDS.ADMIN, pendingReviews: 2 }))
    expect(html.match(/aria-label="2 revisiones pendientes"/g)).toHaveLength(2)
    expect(html).not.toContain('href="/admin/mascotas"')
    expect(html).toContain('href="/admin/reportes"')

    const empty = renderToStaticMarkup(createElement(AdminNav, { email: "admin@example.com", roleId: ROLE_IDS.ADMIN, pendingReviews: 0 }))
    expect(empty).not.toContain("revisiones pendientes")
  })

  it("does not show reviews to other admin-panel roles", () => {
    const html = renderToStaticMarkup(createElement(AdminNav, { email: "operator@example.com", roleId: ROLE_IDS.OPERADOR, pendingReviews: 2 }))
    expect(html).not.toContain("revisiones pendientes")
  })

  it("muestra Donaciones solo al admin", () => {
    const admin = renderToStaticMarkup(createElement(AdminNav, { email: "admin@example.com", roleId: ROLE_IDS.ADMIN, pendingReviews: 0 }))
    const interesado = renderToStaticMarkup(createElement(AdminNav, { email: "ong@example.com", roleId: ROLE_IDS.INTERESADO, pendingReviews: 0 }))
    expect(admin).toContain('href="/admin/donaciones"')
    expect(interesado).not.toContain('href="/admin/donaciones"')
  })
})
