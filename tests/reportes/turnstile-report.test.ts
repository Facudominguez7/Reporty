/**
 * Pruebas del alcance de Turnstile en la creación de reportes: el challenge solo protege la
 * creación de la sesión de invitado y el servidor no verifica ningún token del reporte.
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

describe("alcance de Turnstile en la creación de reportes", () => {
  it("el servidor no verifica ningún token al crear el reporte", () => {
    const codigo = actionsSource()

    expect(codigo).not.toContain("turnstile")
    expect(codigo).not.toContain("captcha_token")
    expect(codigo).not.toContain("verificarCaptcha")
  })

  it("el formulario solo pide la verificación a quien no tiene sesión, para crear la de invitado", () => {
    const codigo = pageSource()

    expect(codigo).toContain("const needsCaptcha = TURNSTILE_CONFIGURADO && !user")
    expect(codigo).toContain("const captchaNoDisponible = TURNSTILE_NO_DISPONIBLE && !user")
    expect(codigo).not.toContain('payload.set("captcha_token"')
    expect(codigo).not.toContain("ACCION_CAPTCHA_CREACION")
  })

  it("el token se usa únicamente en signInAnonymously", () => {
    const codigo = pageSource()
    const inicio = codigo.indexOf("const ensureGuestSession = async () => {")
    const invitado = codigo.slice(inicio, codigo.indexOf("const handleResultDialogOpenChange"))

    expect(invitado).toContain("signInAnonymously")
    expect(invitado).toContain("options: { captchaToken }")
    expect(codigo.match(/captchaToken \}/g)).toHaveLength(1)
  })
})
