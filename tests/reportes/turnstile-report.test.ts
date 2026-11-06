/**
 * Pruebas del flujo de creación de reportes protegido con Turnstile: vinculación de la
 * action entre formulario y servidor, y la espera del token nuevo que necesita un invitado
 * después de consumir el de su sesión anónima.
 */
import { readFileSync } from "node:fs"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { TurnstileRenderOptions } from "../../components/turnstile-widget"

type WidgetModule = typeof import("../../components/turnstile-widget")

/** Importa el widget con una site key controlada; el módulo lee el entorno al importarse. */
const importWidget = async (siteKey = "1x00000000000000000000AA"): Promise<WidgetModule> => {
  vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", siteKey)
  vi.resetModules()
  return import("../../components/turnstile-widget")
}

const callbacks = () => ({ onToken: vi.fn(), onError: vi.fn() })

const fakeTurnstile = () => {
  const render = vi.fn<(container: HTMLElement, options: TurnstileRenderOptions) => string>(() => "widget-1")
  return {
    api: { render, reset: vi.fn<(widgetId: string) => void>(), remove: vi.fn<(widgetId: string) => void>() },
    render,
  }
}

const fakeContainer = () => ({}) as HTMLElement

const actionsSource = () => readFileSync(new URL("../../app/reportes/nuevo/actions.ts", import.meta.url), "utf8")
const pageSource = () => readFileSync(new URL("../../app/reportes/nuevo/page.tsx", import.meta.url), "utf8")

afterEach(() => {
  vi.unstubAllEnvs()
  vi.useRealTimers()
  vi.resetModules()
})

describe("acción Turnstile del envío final", () => {
  it("envía al challenge la action configurada", async () => {
    const { buildTurnstileRenderOptions } = await importWidget()

    const opciones = buildTurnstileRenderOptions({ ...callbacks(), action: "crear_reporte" })

    expect(opciones.action).toBe("crear_reporte")
  })

  it("no envía action cuando no se configura, como necesitan los formularios de autenticación", async () => {
    const { buildTurnstileRenderOptions } = await importWidget()

    expect(buildTurnstileRenderOptions(callbacks())).not.toHaveProperty("action")
  })

  it("monta el challenge con la misma action que el servidor va a verificar", async () => {
    const { startTurnstileChallenge } = await importWidget()
    const { api, render } = fakeTurnstile()

    const challenge = startTurnstileChallenge({
      container: fakeContainer(),
      turnstile: api,
      callbacks: callbacks(),
      action: "crear_reporte",
    })

    expect(render.mock.calls[0]?.[1].action).toBe("crear_reporte")
    challenge.dispose()
  })

  // PRESERVE: los formularios de autenticación no pasan action y su challenge no cambia.
  it("sin action mantiene intactas las opciones que ya usan los formularios de autenticación", async () => {
    const { startTurnstileChallenge } = await importWidget()
    const { api, render } = fakeTurnstile()

    const challenge = startTurnstileChallenge({ container: fakeContainer(), turnstile: api, callbacks: callbacks() })
    const opciones = render.mock.calls[0]?.[1]

    expect(opciones).not.toHaveProperty("action")
    expect(opciones).toMatchObject({
      sitekey: "1x00000000000000000000AA",
      theme: "auto",
      language: "es",
      retry: "auto",
      "refresh-expired": "auto",
    })
    challenge.dispose()
  })
})

describe("createTurnstileTokenFeed", () => {
  it("entrega el token que llega después de pedirlo", async () => {
    const { createTurnstileTokenFeed } = await importWidget()
    const feed = createTurnstileTokenFeed()

    const espera = feed.waitForFreshToken()
    feed.offer("tok-nuevo")

    await expect(espera).resolves.toBe("tok-nuevo")
  })

  it("entrega el token que el challenge ya emitió después de invalidar el consumido", async () => {
    const { createTurnstileTokenFeed } = await importWidget()
    const feed = createTurnstileTokenFeed()

    feed.offer("tok-consumido")
    feed.invalidate()
    feed.offer("tok-nuevo")

    await expect(feed.waitForFreshToken()).resolves.toBe("tok-nuevo")
  })

  it("nunca reutiliza el token que ya se consumió", async () => {
    const { createTurnstileTokenFeed } = await importWidget()
    const feed = createTurnstileTokenFeed()
    feed.offer("tok-consumido")
    feed.invalidate()

    await expect(feed.waitForFreshToken(1_000)).resolves.toBeNull()
  })

  it("entrega cada token una sola vez", async () => {
    const { createTurnstileTokenFeed } = await importWidget()
    const feed = createTurnstileTokenFeed()
    feed.invalidate()
    feed.offer("tok-unico")

    await expect(feed.waitForFreshToken()).resolves.toBe("tok-unico")
    await expect(feed.waitForFreshToken(1_000)).resolves.toBeNull()
  })

  it("no entrega dos veces el token que ya liberó una espera", async () => {
    const { createTurnstileTokenFeed } = await importWidget()
    const feed = createTurnstileTokenFeed()

    const espera = feed.waitForFreshToken()
    feed.offer("tok-entregado")

    await expect(espera).resolves.toBe("tok-entregado")
    await expect(feed.waitForFreshToken(1_000)).resolves.toBeNull()
  })

  it("no completa la espera con un token vencido y vence el plazo sin respuesta", async () => {
    const { createTurnstileTokenFeed } = await importWidget()
    const feed = createTurnstileTokenFeed()

    vi.useFakeTimers()
    const espera = feed.waitForFreshToken(5_000)
    feed.offer(null)
    await vi.advanceTimersByTimeAsync(5_000)

    await expect(espera).resolves.toBeNull()
  })

  it("no le entrega a una espera anterior el token del intento siguiente", async () => {
    const { createTurnstileTokenFeed } = await importWidget()
    const feed = createTurnstileTokenFeed()

    const primerIntento = feed.waitForFreshToken(5_000)
    const segundoIntento = feed.waitForFreshToken(5_000)
    feed.offer("tok-del-segundo")

    await expect(primerIntento).resolves.toBeNull()
    await expect(segundoIntento).resolves.toBe("tok-del-segundo")
  })
})

