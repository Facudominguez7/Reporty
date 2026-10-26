import { AuthApiError, AuthRetryableFetchError, AuthWeakPasswordError } from "@supabase/supabase-js"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { crearContrasenaCuenta, login, signup, solicitarRecuperacionContrasena, vincularCorreoInvitado } from "./actions"

const mocks = vi.hoisted(() => ({
  signUp: vi.fn(),
  signInWithPassword: vi.fn(),
  getUser: vi.fn(),
  updateUser: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
}))

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-host": "reporty.com.ar", "x-forwarded-proto": "https" }),
}))
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }))
vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      signUp: mocks.signUp,
      signInWithPassword: mocks.signInWithPassword,
      getUser: mocks.getUser,
      updateUser: mocks.updateUser,
      resetPasswordForEmail: mocks.resetPasswordForEmail,
    },
  }),
}))

const signupForm = (overrides: Record<string, string> = {}) => {
  const form = new FormData()
  const fields = {
    name: "Ana",
    lastname: "Pérez",
    email: "ana@example.com",
    password: "secreta123",
    confirm_password: "secreta123",
    next: "/reportes/nuevo",
    ...overrides,
  }
  for (const [key, value] of Object.entries(fields)) form.set(key, value)
  return form
}

const loginForm = () => {
  const form = new FormData()
  form.set("email", "ana@example.com")
  form.set("password", "secreta123")
  form.set("next", "/reportes/nuevo")
  return form
}

describe("email schema consumers", () => {
  beforeEach(() => vi.resetAllMocks())

  it.each([vincularCorreoInvitado, solicitarRecuperacionContrasena])("rejects malformed email before provider calls", async (action) => {
    const form = new FormData(); form.set("email", "not-an-email")
    expect(await action(undefined, form)).toEqual({ error: "Ingresá un correo electrónico válido." })
    expect(mocks.getUser).not.toHaveBeenCalled()
    expect(mocks.updateUser).not.toHaveBeenCalled()
    expect(mocks.resetPasswordForEmail).not.toHaveBeenCalled()
  })

  it("preserves recovery email normalization and callback", async () => {
    mocks.resetPasswordForEmail.mockResolvedValue({ error: null })
    const form = new FormData(); form.set("email", "  ANA@Example.COM  ")
    expect(await solicitarRecuperacionContrasena(undefined, form)).toEqual({ message: "Si existe una cuenta con ese correo, te enviamos un enlace para crear una nueva contraseña. Abrilo desde este mismo navegador." })
    expect(mocks.resetPasswordForEmail).toHaveBeenCalledExactlyOnceWith("ana@example.com", { redirectTo: "https://reporty.com.ar/auth/callback?next=%2Fauth%2Fnueva-contrasena" })
  })
})

const apiError = (message: string, status: number, code: string) => new AuthApiError(message, status, code)

describe("signup", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.spyOn(console, "error").mockImplementation(() => {})
  })

  it("sends the confirmation link back through the callback to the requested page", async () => {
    mocks.signUp.mockResolvedValueOnce({ data: { session: null, user: { id: "u1" } }, error: null })

    await signup(undefined, signupForm())

    expect(mocks.signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "ana@example.com",
        password: "secreta123",
        options: expect.objectContaining({
          emailRedirectTo: "https://reporty.com.ar/auth/callback?next=%2Freportes%2Fnuevo",
        }),
      }),
    )
  })

  it("asks to confirm the email when Supabase does not open a session", async () => {
    mocks.signUp.mockResolvedValueOnce({ data: { session: null, user: { id: "u1" } }, error: null })

    await expect(signup(undefined, signupForm())).resolves.toEqual({
      message:
        "Te enviamos un correo de confirmación. Revisa tu bandeja de entrada y sigue el enlace para activar tu cuenta.",
    })
    expect(mocks.redirect).not.toHaveBeenCalled()
  })

  it("opens the requested page when the account starts signed in", async () => {
    mocks.signUp.mockResolvedValueOnce({ data: { session: { access_token: "t" }, user: { id: "u1" } }, error: null })

    await signup(undefined, signupForm())

    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout")
    expect(mocks.redirect).toHaveBeenCalledWith("/reportes/nuevo")
  })

  it("rejects mismatched passwords without calling Supabase", async () => {
    await expect(signup(undefined, signupForm({ confirm_password: "otra" }))).resolves.toEqual({
      error: "Las contraseñas no coinciden",
    })
    expect(mocks.signUp).not.toHaveBeenCalled()
  })

  it.each([
    [apiError("User already registered", 422, "user_already_exists"), "Ya existe una cuenta con ese correo. Iniciá sesión o recuperá tu contraseña."],
    [apiError("Email exists", 422, "email_exists"), "Ya existe una cuenta con ese correo. Iniciá sesión o recuperá tu contraseña."],
    [apiError("Unable to validate email address: invalid format", 400, "email_address_invalid"), "Ingresá un correo electrónico válido."],
    [apiError("email rate limit exceeded", 429, "over_email_send_rate_limit"), "Enviamos demasiados correos. Probá de nuevo en unos minutos."],
    [apiError("Error sending confirmation email", 500, "unexpected_failure"), "No pudimos crear tu cuenta. Intentá nuevamente."],
    [new AuthRetryableFetchError("fetch failed", 0), "No pudimos crear tu cuenta. Intentá nuevamente."],
  ])("shows a Spanish message instead of %s", async (error, message) => {
    mocks.signUp.mockResolvedValueOnce({ data: { session: null, user: null }, error })

    await expect(signup(undefined, signupForm())).resolves.toEqual({ error: message })
    expect(mocks.redirect).not.toHaveBeenCalled()
  })
})

