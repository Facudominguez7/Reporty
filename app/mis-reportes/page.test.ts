import { beforeEach, expect, it, vi } from "vitest"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), reports: vi.fn() }))
vi.mock("@/utils/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser } }) }))
vi.mock("@/database/queries/reportes/get-reportes", () => ({ getDashboardUserReports: mocks.reports }))
vi.mock("@/components/sign-out-section", async () => {
  const { createElement } = await import("react")
  return { SignOutSection: ({ guest }: { guest: boolean }) => createElement("button", null, guest ? "Cerrar sesión" : "Salir") }
})

import Page from "./page"

beforeEach(() => {
  vi.clearAllMocks()
  mocks.reports.mockResolvedValue({ data: [] })
})

it("shows sign-out only on the authenticated guest reports page", async () => {
  mocks.getUser.mockResolvedValue({ data: { user: { id: "guest", is_anonymous: true } } })
  const guestHtml = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }))
  expect(guestHtml).toContain("Cerrar sesión")
  expect(guestHtml.indexOf("Guardar mi cuenta")).toBeLessThan(guestHtml.indexOf("Cerrar sesión"))

  mocks.getUser.mockResolvedValue({ data: { user: { id: "account", is_anonymous: false } } })
  const accountHtml = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }))
  expect(accountHtml).not.toContain("Cerrar sesión")
})
