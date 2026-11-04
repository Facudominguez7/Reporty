/**
 * Pruebas de la política compartida de verificación Turnstile: cuándo se exige el challenge,
 * cuándo la operación falla cerrada y cuándo el token lo rechaza Siteverify.
 */
import { afterEach, describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))

import { verificarCaptchaDeAccion, type ResultadoVerificacionCaptcha } from "./turnstile-guard.server"

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"
// Secretos de prueba oficiales de Cloudflare, sin guión, tal como están documentados.
const SECRETO_PRUEBA = "1x0000000000000000000000000000000AA"
const MENSAJE_CAPTCHA_NO_DISPONIBLE =
  "La verificación de seguridad no está disponible en este momento. Por seguridad no podemos procesar el formulario; si el problema continúa, contactá a la administración de Reporty."

/** Respuesta controlada de Siteverify: ninguna prueba resuelve un challenge real. */
function siteverify(overrides: Record<string, unknown> = {}) {
  const llamada = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({ success: true, hostname: "reporty.com.ar", action: "comentar_reporte", "error-codes": [], ...overrides }),
      { status: 200 },
    ),
  )
  vi.stubGlobal("fetch", llamada)
  return llamada
}

/** Configuración completa de Turnstile (site key pública y secreto). */
function configurar() {
  vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "1x00000000000000000000AA")
  vi.stubEnv("TURNSTILE_SECRET_KEY", SECRETO_PRUEBA)
  vi.stubEnv("TURNSTILE_ALLOWED_HOSTNAMES", "reporty.com.ar")
}

/** La operación protegida que usa el guard: publicar un aporte en un reporte. */
function comentario(token: string | null = "tok-comentario-1234") {
  return verificarCaptchaDeAccion({ token, expectedAction: "comentar_reporte" })
}

/** Extrae el tipo del resultado para aserciones legibles sobre el rechazo. */
function rechazo(resultado: ResultadoVerificacionCaptcha) {
  if (resultado.ok) throw new Error("La verificación debía rechazarse")
  return resultado
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe("verificarCaptchaDeAccion", () => {
  it("acepta un token válido verificado con la action que espera el servidor", async () => {
    configurar()
    const llamada = siteverify()

    await expect(comentario()).resolves.toEqual({ ok: true })
    expect(llamada).toHaveBeenCalledOnce()
    const [url, opciones] = llamada.mock.calls[0]
    expect(url).toBe(SITEVERIFY_URL)
    expect(opciones.body.get("secret")).toBe(SECRETO_PRUEBA)
    expect(opciones.body.get("response")).toBe("tok-comentario-1234")
  })

  it("rechaza un token faltante antes de llamar a Siteverify", async () => {
    configurar()
    const llamada = siteverify()

    const resultado = rechazo(await comentario(null))

    expect(resultado).toMatchObject({ tipo: "rechazada", motivo: "token_invalido" })
    expect(llamada).not.toHaveBeenCalled()
  })

  it("rechaza un token inválido o reutilizado informando el motivo de Siteverify", async () => {
    configurar()
    siteverify({ success: false, "error-codes": ["timeout-or-duplicate"] })

    const resultado = rechazo(await comentario("tok-reutilizado"))

    expect(resultado).toMatchObject({ tipo: "rechazada", motivo: "token_invalido" })
    expect(resultado.mensaje).toBe("La verificación falló o venció. Completá la verificación y volvé a intentarlo.")
  })

  it("rechaza un token emitido para otra action", async () => {
    configurar()
    siteverify({ action: "crear_reporte" })

    expect(rechazo(await comentario())).toMatchObject({ tipo: "rechazada", motivo: "action_incorrecta" })
  })

  it("fuera de producción sin site key omite la verificación que el formulario no puede mostrar", async () => {
    vi.stubEnv("NODE_ENV", "development")
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "")
    vi.stubEnv("TURNSTILE_SECRET_KEY", "")
    const llamada = siteverify()

    await expect(comentario(null)).resolves.toEqual({ ok: true })
    expect(llamada).not.toHaveBeenCalled()
  })

  it("en producción sin site key falla cerrada aunque el token venga vacío", async () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "")
    vi.stubEnv("TURNSTILE_SECRET_KEY", "")
    const llamada = siteverify()

    const resultado = rechazo(await comentario(null))

    expect(resultado).toEqual({ ok: false, tipo: "no_disponible", mensaje: MENSAJE_CAPTCHA_NO_DISPONIBLE })
    expect(llamada).not.toHaveBeenCalled()
  })

  it("falla cerrada cuando existe site key pero falta el secreto, también fuera de producción", async () => {
    vi.stubEnv("NODE_ENV", "development")
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "1x00000000000000000000AA")
    vi.stubEnv("TURNSTILE_SECRET_KEY", "")
    const llamada = siteverify()

    const resultado = rechazo(await comentario())

    expect(resultado).toMatchObject({ tipo: "no_disponible", mensaje: MENSAJE_CAPTCHA_NO_DISPONIBLE })
    expect(llamada).not.toHaveBeenCalled()
  })

  it("no consulta Siteverify cuando falta la lista de hostnames permitidos", async () => {
    configurar()
    vi.stubEnv("TURNSTILE_ALLOWED_HOSTNAMES", "")
    const llamada = siteverify()

    expect(rechazo(await comentario())).toMatchObject({ tipo: "rechazada", motivo: "configuracion_faltante" })
    expect(llamada).not.toHaveBeenCalled()
  })

  it("informa un rechazo de token reutilizado sin exponer el token en el resultado", async () => {
    configurar()
    siteverify({ success: false, "error-codes": ["timeout-or-duplicate"] })

    const resultado = rechazo(await comentario("tok-secreto-que-no-debe-filtrarse"))

    expect(JSON.stringify(resultado)).not.toContain("tok-secreto-que-no-debe-filtrarse")
  })

  it("expone el mismo texto de verificación no disponible que el widget", async () => {
    const widget = await import("../../components/turnstile-widget")
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "")
    vi.stubEnv("TURNSTILE_SECRET_KEY", "")

    const resultado = rechazo(await comentario(null))

    expect(resultado.mensaje).toBe(widget.MENSAJE_CAPTCHA_NO_DISPONIBLE)
  })
})
