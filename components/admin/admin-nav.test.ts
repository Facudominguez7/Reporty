import { createElement, type ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("next/navigation", () => ({ usePathname: () => "/admin" }))
vi.mock("next/link", () => ({ default: ({ href, children, ...props }: { href: string; children: ReactNode }) => createElement("a", { href, ...props }, children) }))
vi.mock("@/components/sign-out-section", () => ({ SignOutSection: () => null }))

import { AdminNav } from "./admin-nav"
import { ROLE_IDS } from "@/lib/authz/catalog"

describe("AdminNav pending reviews", () => {
  it("shows the count on desktop and mobile only when reviews are pending", () => {
    const html = renderToStaticMarkup(createElement(AdminNav, { email: "admin@example.com", roleId: ROLE_IDS.ADMIN, pendingReviews: 2 }))
    expect(html.match(/aria-label="2 revisiones pendientes"/g)).toHaveLength(2)

    const empty = renderToStaticMarkup(createElement(AdminNav, { email: "admin@example.com", roleId: ROLE_IDS.ADMIN, pendingReviews: 0 }))
    expect(empty).not.toContain("revisiones pendientes")
  })

  it("does not show reviews to other admin-panel roles", () => {
    const html = renderToStaticMarkup(createElement(AdminNav, { email: "operator@example.com", roleId: ROLE_IDS.OPERADOR, pendingReviews: 2 }))
    expect(html).not.toContain("revisiones pendientes")
  })
})