describe("contrato del envío final con Turnstile", () => {
  it("verifica Siteverify antes de reservar el envío y de procesar la imagen", () => {
    const codigo = actionsSource()
    const verificacion = codigo.indexOf("await verificarCaptchaDeCreacion(formData)")
    const reserva = codigo.indexOf("claimReportSubmission(")

    expect(verificacion).toBeGreaterThan(-1)
    expect(reserva).toBeGreaterThan(-1)
    expect(verificacion).toBeLessThan(reserva)
  })

  it("lee el token del formulario y exige la action de creación", () => {
    const codigo = actionsSource()

    expect(codigo).toContain('formData.get("captcha_token")')
    expect(codigo).toContain("expectedAction: ACCION_CAPTCHA_CREACION")
    expect(codigo).toContain('const ACCION_CAPTCHA_CREACION = "crear_reporte"')
  })

  it("falla cerrada en producción cuando falta la configuración", () => {
    const codigo = actionsSource()

    expect(codigo).toContain('process.env.NODE_ENV === "production"')
    expect(codigo).toContain("MENSAJE_CAPTCHA_NO_DISPONIBLE")
  })

  it("informa el mismo texto de verificación no disponible que el widget", async () => {
    const { MENSAJE_CAPTCHA_NO_DISPONIBLE } = await importWidget()
    const enAcciones = actionsSource().match(/const MENSAJE_CAPTCHA_NO_DISPONIBLE =\s*"([^"]+)"/)?.[1]

    expect(enAcciones).toBe(MENSAJE_CAPTCHA_NO_DISPONIBLE)
  })

  it("pide la verificación también a las cuentas registradas y vinculada a la action", () => {
    const codigo = pageSource()

    expect(codigo).toContain("const needsCaptcha = TURNSTILE_CONFIGURADO")
    expect(codigo).toContain('const ACCION_CAPTCHA_CREACION = "crear_reporte"')
    expect(codigo).toContain("action={ACCION_CAPTCHA_CREACION}")
    expect(codigo).toContain('payload.set("captcha_token"')
  })

  it("anuncia cuando la verificación no está disponible en vez de enviar sin protección", () => {
    const codigo = pageSource()

    expect(codigo).toContain("const captchaNoDisponible = TURNSTILE_NO_DISPONIBLE")
    expect(codigo).toContain("{captchaNoDisponible && (")
    expect(codigo).toContain("MENSAJE_CAPTCHA_NO_DISPONIBLE")
  })

  it("el invitado pide un token nuevo después de consumir el de su sesión anónima", () => {
    const codigo = pageSource()
    const inicio = codigo.indexOf("const ensureGuestSession = async () => {")
    const invitado = codigo.slice(inicio, codigo.indexOf("const handleResultDialogOpenChange"))

    expect(invitado).toContain("signInAnonymously")
    expect(invitado.indexOf("requestNewCaptcha()")).toBeLessThan(invitado.indexOf("setUser(data.user)"))
    expect(codigo).toContain("await captchaFeed.waitForFreshToken()")
  })

  it("reinicia el challenge en cada token consumido y conserva el formulario ante un fallo", () => {
    const codigo = pageSource()

    expect(codigo).toMatch(
      /const requestNewCaptcha = \(\) => \{[\s\S]*?captchaFeed\.invalidate\(\)[\s\S]*?setCaptchaToken\(null\)[\s\S]*?setCaptchaResetSignal\(\(signal\) => signal \+ 1\)[\s\S]*?\n {2}\}/,
    )

    const inicioFallo = codigo.indexOf("if (!result.success) {")
    const fallo = codigo.slice(inicioFallo, inicioFallo + 400)
    expect(fallo).toContain("requestNewCaptcha()")
    expect(fallo).toContain("return")
    expect(fallo).not.toContain("setFormData")
  })

  it("pide un challenge nuevo después de un envío exitoso para que otro reporte no reuse el token", () => {
    const codigo = pageSource()
    const inicioExito = codigo.indexOf("if (!result.success) {")
    const exito = codigo.slice(inicioExito, codigo.indexOf("setShowResultDialog(true)", inicioExito))
    const despuesDelFallo = exito.slice(exito.search(/return\r?\n      }/))

    expect(despuesDelFallo).toContain("requestNewCaptcha()")
  })
})
