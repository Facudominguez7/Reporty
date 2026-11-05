import { createElement } from "react"
import { renderToString } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { TurnstileApi, TurnstileRenderOptions } from "../../components/turnstile-widget"
import { TURNSTILE_TEST_SITE_KEY } from "./constants"

type WidgetModule = typeof import("../../components/turnstile-widget")

/**
 * Imports the widget with a controlled site key. The module reads the env var at import
 * time, so each import needs `vi.resetModules()` first.
 */
const importWidget = async (siteKey: string): Promise<WidgetModule> => {
  vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", siteKey)
  vi.resetModules()
  return import("../../components/turnstile-widget")
}

/** Container stand-in: the mounting helper only stores the element and hands it to Turnstile. */
const fakeContainer = () => ({}) as HTMLElement

const fakeTurnstile = () => {
  const render = vi.fn<(container: HTMLElement, options: TurnstileRenderOptions) => string>(() => "widget-1")
  return {
    api: { render, reset: vi.fn<(widgetId: string) => void>(), remove: vi.fn<(widgetId: string) => void>() },
    render,
  }
}

const callbacks = () => ({ onToken: vi.fn(), onError: vi.fn() })

afterEach(() => {
  // Ninguna prueba deja temporizadores falsos activos para las que siguen.
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe("TurnstileWidget", () => {
  it("renders nothing when no site key is configured", async () => {
    const { TurnstileWidget } = await importWidget("")

    const html = renderToString(
      createElement(TurnstileWidget, { onTokenChange: () => {}, resetSignal: 0 }),
    )

    expect(html).toBe("")
  })

  it("renders exactly one challenge container when the site key is set", async () => {
    const { TurnstileWidget } = await importWidget(TURNSTILE_TEST_SITE_KEY)

    const html = renderToString(
      createElement(TurnstileWidget, { onTokenChange: () => {}, resetSignal: 0 }),
    )

    expect(html.match(/data-testid="turnstile-container"/g)).toHaveLength(1)
  })

  it("loads the explicit-rendering script from Cloudflare", async () => {
    const { TURNSTILE_SCRIPT_SRC } = await importWidget(TURNSTILE_TEST_SITE_KEY)

    // `next/script` injects `afterInteractive` scripts from the client, so the URL is
    // asserted on the exported constant rather than on the server-rendered HTML.
    expect(TURNSTILE_SCRIPT_SRC).toBe("https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit")
  })

  it("exposes an accessible live region for the challenge status", async () => {
    const { TurnstileWidget } = await importWidget(TURNSTILE_TEST_SITE_KEY)

    const html = renderToString(
      createElement(TurnstileWidget, { onTokenChange: () => {}, resetSignal: 0 }),
    )

    expect(html).toMatch(/role="status"/)
    expect(html).toMatch(/aria-live="polite"/)
    expect(html).toContain("Verificación de seguridad")
  })
})

describe("buildTurnstileRenderOptions", () => {
  it("uses managed defaults adapted to the theme, in Spanish, with automatic retries", async () => {
    const { buildTurnstileRenderOptions } = await importWidget(TURNSTILE_TEST_SITE_KEY)

    expect(buildTurnstileRenderOptions(callbacks())).toMatchObject({
      sitekey: TURNSTILE_TEST_SITE_KEY,
      theme: "auto",
      language: "es",
      retry: "auto",
      "refresh-expired": "auto",
    })
  })

  it("wires the token, expiry and error callbacks", async () => {
    const { buildTurnstileRenderOptions } = await importWidget(TURNSTILE_TEST_SITE_KEY)
    const { onToken, onError } = callbacks()
    const opciones = buildTurnstileRenderOptions({ onToken, onError })

    opciones.callback("tok")
    opciones["expired-callback"]()
    opciones["error-callback"]("110200")

    expect(onToken.mock.calls).toEqual([["tok"], [null]])
    expect(onError.mock.calls).toEqual([["110200"]])
  })
})

describe("mountTurnstileWidget", () => {
  it("renders the challenge with the given options and returns a handle", async () => {
    const { buildTurnstileRenderOptions, mountTurnstileWidget } = await importWidget(TURNSTILE_TEST_SITE_KEY)
    const container = fakeContainer()
    const { api, render } = fakeTurnstile()
    const opciones = buildTurnstileRenderOptions(callbacks())

    const handle = mountTurnstileWidget({ container, turnstile: api, options: opciones })

    expect(render).toHaveBeenCalledWith(container, opciones)
    expect(handle).not.toBeNull()

    handle?.reset()
    expect(api.reset).toHaveBeenCalledWith("widget-1")

    handle?.remove()
    expect(api.remove).toHaveBeenCalledWith("widget-1")
  })

  it("renders only once on the same container even if the effect runs again", async () => {
    const { buildTurnstileRenderOptions, mountTurnstileWidget } = await importWidget(TURNSTILE_TEST_SITE_KEY)
    const container = fakeContainer()
    const { api, render } = fakeTurnstile()
    const opciones = buildTurnstileRenderOptions(callbacks())

    expect(mountTurnstileWidget({ container, turnstile: api, options: opciones })).not.toBeNull()
    expect(mountTurnstileWidget({ container, turnstile: api, options: opciones })).toBeNull()
    expect(render).toHaveBeenCalledOnce()
  })

  it("renders again on the same container after removal, as client-side navigation needs", async () => {
    const { buildTurnstileRenderOptions, mountTurnstileWidget } = await importWidget(TURNSTILE_TEST_SITE_KEY)
    const container = fakeContainer()
    const { api, render } = fakeTurnstile()
    const opciones = buildTurnstileRenderOptions(callbacks())

    mountTurnstileWidget({ container, turnstile: api, options: opciones })?.remove()
    expect(mountTurnstileWidget({ container, turnstile: api, options: opciones })).not.toBeNull()
    expect(render).toHaveBeenCalledTimes(2)
  })

  it("removes the widget once and ignores later reset or removal calls", async () => {
    const { buildTurnstileRenderOptions, mountTurnstileWidget } = await importWidget(TURNSTILE_TEST_SITE_KEY)
    const container = fakeContainer()
    const { api } = fakeTurnstile()
    const handle = mountTurnstileWidget({
      container,
      turnstile: api,
      options: buildTurnstileRenderOptions(callbacks()),
    })

    handle?.remove()
    handle?.remove()
    handle?.reset()

    expect(api.remove).toHaveBeenCalledOnce()
    expect(api.reset).not.toHaveBeenCalled()
  })

  it("frees the container when Cloudflare cannot render, so a retry can try again", async () => {
    const { buildTurnstileRenderOptions, mountTurnstileWidget } = await importWidget(TURNSTILE_TEST_SITE_KEY)
    const container = fakeContainer()
    const { api, render } = fakeTurnstile()
    const opciones = buildTurnstileRenderOptions(callbacks())
    render.mockImplementationOnce(() => {
      throw new Error("turnstile render failed")
    })

    expect(mountTurnstileWidget({ container, turnstile: api, options: opciones })).toBeNull()
    expect(mountTurnstileWidget({ container, turnstile: api, options: opciones })).not.toBeNull()
    expect(render).toHaveBeenCalledTimes(2)
  })
})

describe("mountTurnstileWidget render failures", () => {
  it("reports a synchronous render failure through the error callback so the form can retry", async () => {
    const { buildTurnstileRenderOptions, mountTurnstileWidget } = await importWidget(TURNSTILE_TEST_SITE_KEY)
    const container = fakeContainer()
    const { api, render } = fakeTurnstile()
    const { onToken, onError } = callbacks()
    render.mockImplementationOnce(() => {
      throw new Error("turnstile render failed")
    })

    const handle = mountTurnstileWidget({
      container,
      turnstile: api,
      options: buildTurnstileRenderOptions({ onToken, onError }),
    })

    expect(handle).toBeNull()
    // Without this notification the widget stays "idle" and the user never sees a retry.
    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith("render_failed"))
    expect(onToken).not.toHaveBeenCalled()
  })

  it("does not report a failure when the challenge renders", async () => {
    const { buildTurnstileRenderOptions, mountTurnstileWidget } = await importWidget(TURNSTILE_TEST_SITE_KEY)
    const { api } = fakeTurnstile()
    const { onError } = callbacks()

    mountTurnstileWidget({
      container: fakeContainer(),
      turnstile: api,
      options: buildTurnstileRenderOptions({ onToken: () => {}, onError }),
    })

    await Promise.resolve()
    expect(onError).not.toHaveBeenCalled()
  })
})

/**
 * A tab switch unmounts the form that owns a widget. The removed widget must invalidate its
 * token and ignore late Cloudflare callbacks, otherwise a stale token stays in the hidden
 * field with the submit button enabled.
 */
describe("createTurnstileSession", () => {
  it("forwards tokens while the widget is mounted", async () => {
    const { createTurnstileSession } = await importWidget(TURNSTILE_TEST_SITE_KEY)
    const { onToken, onError } = callbacks()
    const session = createTurnstileSession({ onToken, onError })

    session.onToken("tok")
    session.onError("110200")

    expect(onToken).toHaveBeenCalledWith("tok")
    expect(onError).toHaveBeenCalledWith("110200")
  })

  it("invalidates the token when the widget is removed", async () => {
    const { createTurnstileSession } = await importWidget(TURNSTILE_TEST_SITE_KEY)
    const { onToken, onError } = callbacks()
    const session = createTurnstileSession({ onToken, onError })

    session.onToken("tok")
    session.dispose()

    expect(onToken.mock.calls).toEqual([["tok"], [null]])
  })

  it("ignores tokens, expiries and errors from a removed widget", async () => {
    const { createTurnstileSession } = await importWidget(TURNSTILE_TEST_SITE_KEY)
    const { onToken, onError } = callbacks()
    const session = createTurnstileSession({ onToken, onError })

    session.dispose()
    session.onToken("late-token")
    session.onError("late-error")

    expect(onToken.mock.calls).toEqual([[null]])
    expect(onError).not.toHaveBeenCalled()
  })

  it("invalidates the token only once when removal is repeated", async () => {
    const { createTurnstileSession } = await importWidget(TURNSTILE_TEST_SITE_KEY)
    const { onToken, onError } = callbacks()
    const session = createTurnstileSession({ onToken, onError })

    session.dispose()
    session.dispose()

    expect(onToken.mock.calls).toEqual([[null]])
  })
})

/**
 * Composition regression: the widget effect mounts the challenge through
 * `startTurnstileChallenge`. Disposing the session while the failed mount is still reporting
 * its error used to swallow the notification, leaving the form idle with no retry.
 */
describe("startTurnstileChallenge", () => {
  it("surfaces a synchronous render failure before the cleanup disposes the session", async () => {
    const { startTurnstileChallenge } = await importWidget(TURNSTILE_TEST_SITE_KEY)
    const { api, render } = fakeTurnstile()
    render.mockImplementationOnce(() => {
      throw new Error("render failed")
    })
    const { onToken, onError } = callbacks()

    const challenge = startTurnstileChallenge({
      container: fakeContainer(),
      turnstile: api,
      callbacks: { onToken, onError },
    })

    expect(challenge.handle).toBeNull()
    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith("render_failed"))

    // Unmount or retry disposes afterwards, and the failure is not reported twice.
    challenge.dispose()
    expect(onError).toHaveBeenCalledOnce()
    expect(onToken.mock.calls).toEqual([[null]])
  })

  it("mounts again after a failure and forwards the new token", async () => {
    const { startTurnstileChallenge } = await importWidget(TURNSTILE_TEST_SITE_KEY)
    const { api, render } = fakeTurnstile()
    render.mockImplementationOnce(() => {
      throw new Error("render failed")
    })
    const { onToken, onError } = callbacks()
    const container = fakeContainer()

    const failed = startTurnstileChallenge({ container, turnstile: api, callbacks: { onToken, onError } })
    expect(failed.handle).toBeNull()
    failed.dispose()

    const retried = startTurnstileChallenge({ container, turnstile: api, callbacks: { onToken, onError } })
    expect(retried.handle).not.toBeNull()

    render.mock.calls.at(-1)?.[1].callback("tok")
    expect(onToken).toHaveBeenCalledWith("tok")

    retried.dispose()
    // The failed attempt disposed first (it never had a token), then the retried one.
    expect(onToken.mock.calls).toEqual([[null], ["tok"], [null]])
  })

  it("invalidates the token and ignores late callbacks after the challenge is disposed", async () => {
    const { startTurnstileChallenge } = await importWidget(TURNSTILE_TEST_SITE_KEY)
    const { api, render } = fakeTurnstile()
    const { onToken, onError } = callbacks()

    const challenge = startTurnstileChallenge({
      container: fakeContainer(),
      turnstile: api,
      callbacks: { onToken, onError },
    })
    const opciones = render.mock.calls[0]?.[1]

    challenge.dispose()
    opciones?.callback("late-token")
    opciones?.["expired-callback"]()
    opciones?.["error-callback"]("late-error")

    expect(onToken.mock.calls).toEqual([[null]])
    expect(onError).not.toHaveBeenCalled()
  })
})

