import { AuthApiError, AuthRetryableFetchError, AuthWeakPasswordError } from "@supabase/supabase-js"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { MENSAJE_CAPTCHA_NO_DISPONIBLE, valoresTrasIntentoFallido } from "../../components/turnstile-widget"
import { TURNSTILE_TEST_SITE_KEY } from "../../tests/auth/constants"
import {
  crearContrasenaCuenta,
  iniciarSesionOAuth,
  login,
  signup,
  solicitarRecuperacionContrasena,
  vincularCorreoInvitado,
} from "./actions"

const mocks = vi.hoisted(() => ({
  signUp: vi.fn(),
  signInWithPassword: vi.fn(),
  signInWithOAuth: vi.fn(),
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
      signInWithOAuth: mocks.signInWithOAuth,
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

/** Minimal FormData for the single-field, recovery and OAuth actions. */
const formWith = (fields: Record<string, string>) => {
  const form = new FormData()
  for (const [key, value] of Object.entries(fields)) form.set(key, value)
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
    expect(mocks.resetPasswordForEmail).toHaveBeenCalledWith("ana@example.com", { redirectTo: "https://reporty.com.ar/auth/callback?next=%2Fauth%2Fnueva-contrasena" })
  })

  it("sends the Turnstile token with the recovery email request", async () => {
    mocks.resetPasswordForEmail.mockResolvedValue({ error: null })
    const form = new FormData(); form.set("email", "ana@example.com"); form.set("captcha_token", "cf-token")

    await solicitarRecuperacionContrasena(undefined, form)

    expect(mocks.resetPasswordForEmail).toHaveBeenCalledWith("ana@example.com", {
      redirectTo: "https://reporty.com.ar/auth/callback?next=%2Fauth%2Fnueva-contrasena",
      captchaToken: "cf-token",
    })
  })

  it("asks to complete the captcha when Supabase rejects it", async () => {
    mocks.resetPasswordForEmail.mockResolvedValue({ error: apiError("Captcha verification failed", 400, "captcha") })
    const form = new FormData(); form.set("email", "ana@example.com"); form.set("captcha_token", "cf-token")

    await expect(solicitarRecuperacionContrasena(undefined, form)).resolves.toEqual({
      error: "Completá la verificación de seguridad e intentá nuevamente.",
    })
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

  it("tells the user the email already has an account when Supabase returns no identities", async () => {
    // Supabase answers a repeated signup of a confirmed email with an obfuscated user and
    // `identities: []`, and sends no email.
    mocks.signUp.mockResolvedValueOnce({
      data: { session: null, user: { id: "u1", identities: [] } },
      error: null,
    })

    await expect(signup(undefined, signupForm())).resolves.toEqual({
      error: "Ese correo ya tiene una cuenta en Reporty. Iniciá sesión o recuperá tu contraseña.",
    })
    expect(mocks.redirect).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it("keeps asking to confirm the email when the new user has an identity", async () => {
    mocks.signUp.mockResolvedValueOnce({
      data: { session: null, user: { id: "u1", identities: [{ id: "i1" }] } },
      error: null,
    })

    await expect(signup(undefined, signupForm())).resolves.toEqual({
      message:
        "Te enviamos un correo de confirmación. Revisa tu bandeja de entrada y sigue el enlace para activar tu cuenta.",
    })
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
    [apiError("Captcha verification failed", 400, "captcha"), "Completá la verificación de seguridad e intentá nuevamente."],
    [new AuthRetryableFetchError("fetch failed", 0), "No pudimos crear tu cuenta. Intentá nuevamente."],
  ])("shows a Spanish message instead of %s", async (error, message) => {
    mocks.signUp.mockResolvedValueOnce({ data: { session: null, user: null }, error })

    await expect(signup(undefined, signupForm())).resolves.toEqual({ error: message })
    expect(mocks.redirect).not.toHaveBeenCalled()
  })

  it("forwards the Turnstile token to Supabase when the form sends one", async () => {
    mocks.signUp.mockResolvedValueOnce({ data: { session: null, user: { id: "u1" } }, error: null })
    const form = signupForm({ captcha_token: "cf-token" })

    await signup(undefined, form)

    expect(mocks.signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({ captchaToken: "cf-token" }),
      }),
    )
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
    [apiError("User is banned", 400, "user_banned"), "Tu usuario está bloqueado. Contactá a la administración para recuperar el acceso."],
    [apiError("Invalid login credentials", 400, "invalid_credentials"), "El correo o la contraseña no son correctos."],
    [apiError("Email not confirmed", 400, "email_not_confirmed"), "Primero confirmá tu correo desde el enlace que te enviamos."],
    [apiError("Request rate limit reached", 429, "over_request_rate_limit"), "Hiciste demasiados intentos. Probá de nuevo en unos minutos."],
    [apiError("Captcha verification failed", 400, "captcha"), "Completá la verificación de seguridad e intentá nuevamente."],
    [new AuthRetryableFetchError("fetch failed", 0), "No pudimos iniciar sesión. Intentá nuevamente."],
  ])("shows a Spanish message instead of %s", async (error, message) => {
    mocks.signInWithPassword.mockResolvedValueOnce({ data: {}, error })

    await expect(login(undefined, loginForm())).resolves.toEqual({ error: message })
    expect(mocks.redirect).not.toHaveBeenCalled()
  })

  // El código `captcha_failed` es el que devuelve Supabase cuando deshabilita el CAPTCHA en
  // el panel o cuando Cloudflare rechaza el token; debe caer en el mismo mensaje que `captcha`.
  it("pide completar la verificación de seguridad cuando el login falla con captcha_failed", async () => {
    mocks.signInWithPassword.mockResolvedValueOnce({
      data: { session: null, user: null },
      error: apiError("Captcha verification failed", 400, "captcha_failed"),
    })

    await expect(login(undefined, loginForm())).resolves.toEqual({
      error: "Completá la verificación de seguridad e intentá nuevamente.",
    })
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
    expect(mocks.redirect).not.toHaveBeenCalled()
    expect(console.error).not.toHaveBeenCalled()
  })

  it("forwards the Turnstile token to Supabase when the form sends one", async () => {
    mocks.signInWithPassword.mockResolvedValueOnce({ data: {}, error: null })
    const form = loginForm()
    form.set("captcha_token", "cf-token")

    await login(undefined, form)

    expect(mocks.signInWithPassword).toHaveBeenCalledWith({
      email: "ana@example.com",
      password: "secreta123",
      options: { captchaToken: "cf-token" },
    })
  })

  it("keeps signing in without a captcha option when the form does not send one", async () => {
    mocks.signInWithPassword.mockResolvedValueOnce({ data: {}, error: null })

    await login(undefined, loginForm())

    expect(mocks.signInWithPassword).toHaveBeenCalledWith({ email: "ana@example.com", password: "secreta123" })
  })
})

/**
 * Turnstile tokens are opaque, short-lived and single use. The server action only forwards
 * plausible tokens, and every protected flow sends its token to exactly one Supabase call
 * so the same challenge is never validated twice.
 */
describe("captcha token forwarding bounds", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.spyOn(console, "error").mockImplementation(() => {})
  })

  const invalidTokens: [string, string][] = [
    ["an empty token", ""],
    ["an oversized token", "x".repeat(2049)],
  ]

  it.each(invalidTokens)("does not forward %s on login", async (_case, token) => {
    mocks.signInWithPassword.mockResolvedValueOnce({ data: {}, error: null })
    const form = loginForm()
    form.set("captcha_token", token)

    await login(undefined, form)

    expect(mocks.signInWithPassword).toHaveBeenCalledWith({ email: "ana@example.com", password: "secreta123" })
  })

  it.each(invalidTokens)("does not forward %s on sign up", async (_case, token) => {
    mocks.signUp.mockResolvedValueOnce({ data: { session: null, user: { id: "u1" } }, error: null })

    await signup(undefined, signupForm({ captcha_token: token }))

    expect(mocks.signUp).toHaveBeenCalledWith(
      expect.objectContaining({ options: expect.not.objectContaining({ captchaToken: expect.anything() }) }),
    )
  })

  it.each(invalidTokens)("does not forward %s on password recovery", async (_case, token) => {
    mocks.resetPasswordForEmail.mockResolvedValueOnce({ error: null })

    await solicitarRecuperacionContrasena(undefined, formWith({ email: "ana@example.com", captcha_token: token }))

    expect(mocks.resetPasswordForEmail).toHaveBeenCalledWith("ana@example.com", {
      redirectTo: "https://reporty.com.ar/auth/callback?next=%2Fauth%2Fnueva-contrasena",
    })
  })

  it("consumes a login token with a single sign-in request", async () => {
    mocks.signInWithPassword.mockResolvedValueOnce({ data: {}, error: null })

    await login(undefined, formWith({ email: "ana@example.com", password: "secreta123", captcha_token: "cf-token" }))

    expect(mocks.signInWithPassword).toHaveBeenCalledOnce()
    expect(mocks.signUp).not.toHaveBeenCalled()
  })

  it("consumes a recovery token with a single reset request", async () => {
    mocks.resetPasswordForEmail.mockResolvedValueOnce({ error: null })

    await solicitarRecuperacionContrasena(
      undefined,
      formWith({ email: "ana@example.com", captcha_token: "cf-token" }),
    )

    expect(mocks.resetPasswordForEmail).toHaveBeenCalledOnce()
  })
})

