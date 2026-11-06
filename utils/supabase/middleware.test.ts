import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { updateSession } from "./middleware"

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  getSession: vi.fn(),
  signOut: vi.fn(),
  perfil: vi.fn(),
  from: vi.fn(),
}))

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getUser: mocks.getUser, getSession: mocks.getSession, signOut: mocks.signOut },
    from: mocks.from,
  }),
}))

const request = (path: string) => new NextRequest(new URL(path, "http://localhost:3000"))

describe("updateSession without a session", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321")
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon")
    mocks.getUser.mockReset().mockResolvedValue({ data: { user: null } })
  })

  it("lets visitors open a report detail instead of sending them to /auth", async () => {
    const response = await updateSession(request("/reportes/67"))

    expect(response.headers.get("location")).toBeNull()
    expect(response.headers.get("x-middleware-next")).toBe("1")
  })

  it("keeps the public pages open", async () => {
    for (const path of ["/reportes", "/mapa", "/mis-reportes"]) {
      const response = await updateSession(request(path))

      expect(response.headers.get("location")).toBeNull()
    }
  })

  it("still sends visitors to /auth for the dashboard and for a new report without the guest choice", async () => {
    for (const path of ["/dashboard", "/reportes/nuevo"]) {
      const response = await updateSession(request(path))

      expect(response.status).toBe(307)
      expect(response.headers.get("location")).toBe(`http://localhost:3000/auth?next=${encodeURIComponent(path)}`)
    }
  })

  it("lets a visitor who chose to report as a guest open the new report form", async () => {
    const response = await updateSession(request("/reportes/nuevo?modo=invitado"))

    expect(response.headers.get("location")).toBeNull()
  })
})

const HORA = 60 * 60 * 1000
const DIA = 24 * HORA

/** Arma un access token sin firma cuyo claim amr indica cuándo se autenticó el usuario. */
const tokenAutenticadoHace = (ms: number) => {
  const payload = { amr: [{ method: "password", timestamp: Math.floor((Date.now() - ms) / 1000) }] }
  return `e30.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.firma`
}

describe("updateSession with an expiring session", () => {
  /** Simula un usuario con sesión iniciada hace `ms` y el rol indicado en `profiles`. */
  const conSesion = ({ ms, rolId, anonimo = false }: { ms: number; rolId: number | null; anonimo?: boolean }) => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "u1", is_anonymous: anonimo, last_sign_in_at: new Date(Date.now() - ms).toISOString() } },
    })
    mocks.getSession.mockResolvedValue({ data: { session: { access_token: tokenAutenticadoHace(ms) } } })
    mocks.perfil.mockResolvedValue(
      rolId === null ? { data: null, error: { message: "fallo" } } : { data: { rol_id: rolId }, error: null },
    )
  }

  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321")
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon")
    mocks.getUser.mockReset()
    mocks.getSession.mockReset()
    mocks.signOut.mockReset().mockResolvedValue({ error: null })
    mocks.perfil.mockReset()
    mocks.from.mockReset().mockImplementation(() => ({
      select: () => ({ eq: () => ({ single: mocks.perfil }) }),
    }))
  })

  it("signs out a citizen after 30 days and sends them to /auth from the dashboard", async () => {
    conSesion({ ms: 31 * DIA, rolId: 2 })

    const response = await updateSession(request("/dashboard"))

    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" })
    expect(response.status).toBe(307)
    expect(response.headers.get("location")).toBe(`http://localhost:3000/auth?next=${encodeURIComponent("/dashboard")}`)
  })

  it("keeps a citizen signed in before 30 days", async () => {
    conSesion({ ms: 29 * DIA, rolId: 2 })

    const response = await updateSession(request("/dashboard"))

    expect(mocks.signOut).not.toHaveBeenCalled()
    expect(response.headers.get("location")).toBeNull()
  })

  it("signs out an admin after 24 hours", async () => {
    conSesion({ ms: 25 * HORA, rolId: 1 })

    const response = await updateSession(request("/admin"))

    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" })
    expect(response.headers.get("location")).toBe(`http://localhost:3000/auth?next=${encodeURIComponent("/admin")}`)
  })

  it("keeps an admin signed in before 24 hours without an extra profile read for the expiry", async () => {
    conSesion({ ms: 23 * HORA, rolId: 1 })

    const response = await updateSession(request("/mapa"))

    expect(mocks.signOut).not.toHaveBeenCalled()
    expect(mocks.from).not.toHaveBeenCalled()
    expect(response.headers.get("location")).toBeNull()
  })

  it("never expires an anonymous session", async () => {
    conSesion({ ms: 90 * DIA, rolId: 5, anonimo: true })

    const response = await updateSession(request("/reportes/nuevo"))

    expect(mocks.signOut).not.toHaveBeenCalled()
    expect(response.headers.get("location")).toBeNull()
  })

  it("applies the admin limit when the role cannot be read", async () => {
    conSesion({ ms: 25 * HORA, rolId: null })

    await updateSession(request("/mapa"))

    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" })
  })

  it("lets an expired visitor keep browsing public pages without a session", async () => {
    conSesion({ ms: 31 * DIA, rolId: 2 })

    const response = await updateSession(request("/mapa"))

    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" })
    expect(response.headers.get("location")).toBeNull()
    expect(response.headers.get("x-middleware-next")).toBe("1")
  })
})
