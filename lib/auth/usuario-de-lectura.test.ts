import type { SupabaseClient } from "@supabase/supabase-js"
import { describe, expect, it, vi } from "vitest"

import { obtenerUsuarioDeLectura, sesionVigenteEnAuth, usuarioDesdeClaims } from "./usuario-de-lectura"

/** Arma un cliente falso cuyo `getClaims` responde con el resultado indicado. */
const clienteCon = (getClaims: () => Promise<unknown>) => {
  const getUser = vi.fn()
  const cliente = { auth: { getClaims: vi.fn(getClaims), getUser } } as unknown as SupabaseClient
  return { cliente, getUser }
}

describe("usuarioDesdeClaims", () => {
  it("builds the user from the verified token claims", () => {
    expect(
      usuarioDesdeClaims({
        sub: "u1",
        email: "vecino@example.com",
        is_anonymous: false,
        user_metadata: { password_pending: true, email_verified: true },
        app_metadata: { provider: "email" },
      }),
    ).toEqual({
      id: "u1",
      email: "vecino@example.com",
      is_anonymous: false,
      user_metadata: { password_pending: true, email_verified: true },
      app_metadata: { provider: "email" },
      correo_confirmado: true,
    })
  })

  it("treats an email as unconfirmed unless Supabase Auth marked it verified", () => {
    expect(usuarioDesdeClaims({ sub: "u1", email: "a@example.com" })?.correo_confirmado).toBe(false)
    expect(usuarioDesdeClaims({ sub: "u1", user_metadata: { email_verified: "true" } })?.correo_confirmado).toBe(false)
    expect(usuarioDesdeClaims({ sub: "g1", is_anonymous: true, user_metadata: { email_verified: true } })?.correo_confirmado).toBe(false)
  })

  it("marks guests as anonymous and leaves them without an email", () => {
    const usuario = usuarioDesdeClaims({ sub: "g1", email: "", is_anonymous: true })

    expect(usuario?.is_anonymous).toBe(true)
    expect(usuario?.email).toBeUndefined()
    expect(usuario?.user_metadata).toEqual({})
  })

  it("returns null when the token does not identify a user", () => {
    expect(usuarioDesdeClaims(null)).toBeNull()
    expect(usuarioDesdeClaims({ sub: "" })).toBeNull()
    expect(usuarioDesdeClaims({ role: "anon" })).toBeNull()
  })
})

describe("sesionVigenteEnAuth", () => {
  /** Arma un cliente falso cuyo `getUser` responde con el resultado indicado. */
  const clienteConAuth = (getUser: () => Promise<unknown>) =>
    ({ auth: { getUser: vi.fn(getUser) } }) as unknown as SupabaseClient

  it("confirms the session when Supabase Auth returns the same user", async () => {
    expect(await sesionVigenteEnAuth(clienteConAuth(async () => ({ data: { user: { id: "u1" } }, error: null })), "u1")).toBe(true)
  })

  it("rejects a revoked session or a different user", async () => {
    expect(await sesionVigenteEnAuth(clienteConAuth(async () => ({ data: { user: null }, error: { message: "revoked" } })), "u1")).toBe(false)
    expect(await sesionVigenteEnAuth(clienteConAuth(async () => ({ data: { user: { id: "u2" } }, error: null })), "u1")).toBe(false)
  })

  it("rejects the session when Supabase Auth cannot be reached", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    expect(await sesionVigenteEnAuth(clienteConAuth(async () => { throw new Error("network") }), "u1")).toBe(false)
    error.mockRestore()
  })
})

describe("obtenerUsuarioDeLectura", () => {
  it("reads the user from getClaims without calling Supabase Auth", async () => {
    const { cliente, getUser } = clienteCon(async () => ({
      data: { claims: { sub: "u1", email: "vecino@example.com", is_anonymous: false } },
      error: null,
    }))

    const usuario = await obtenerUsuarioDeLectura(cliente)

    expect(usuario?.id).toBe("u1")
    expect(getUser).not.toHaveBeenCalled()
  })

  it("treats a missing session as a visitor", async () => {
    const { cliente } = clienteCon(async () => ({ data: null, error: null }))

    expect(await obtenerUsuarioDeLectura(cliente)).toBeNull()
  })

  it("treats a token that fails verification as a visitor", async () => {
    const { cliente } = clienteCon(async () => ({ data: null, error: { message: "invalid JWT" } }))

    expect(await obtenerUsuarioDeLectura(cliente)).toBeNull()
  })

  it("treats an error while loading the keys as a visitor", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    const { cliente } = clienteCon(async () => {
      throw new Error("jwks unavailable")
    })

    expect(await obtenerUsuarioDeLectura(cliente)).toBeNull()
    error.mockRestore()
  })
})