describe("guest account email linking", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.spyOn(console, "error").mockImplementation(() => {})
  })

  it("keeps the guest identity and redirect through the callback without captcha options", async () => {
    mocks.getUser.mockResolvedValueOnce({
      data: { user: { id: "guest-1", email: null, is_anonymous: true } },
      error: null,
    })
    mocks.updateUser.mockResolvedValueOnce({ data: { user: { id: "guest-1" } }, error: null })

    const result = await vincularCorreoInvitado(undefined, formWith({ email: "invitado@example.com" }))

    // `updateUser` in @supabase/supabase-js exposes no `captchaToken` option, so the linked
    // email request cannot carry a challenge token. The identity is preserved instead of
    // switching to `signUp`, which would create a different user.
    expect(mocks.updateUser).toHaveBeenCalledWith(
      { email: "invitado@example.com", data: { password_pending: true } },
      { emailRedirectTo: "https://reporty.com.ar/auth/callback?next=%2Fmis-reportes%3Fcuenta%3Dvinculada" },
    )
    expect(mocks.signUp).not.toHaveBeenCalled()
    expect(result.message).toContain("invitado@example.com")
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/mis-reportes")
  })
})

describe("OAuth", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.spyOn(console, "error").mockImplementation(() => {})
  })

  it("starts the Google flow without a captcha token", async () => {
    mocks.signInWithOAuth.mockResolvedValueOnce({ data: { url: "https://accounts.google.com/o/oauth2" }, error: null })

    await iniciarSesionOAuth(formWith({ provider: "google", next: "/reportes/nuevo" }))

    expect(mocks.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: { redirectTo: "https://reporty.com.ar/auth/callback?next=%2Freportes%2Fnuevo" },
    })
    expect(mocks.redirect).toHaveBeenCalledWith("https://accounts.google.com/o/oauth2")
  })

  it("falls back to the auth page error when the provider URL is missing", async () => {
    mocks.signInWithOAuth.mockResolvedValueOnce({ data: { url: null }, error: null })

    await iniciarSesionOAuth(formWith({ provider: "google", next: "/reportes/nuevo" }))

    expect(mocks.redirect).toHaveBeenCalledWith("/auth?error=oauth&next=%2Freportes%2Fnuevo")
  })
})

