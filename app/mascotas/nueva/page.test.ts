import { readFileSync } from "node:fs"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { createClient, redirect } = vi.hoisted(() => ({
  createClient: vi.fn(),
  redirect: vi.fn(),
}))

vi.mock("@/utils/supabase/server", () => ({ createClient }))
vi.mock("next/navigation", () => ({ redirect }))
vi.mock("./formulario-mascota", () => ({ FormularioMascota: () => "pet form" }))

import NuevaMascotaPage from "./page"

const registeredUser = { id: "registered", is_anonymous: false }
const guestUser = { id: "guest", is_anonymous: true }
const renderPage = () => Promise.resolve().then(() => NuevaMascotaPage())

function redirectSignal(destination: string): never {
  throw new Error(`REDIRECT:${destination}`)
}

function mockAuth(result: { data?: { user: typeof registeredUser | typeof guestUser | null }; error?: Error | null }, throws?: Error) {
  createClient.mockResolvedValue({
    auth: { getUser: throws ? vi.fn().mockRejectedValue(throws) : vi.fn().mockResolvedValue(result) },
  })
}

describe("NuevaMascotaPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    redirect.mockImplementation(redirectSignal)
  })

  it("redirects visitors without a session directly to auth with the exact return route", async () => {
    mockAuth({ data: { user: null }, error: null })
    await expect(renderPage()).rejects.toThrow("REDIRECT:/auth?next=/mascotas/nueva")
    expect(redirect).toHaveBeenCalledExactlyOnceWith("/auth?next=/mascotas/nueva")
  })

  it("does not treat an anonymous guest session as a registered account", async () => {
    mockAuth({ data: { user: guestUser }, error: null })
    await expect(renderPage()).rejects.toThrow("REDIRECT:/auth?next=/mascotas/nueva")
    expect(redirect).toHaveBeenCalledExactlyOnceWith("/auth?next=/mascotas/nueva")
  })

  it("renders the form for a registered account without redirecting", async () => {
    mockAuth({ data: { user: registeredUser }, error: null })
    await expect(renderPage()).resolves.toMatchObject({ props: {} })
    expect(redirect).not.toHaveBeenCalled()
  })

  it("fails closed and redirects when auth lookup reports or throws an error", async () => {
    mockAuth({ data: { user: registeredUser }, error: new Error("auth lookup failed") })
    await expect(renderPage()).rejects.toThrow("REDIRECT:/auth?next=/mascotas/nueva")
    expect(redirect).toHaveBeenCalledExactlyOnceWith("/auth?next=/mascotas/nueva")

    vi.clearAllMocks()
    redirect.mockImplementation(redirectSignal)
    mockAuth({}, new Error("auth unavailable"))
    await expect(renderPage()).rejects.toThrow("REDIRECT:/auth?next=/mascotas/nueva")
    expect(redirect).toHaveBeenCalledExactlyOnceWith("/auth?next=/mascotas/nueva")
  })

  it("mounts the shared creation form at this route", () => {
    const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8")
    expect(page).toContain('import { FormularioMascota } from "./formulario-mascota"')
    expect(page).toContain("return <FormularioMascota />")
  })
})
