import { beforeEach, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), getClaims: vi.fn(), reports: vi.fn() }))
vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser, getClaims: mocks.getClaims } }),
}))
vi.mock("@/database/queries/reportes/get-reportes", () => ({ getDashboardUserReports: mocks.reports }))
vi.mock("@/components/sign-out-section", async () => {
  const { createElement } = await import("react")
  return { SignOutSection: ({ guest }: { guest: boolean }) => createElement("button", null, guest ? "Cerrar sesión" : "Salir") }
})

vi.mock("@/components/cuenta/eliminar-cuenta-section", async () => {
  const { createElement } = await import("react")
  return { EliminarCuentaSection: () => createElement("button", null, "Eliminar cuenta") }
})

import Page from "./page"

/**
 * Answers getClaims with the user each test configures on getUser, without recording a getUser
 * call: the page reads the verified token claims and only asks Supabase Auth for a guest's
 * pending email.
 */
async function claimsDelUsuarioConfigurado() {
  const respuesta = await mocks.getUser.getMockImplementation()?.()
  const usuario = respuesta?.data?.user
  return usuario
    ? {
        data: { claims: { sub: usuario.id, is_anonymous: usuario.is_anonymous, user_metadata: usuario.user_metadata ?? {} } },
        error: null,
      }
    : { data: null, error: null }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getClaims.mockImplementation(claimsDelUsuarioConfigurado)
  mocks.reports.mockResolvedValue({ data: [] })
})

it("reads a permanent account from the token without calling Supabase Auth", async () => {
  mocks.getUser.mockResolvedValue({ data: { user: { id: "account", is_anonymous: false } } })

  await Page({ searchParams: Promise.resolve({}) })

  expect(mocks.getClaims).toHaveBeenCalledTimes(1)
  expect(mocks.getUser).not.toHaveBeenCalled()
  expect(mocks.reports).toHaveBeenCalledWith("account")
})

it("still shows a guest the email it asked to link, read from Supabase Auth", async () => {
  mocks.getUser.mockResolvedValue({ data: { user: { id: "guest", is_anonymous: true, new_email: "vecino@example.com" } } })

  const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }))

  expect(mocks.getUser).toHaveBeenCalledTimes(1)
  expect(html).toContain("Enviamos un enlace a vecino@example.com")
})

it("asks a converted account to create its password from the token metadata", async () => {
  mocks.getUser.mockResolvedValue({
    data: { user: { id: "account", is_anonymous: false, user_metadata: { password_pending: true } } },
  })

  const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }))

  expect(html).toContain("contraseña")
  expect(mocks.getUser).not.toHaveBeenCalled()
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

it("offers account deletion only to guests, after sign-out", async () => {
  mocks.getUser.mockResolvedValue({ data: { user: { id: "guest", is_anonymous: true } } })
  const guestHtml = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }))
  expect(guestHtml).toContain("Eliminar cuenta")
  expect(guestHtml.indexOf("Cerrar sesión")).toBeLessThan(guestHtml.indexOf("Eliminar cuenta"))

  mocks.getUser.mockResolvedValue({ data: { user: { id: "account", is_anonymous: false } } })
  const accountHtml = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }))
  expect(accountHtml).not.toContain("Eliminar cuenta")
})
