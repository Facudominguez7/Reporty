import { createElement, type ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { expect, it, vi } from "vitest"

vi.mock("next/link", () => ({ default: ({ href, children, ...props }: { href: string; children: ReactNode }) => createElement("a", { href, ...props }, children) }))
import { AdminReportesTabs } from "./admin-reportes-tabs"

it("switches between incident and pet management in the existing reports section", () => {
  const html = renderToStaticMarkup(createElement(AdminReportesTabs, { selected: "mascotas" }))
  expect(html).toContain('role="tablist" aria-label="Tipo de publicación"')
  expect(html).toContain('href="/admin/reportes"')
  expect(html).toContain('href="/admin/reportes?vista=mascotas"')
  expect(html).toContain('aria-selected="true"')
  expect(html).toContain(">Mascotas</a>")
})