const weakPassword = (message: string, reasons: string[]) => new AuthWeakPasswordError(message, 422, reasons)
const missingCharacters =
  "Password should contain at least one character of each: abcdefghijklmnopqrstuvwxyz, ABCDEFGHIJKLMNOPQRSTUVWXYZ, 0123456789."

describe("weak password feedback", () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it.each([
    ["too short", weakPassword("Password should be at least 8 characters.", ["length"]), "La contraseña debe tener al menos 8 caracteres."],
    ["missing character types", weakPassword(missingCharacters, ["characters"]), "La contraseña debe incluir minúsculas, mayúsculas y números."],
    [
      "found in a leak",
      weakPassword("Password is known to be weak and easy to guess, please choose a different one.", ["pwned"]),
      "Esa contraseña aparece en filtraciones conocidas. Elegí otra.",
    ],
    [
      "short and missing character types",
      weakPassword("Password should be at least 8 characters.", ["length", "characters"]),
      "La contraseña debe tener al menos 8 caracteres. Combiná letras, números y símbolos.",
    ],
    ["without a known reason", weakPassword("Password is weak", []), "Elegí una contraseña más segura."],
    ["with an unknown reason", weakPassword("Password is weak", ["new_rule"]), "Elegí una contraseña más segura."],
  ])("explains a %s password on sign up", async (_case, error, message) => {
    mocks.signUp.mockResolvedValueOnce({ data: { session: null, user: null }, error })

    await expect(signup(undefined, signupForm())).resolves.toEqual({ error: message })
  })

  it("explains a weak password when setting the account password", async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: { id: "u1", email: "ana@example.com", is_anonymous: false } }, error: null })
    mocks.updateUser.mockResolvedValueOnce({
      data: { user: null },
      error: weakPassword("Password should be at least 8 characters.", ["length"]),
    })
    const form = new FormData()
    form.set("password", "corta12")
    form.set("confirm_password", "corta12")

    await expect(crearContrasenaCuenta(undefined, form)).resolves.toEqual({
      error: "La contraseña debe tener al menos 8 caracteres.",
    })
    expect(mocks.redirect).not.toHaveBeenCalled()
  })
})

describe("login", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.spyOn(console, "error").mockImplementation(() => {})
  })

  it("opens the requested page after a successful sign in", async () => {
    mocks.signInWithPassword.mockResolvedValueOnce({ data: {}, error: null })

    await login(undefined, loginForm())

    expect(mocks.signInWithPassword).toHaveBeenCalledWith({ email: "ana@example.com", password: "secreta123" })
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout")
    expect(mocks.redirect).toHaveBeenCalledWith("/reportes/nuevo")
  })

  it.each([
    [apiError("Invalid login credentials", 400, "invalid_credentials"), "El correo o la contraseña no son correctos."],
    [apiError("Email not confirmed", 400, "email_not_confirmed"), "Primero confirmá tu correo desde el enlace que te enviamos."],
    [apiError("Request rate limit reached", 429, "over_request_rate_limit"), "Hiciste demasiados intentos. Probá de nuevo en unos minutos."],
    [new AuthRetryableFetchError("fetch failed", 0), "No pudimos iniciar sesión. Intentá nuevamente."],
  ])("shows a Spanish message instead of %s", async (error, message) => {
    mocks.signInWithPassword.mockResolvedValueOnce({ data: {}, error })

    await expect(login(undefined, loginForm())).resolves.toEqual({ error: message })
    expect(mocks.redirect).not.toHaveBeenCalled()
  })
})
