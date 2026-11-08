import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  effects: [] as Array<() => void>,
  setChecking: vi.fn(),
  getUser: vi.fn(),
  replace: vi.fn(),
  next: "/mascotas/nueva",
}))

vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(),
  useState: (initial: unknown) => [initial, initial === true ? mocks.setChecking : vi.fn()],
  useRef: (value: unknown) => ({ current: value }),
  useCallback: (fn: unknown) => fn,
  useEffect: (fn: () => void) => { mocks.effects.push(fn) },
  useActionState: (_action: unknown, initial: unknown) => [initial, vi.fn(), false],
}))
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams({ next: mocks.next }) }))
vi.mock("@/utils/supabase/client", () => ({ createClient: () => ({ auth: { getUser: mocks.getUser } }) }))
vi.mock("./actions", () => ({ login: vi.fn(), signup: vi.fn(), iniciarSesionOAuth: vi.fn() }))

import AuthPage from "./page"

async function checkSession() {
  AuthPage()
  mocks.effects.at(-1)!()
  await vi.waitFor(() => expect(mocks.getUser).toHaveBeenCalled())
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe("auth session redirect", () => {
  afterEach(() => vi.unstubAllGlobals())
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.effects.length = 0
    mocks.next = "/mascotas/nueva"
    vi.stubGlobal("window", { location: { replace: mocks.replace } })
  })

  it("shows authentication instead of sending a guest back to pet creation", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { is_anonymous: true } }, error: null })
    await checkSession()
    expect(mocks.replace).not.toHaveBeenCalled()
    expect(mocks.setChecking).toHaveBeenCalledWith(false)
  })

  it("returns registered users to pet creation", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { is_anonymous: false } }, error: null })
    await checkSession()
    expect(mocks.replace).toHaveBeenCalledWith("/mascotas/nueva")
  })

  it("preserves guest redirects for other destinations", async () => {
    mocks.next = "/reportes/nuevo"
    mocks.getUser.mockResolvedValue({ data: { user: { is_anonymous: true } }, error: null })
    await checkSession()
    expect(mocks.replace).toHaveBeenCalledWith("/reportes/nuevo")
  })

  it.each(["missing", "error", "rejected"])("ends loading for %s session", async (state) => {
    if (state === "rejected") mocks.getUser.mockRejectedValue(new Error("unavailable"))
    else mocks.getUser.mockResolvedValue({ data: { user: state === "error" ? { is_anonymous: false } : null }, error: state === "error" ? new Error("unavailable") : null })
    await checkSession()
    expect(mocks.replace).not.toHaveBeenCalled()
    expect(mocks.setChecking).toHaveBeenCalledWith(false)
  })
})
