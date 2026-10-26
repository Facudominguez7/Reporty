import { AuthRetryableFetchError, AuthSessionMissingError } from "@supabase/supabase-js"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { signout } from "./actions"

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  signOut: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock("next/headers", () => ({ headers: vi.fn() }))
vi.mock("next/navigation", () => ({ redirect: vi.fn() }))
vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser, signOut: mocks.signOut } }),
}))

const signedInUser = { id: "user-1", is_anonymous: false }
const guestUser = { id: "guest-1", is_anonymous: true }
const outage = () => new AuthRetryableFetchError("Service unavailable", 503)

const userResult = (user: object | null, error: Error | null = null) => ({ data: { user }, error })

describe("signout", () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it("closes the session on every device and refreshes the layout", async () => {
    mocks.getUser.mockResolvedValueOnce(userResult(signedInUser))
    mocks.signOut.mockResolvedValueOnce({ error: null })

    await expect(signout()).resolves.toEqual({ ok: true })
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "global" })
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout")
  })

  it("signs out an anonymous identity after the user confirms", async () => {
    mocks.getUser.mockResolvedValueOnce(userResult(guestUser))
    mocks.signOut.mockResolvedValueOnce({ error: null })

    await expect(signout()).resolves.toEqual({ ok: true })
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "global" })
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout")
  })

  it("does not sign out when the session cannot be checked, since it may belong to a guest", async () => {
    mocks.getUser.mockResolvedValueOnce(userResult(null, outage()))

    await expect(signout()).resolves.toEqual({ ok: false, reason: "failed" })
    expect(mocks.signOut).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it("still succeeds when there is no session to close", async () => {
    mocks.getUser.mockResolvedValueOnce(userResult(null, new AuthSessionMissingError()))
    mocks.signOut.mockResolvedValueOnce({ error: null })

    await expect(signout()).resolves.toEqual({ ok: true })
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "global" })
  })

  it("succeeds when the sign-out errors after the session was already invalidated", async () => {
    mocks.getUser
      .mockResolvedValueOnce(userResult(signedInUser))
      .mockResolvedValueOnce(userResult(null, new AuthSessionMissingError()))
    mocks.signOut.mockResolvedValueOnce({ error: outage() })

    await expect(signout()).resolves.toEqual({ ok: true })
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout")
  })

  it("fails when the sign-out errors and the session is still active", async () => {
    mocks.getUser.mockResolvedValueOnce(userResult(signedInUser)).mockResolvedValueOnce(userResult(signedInUser))
    mocks.signOut.mockResolvedValueOnce({ error: outage() })

    await expect(signout()).resolves.toEqual({ ok: false, reason: "failed" })
  })

  it("fails when Supabase is down and the session state cannot be confirmed", async () => {
    mocks.getUser.mockResolvedValueOnce(userResult(signedInUser)).mockResolvedValueOnce(userResult(null, outage()))
    mocks.signOut.mockResolvedValueOnce({ error: outage() })

    await expect(signout()).resolves.toEqual({ ok: false, reason: "failed" })
  })
})