describe("carga compartida del script de Turnstile", () => {
  it("resuelve en seguida cuando la API de Cloudflare ya está cargada", async () => {
    const { esperarApiTurnstile } = await importWidget(TURNSTILE_TEST_SITE_KEY)
    const api = fakeTurnstile().api

    await expect(esperarApiTurnstile({ obtenerApi: () => api })).resolves.toBe(api)
  })

  it("espera a la API cuando el script todavía está cargando", async () => {
    vi.useFakeTimers()
    const { esperarApiTurnstile } = await importWidget(TURNSTILE_TEST_SITE_KEY)
    const api = fakeTurnstile().api
    let cargada: typeof api | undefined
    const espera = esperarApiTurnstile({ obtenerApi: () => cargada })

    await vi.advanceTimersByTimeAsync(500)
    cargada = api
    await vi.advanceTimersByTimeAsync(100)

    await expect(espera).resolves.toBe(api)
    vi.useRealTimers()
  })

  it("devuelve null si la API nunca llega para mostrar el estado no disponible", async () => {
    vi.useFakeTimers()
    const { esperarApiTurnstile, TURNSTILE_SCRIPT_TIMEOUT_MS } = await importWidget(TURNSTILE_TEST_SITE_KEY)
    const espera = esperarApiTurnstile({ obtenerApi: () => undefined })

    await vi.advanceTimersByTimeAsync(TURNSTILE_SCRIPT_TIMEOUT_MS + 100)

    await expect(espera).resolves.toBeNull()
    vi.useRealTimers()
  })

  it("no confía en los callbacks de next/script, que avisan antes de tiempo a un widget montado durante la carga", async () => {
    const { readFileSync } = await import("node:fs")
    const codigo = readFileSync(new URL("../../components/turnstile-widget.tsx", import.meta.url), "utf8")
    const script = codigo.slice(codigo.indexOf("<Script"), codigo.indexOf("/>", codigo.indexOf("<Script")))

    expect(script).not.toContain("onReady")
    expect(script).not.toContain("onLoad")
    expect(codigo).toContain("esperarApiTurnstile({")
  })

  it("deja de consultar la API al cancelar la espera y no resuelve tarde", async () => {
    vi.useFakeTimers()
    const { esperarApiTurnstile, TURNSTILE_SCRIPT_TIMEOUT_MS } = await importWidget(TURNSTILE_TEST_SITE_KEY)
    const control = new AbortController()
    let resultado: TurnstileApi | null | "pendiente" = "pendiente"

    const espera = esperarApiTurnstile({ obtenerApi: () => undefined, signal: control.signal })
    void espera.then((api) => {
      resultado = api
    })

    control.abort()
    // Sin esto, un widget desmontado seguiría consultando `window.turnstile` 20 s más.
    expect(vi.getTimerCount()).toBe(0)

    await vi.advanceTimersByTimeAsync(TURNSTILE_SCRIPT_TIMEOUT_MS + 100)

    // Nadie reacciona a una carga que ya no importa: el estado del formulario no cambia.
    expect(resultado).toBe("pendiente")
    vi.useRealTimers()
  })

  it("acepta una espera ya cancelada sin consultar la API ni dejar temporizadores", async () => {
    vi.useFakeTimers()
    const { esperarApiTurnstile } = await importWidget(TURNSTILE_TEST_SITE_KEY)
    const obtenerApi = vi.fn<() => TurnstileApi | undefined>(() => undefined)
    const control = new AbortController()
    control.abort()

    esperarApiTurnstile({ obtenerApi, signal: control.signal })

    // Una espera cancelada no consulta nada: no hay carga que le interese.
    expect(obtenerApi).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
    vi.useRealTimers()
  })
})