/**
 * The CAPTCHA is the only thing standing between a script and the auth provider, so a
 * missing Turnstile site key in production must fail closed. Supabase may also be
 * misconfigured (CAPTCHA disabled in the dashboard), so the decision cannot be delegated.
 */
describe("CAPTCHA configuration in production", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.spyOn(console, "error").mockImplementation(() => {})
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "")
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("blocks a login sent directly to the server action", async () => {
    await expect(login(undefined, loginForm())).resolves.toEqual({ error: MENSAJE_CAPTCHA_NO_DISPONIBLE })
    expect(mocks.signInWithPassword).not.toHaveBeenCalled()
  })

  it("blocks a sign up sent directly to the server action", async () => {
    await expect(signup(undefined, signupForm())).resolves.toEqual({ error: MENSAJE_CAPTCHA_NO_DISPONIBLE })
    expect(mocks.signUp).not.toHaveBeenCalled()
  })

  it("blocks a password recovery request sent directly to the server action", async () => {
    await expect(solicitarRecuperacionContrasena(undefined, formWith({ email: "ana@example.com" }))).resolves.toEqual({
      error: MENSAJE_CAPTCHA_NO_DISPONIBLE,
    })
    expect(mocks.resetPasswordForEmail).not.toHaveBeenCalled()
  })

  it("keeps the operation working once the site key is configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", TURNSTILE_TEST_SITE_KEY)
    mocks.signInWithPassword.mockResolvedValueOnce({ data: {}, error: null })

    await login(undefined, formWith({ email: "ana@example.com", password: "secreta123", captcha_token: "cf-token" }))

    expect(mocks.signInWithPassword).toHaveBeenCalledWith({
      email: "ana@example.com",
      password: "secreta123",
      options: { captchaToken: "cf-token" },
    })
  })
})

describe("CAPTCHA configuration outside production", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.spyOn(console, "error").mockImplementation(() => {})
    vi.stubEnv("NODE_ENV", "development")
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "")
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("keeps local development working without a site key", async () => {
    mocks.signInWithPassword.mockResolvedValueOnce({ data: {}, error: null })

    await login(undefined, loginForm())

    expect(mocks.signInWithPassword).toHaveBeenCalledWith({ email: "ana@example.com", password: "secreta123" })
  })
})

/**
 * A rejected CAPTCHA must not erase what the person already typed: they only have to solve
 * the challenge again, not the whole form.
 */
describe("signup form values after a failed attempt", () => {
  const typed = { password: "secreta123", confirmPassword: "secreta123" }
  const vacio = { password: "", confirmPassword: "" }

  it.each([
    ["a CAPTCHA failure", { error: "Completá la verificación de seguridad e intentá nuevamente." }],
    ["a mismatched confirmation", { error: "Las contraseñas no coinciden" }],
    ["a weak password", { error: "La contraseña debe tener al menos 8 caracteres." }],
    ["a provider outage", { error: "No pudimos crear tu cuenta. Intentá nuevamente." }],
  ])("keeps the typed passwords after %s", (_case, state) => {
    expect(valoresTrasIntentoFallido(state, typed, vacio)).toEqual(typed)
  })

  it("clears the passwords only after the account was created", () => {
    expect(
      valoresTrasIntentoFallido(
        { message: "Te enviamos un correo de confirmación. Revisa tu bandeja de entrada y sigue el enlace para activar tu cuenta." },
        typed,
        vacio,
      ),
    ).toEqual({ password: "", confirmPassword: "" })
  })
})

describe("signup feedback toasts", () => {
  it("announces each attempt once instead of repeating it while the passwords are edited", async () => {
    const { readFileSync } = await import("node:fs")
    const codigo = readFileSync(new URL("./page.tsx", import.meta.url), "utf8")
    const fin = codigo.indexOf("}, [confirmPassword, signupPassword, signupState])")
    const efecto = codigo.slice(codigo.lastIndexOf("useEffect(() => {", fin), fin)
    const guard = efecto.indexOf("if (signupState === lastSignupState.current) return")

    expect(guard).toBeGreaterThan(-1)
    expect(efecto.indexOf("toast.error(signupState.error)")).toBeGreaterThan(guard)
    expect(efecto.indexOf("toast.success(signupState.message)")).toBeGreaterThan(guard)
  })
})