/**
 * `esperarApiTurnstile` se exporta desde el módulo y ya se consumía con argumentos posicionales
 * `(obtenerApi, limiteMs)`. Esa firma no puede romperse para agregar la cancelación.
 */
describe("contrato posicional de la espera acotada", () => {
  it("resuelve con la API usando la firma histórica (obtenerApi)", async () => {
    const { esperarApiTurnstile } = await importWidget(TURNSTILE_TEST_SITE_KEY)
    const api = fakeTurnstile().api

    await expect(esperarApiTurnstile(() => api)).resolves.toBe(api)
  })

  it("respeta el límite posicional (obtenerApi, limiteMs)", async () => {
    vi.useFakeTimers()
    const { esperarApiTurnstile } = await importWidget(TURNSTILE_TEST_SITE_KEY)
    let resultado: TurnstileApi | null | "pendiente" = "pendiente"

    const espera = esperarApiTurnstile(() => undefined, 1_000)
    void espera.then((api) => {
      resultado = api
    })

    await vi.advanceTimersByTimeAsync(900)
    expect(resultado).toBe("pendiente")

    await vi.advanceTimersByTimeAsync(200)
    expect(resultado).toBeNull()
    vi.useRealTimers()
  })

  it("no entrega la API cuando la señal ya estaba cancelada antes de llamar", async () => {
    const { esperarApiTurnstile } = await importWidget(TURNSTILE_TEST_SITE_KEY)
    const api = fakeTurnstile().api
    const control = new AbortController()
    control.abort()
    let resultado: TurnstileApi | null | "pendiente" = "pendiente"

    void esperarApiTurnstile({ obtenerApi: () => api, signal: control.signal }).then((valor) => {
      resultado = valor
    })

    // Se vacían las microtareas: una promesa resuelta ya habría entregado la API.
    await new Promise((resolver) => setTimeout(resolver, 0))

    expect(resultado).toBe("pendiente")
  })
})

/**
 * Cuando el script de Cloudflare tarda más que la espera acotada, el widget queda sin salida:
 * sólo una recarga de la página lo recuperaba. El reintento debe volver a esperar la API.
 */
describe("reintento de la verificación", () => {
  it("reinicia la espera acotada cuando la API de Cloudflare nunca llegó", async () => {
    const { decidirReintentoDeVerificacion } = await importWidget(TURNSTILE_TEST_SITE_KEY)

    expect(decidirReintentoDeVerificacion({ tieneDesafio: false, apiLista: false })).toBe("reiniciar-espera")
  })

  it("remonta el desafío cuando la API está lista pero el render falló", async () => {
    const { decidirReintentoDeVerificacion } = await importWidget(TURNSTILE_TEST_SITE_KEY)

    expect(decidirReintentoDeVerificacion({ tieneDesafio: false, apiLista: true })).toBe("remontar-desafio")
  })

  it("resetea el desafío existente sin volver a montarlo", async () => {
    const { decidirReintentoDeVerificacion } = await importWidget(TURNSTILE_TEST_SITE_KEY)

    expect(decidirReintentoDeVerificacion({ tieneDesafio: true, apiLista: true })).toBe("resetear-desafio")
    expect(decidirReintentoDeVerificacion({ tieneDesafio: true, apiLista: false })).toBe("resetear-desafio")
  })

  it("ofrece el botón de reintento también cuando el script no llegó", async () => {
    const { mostrarReintentoDeVerificacion } = await importWidget(TURNSTILE_TEST_SITE_KEY)

    expect(mostrarReintentoDeVerificacion("unavailable")).toBe(true)
    expect(mostrarReintentoDeVerificacion("error")).toBe(true)
    expect(mostrarReintentoDeVerificacion("idle")).toBe(false)
    expect(mostrarReintentoDeVerificacion("verified")).toBe(false)
  })

  it("conserva la indicación honesta de revisar la conexión y recargar la página", async () => {
    const { copyDeEstadoTurnstile } = await importWidget(TURNSTILE_TEST_SITE_KEY)

    // Reintentar vuelve a esperar la API; no recarga un script bloqueado. El texto no puede
    // prometer una recuperación que depende del navegador o de la red.
    expect(copyDeEstadoTurnstile.unavailable).toContain("conexión")
    expect(copyDeEstadoTurnstile.unavailable).toContain("recargá la página")
    expect(copyDeEstadoTurnstile.error).toBe("No pudimos completar la verificación de seguridad.")
    expect(copyDeEstadoTurnstile.idle).toBe("Verificación de seguridad")
    expect(copyDeEstadoTurnstile.verified).toBe("Verificación de seguridad completada.")
  })

  it("conecta el reintento con una nueva espera cancelable en el efecto del widget", async () => {
    const { readFileSync } = await import("node:fs")
    const codigo = readFileSync(new URL("../../components/turnstile-widget.tsx", import.meta.url), "utf8")

    // Vitest corre sin DOM y el repositorio no tiene renderer de React: el cableado del
    // efecto se verifica sobre el código que el navegador ejecuta.
    expect(codigo).toMatch(/esperarApiTurnstile\(\{[^}]*signal/) // la espera se puede cancelar
    expect(codigo).toMatch(/setWaitAttempt\(/)
    expect(codigo).toContain("}, [scriptReady, waitAttempt])")
    expect(codigo).toContain("mostrarReintentoDeVerificacion(status)")
    expect(codigo).toContain('type="button" variant="outline" size="sm" onClick={retry}')
  })
})
