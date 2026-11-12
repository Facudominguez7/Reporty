"use client"

/**
 * Cloudflare Turnstile challenge shared by every protected form.
 *
 * The widget renders explicitly so React controls its lifecycle inside forms and route
 * changes. Tokens are single use: after a form consumes one, the caller bumps
 * `resetSignal` and Turnstile issues a fresh challenge.
 */

import { useEffect, useId, useRef, useState } from "react"
import Script from "next/script"

import { Button } from "@/components/ui/button"

/** Public Turnstile site key. When unset, CAPTCHA is disabled and the widget is not rendered. */
export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ""

/** Explicit rendering keeps the challenge mountable by React in any form or route. */
export const TURNSTILE_SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"

/** The challenge can only run when the public site key is configured. */
export const TURNSTILE_CONFIGURADO = TURNSTILE_SITE_KEY.length > 0

/** Production never degrades silently: without a challenge, the protected forms fail closed. */
export const TURNSTILE_REQUERIDO = process.env.NODE_ENV === "production"

/** True when production requires the challenge but the site key is missing. */
export const TURNSTILE_NO_DISPONIBLE = TURNSTILE_REQUERIDO && !TURNSTILE_CONFIGURADO

/**
 * Copy shown and returned when Turnstile cannot protect a form. `app/auth/actions.ts`
 * repeats it for direct requests to the server actions; a test asserts both are identical.
 */
export const MENSAJE_CAPTCHA_NO_DISPONIBLE =
  "La verificación de seguridad no está disponible en este momento. Por seguridad no podemos procesar el formulario; si el problema continúa, contactá a la administración de Reporty."

export type TurnstileRenderOptions = {
  sitekey: string
  /** `auto` follows the page light/dark theme. */
  theme: "auto" | "light" | "dark"
  language: string
  /** Automatic retries after an internal error. */
  retry: "auto" | "never"
  /** Automatic refresh of an expired token, so the user does not have to interact again. */
  "refresh-expired": "auto" | "manual" | "never"
  /** Bound to the token by Cloudflare; Siteverify returns it so the server can require it. */
  action?: string
  callback: (token: string) => void
  "expired-callback": () => void
  "error-callback": (errorCode?: string) => void
}

export type TurnstileApi = {
  render: (container: HTMLElement, options: TurnstileRenderOptions) => string
  reset: (widgetId: string) => void
  remove: (widgetId: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

export type TurnstileWidgetCallbacks = {
  /** Receives the token, or `null` when it expires so the form stops accepting a stale one. */
  onToken: (token: string | null) => void
  /** Reports a challenge error so the form can explain it and offer a retry. */
  onError: (errorCode?: string) => void
}

/**
 * Callbacks plus the optional action this challenge is issued for. Forms that a server
 * verifies themselves (report creation) bind an action; Supabase Auth verifies its own
 * tokens, so the auth forms keep using the widget with no action.
 */
export type TurnstileWidgetOptions = TurnstileWidgetCallbacks & { action?: string }

export type TurnstileSession = {
  onToken: (token: string | null) => void
  onError: (errorCode?: string) => void
  /** Invalidates the token and silences later callbacks from the removed widget. */
  dispose: () => void
}

/**
 * Guards the callbacks of one widget mount. Switching tabs or navigating unmounts a form
 * while its challenge may still answer: the token is invalidated once and late callbacks
 * can never re-enable a form with a stale token.
 *
 * @param callbacks - Handlers owned by the form that mounted the widget.
 * @returns Session with guarded callbacks and a `dispose` that invalidates the token.
 */
export function createTurnstileSession(callbacks: TurnstileWidgetCallbacks): TurnstileSession {
  let active = true

  return {
    onToken: (token) => {
      if (active) callbacks.onToken(token)
    },
    onError: (errorCode) => {
      if (active) callbacks.onError(errorCode)
    },
    dispose: () => {
      if (!active) return
      active = false
      callbacks.onToken(null)
    },
  }
}

/**
 * Builds the options Cloudflare needs. Managed is the widget mode configured in the
 * dashboard; these options only adapt it to the app (theme, language, retries, action).
 *
 * @param callbacks - Token and error handlers owned by the consuming form, plus the
 *   optional action the server verifies through Siteverify.
 * @returns Render options for `turnstile.render`.
 */
export function buildTurnstileRenderOptions({ onToken, onError, action }: TurnstileWidgetOptions): TurnstileRenderOptions {
  return {
    sitekey: TURNSTILE_SITE_KEY,
    theme: "auto",
    language: "es",
    retry: "auto",
    "refresh-expired": "auto",
    ...(action ? { action } : {}),
    callback: (token) => onToken(token),
    "expired-callback": () => onToken(null),
    "error-callback": (errorCode) => onError(errorCode),
  }
}

export type TurnstileWidgetHandle = {
  /** Requests a fresh challenge after the previous token was consumed or expired. */
  reset: () => void
  /** Removes the challenge; safe to call more than once. */
  remove: () => void
}

/**
 * Containers that currently hold a challenge. Cloudflare throws when a container is
 * rendered twice (React replays effects on remount), so mounts are tracked here instead
 * of inside React state.
 */
const activeContainers = new WeakSet<HTMLElement>()

/**
 * Renders the challenge into a container at most once and returns its lifecycle handle.
 *
 * @param params.container - Element owned by the widget.
 * @param params.turnstile - Cloudflare API loaded by the explicit script.
 * @param params.options - Options from `buildTurnstileRenderOptions`.
 * @returns Handle, or `null` when the container already has a challenge or rendering failed.
 */
export function mountTurnstileWidget({
  container,
  turnstile,
  options,
}: {
  container: HTMLElement
  turnstile: TurnstileApi
  options: TurnstileRenderOptions
}): TurnstileWidgetHandle | null {
  if (activeContainers.has(container)) {
    return null
  }

  let widgetId: string

  try {
    widgetId = turnstile.render(container, options)
  } catch {
    // Cloudflare normally reports failures through `error-callback`. A synchronous throw
    // would leave the form "idle" with no retry, so the same callback is notified; it runs
    // in a microtask to keep React state updates out of the effect that mounts the widget.
    // The container stays free, so retrying renders a new challenge.
    queueMicrotask(() => options["error-callback"]("render_failed"))
    return null
  }

  activeContainers.add(container)
  let removed = false

  return {
    reset: () => {
      if (!removed) turnstile.reset(widgetId)
    },
    remove: () => {
      if (removed) return
      removed = true
      activeContainers.delete(container)
      try {
        turnstile.remove(widgetId)
      } catch {
        // Already gone: nothing to clean up.
      }
    },
  }
}

export type TurnstileChallenge = {
  /** Rendered challenge, or `null` when mounting failed and the form must offer a retry. */
  handle: TurnstileWidgetHandle | null
  /** Invalidates the token once and silences later callbacks; runs on unmount and retry. */
  dispose: () => void
}

/**
 * Mounts one challenge together with its token session and returns what the effect must
 * clean up. The session is *not* disposed when mounting fails: `mountTurnstileWidget`
 * delivers the failure through `error-callback` on a microtask, and disposing first would
 * silence exactly the notification that shows the retry button. Disposal happens when the
 * effect cleans up (unmount, retry), after the failure has been surfaced.
 *
 * @param params.container - Element owned by the widget.
 * @param params.turnstile - Cloudflare API loaded by the explicit script.
 * @param params.callbacks - Form handlers for tokens and failures.
 * @returns Challenge handle (nullable) and its cleanup.
 */
export function startTurnstileChallenge({
  container,
  turnstile,
  callbacks,
  action,
}: {
  container: HTMLElement
  turnstile: TurnstileApi
  callbacks: TurnstileWidgetCallbacks
  /** Optional action bound to the issued token and verified later by the server. */
  action?: string
}): TurnstileChallenge {
  const session = createTurnstileSession(callbacks)
  const handle = mountTurnstileWidget({
    container,
    turnstile,
    options: buildTurnstileRenderOptions({ onToken: session.onToken, onError: session.onError, action }),
  })

  return {
    handle,
    dispose: () => {
      session.dispose()
      handle?.remove()
    },
  }
}

/** How long a two-step protected flow waits for the fresh token before giving up. */
export const TURNSTILE_FRESH_TOKEN_TIMEOUT_MS = 60_000

export type TurnstileTokenFeed = {
  /** Latest token reported by the challenge; `null` (expiry, error, removal) clears it. */
  offer: (token: string | null) => void
  /** Forgets the consumed token so it can never be sent twice. */
  invalidate: () => void
  /**
   * Resolves with the next unused token, or `null` when it does not arrive in time.
   */
  waitForFreshToken: (timeoutMs?: number) => Promise<string | null>
}

/**
 * Bridges the challenge callbacks with a flow that needs a second token. A guest consumes
 * one token to open the anonymous session, so the report needs a different one; Cloudflare
 * normally answers again without interaction, which keeps the second step invisible.
 *
 * Every token is handed out once: `waitForFreshToken` clears it, and `invalidate` drops the
 * token that was just consumed by an external call.
 *
 * @returns Feed that buffers the latest token and releases a pending wait.
 */
export function createTurnstileTokenFeed(): TurnstileTokenFeed {
  let latest: string | null = null
  let pending: { resolve: (token: string | null) => void; timer?: ReturnType<typeof setTimeout> } | null = null

  const settle = (token: string | null) => {
    if (!pending) return
    const { resolve, timer } = pending
    pending = null
    if (timer) clearTimeout(timer)
    resolve(token)
  }

  return {
    offer: (token) => {
      if (token && pending) {
        // Released to the waiting attempt, which consumes it: it is not offered again.
        latest = null
        settle(token)
        return
      }

      latest = token
    },
    invalidate: () => {
      latest = null
    },
    waitForFreshToken: (timeoutMs = TURNSTILE_FRESH_TOKEN_TIMEOUT_MS) => {
      if (latest) {
        const token = latest
        latest = null
        return Promise.resolve(token)
      }

      // An earlier attempt never receives the token this one is about to consume.
      settle(null)

      return new Promise<string | null>((resolve) => {
        const timer = setTimeout(() => settle(null), timeoutMs)
        pending = { resolve, timer }
      })
    },
  }
}

/** How long a widget waits for the Cloudflare script before reporting it unavailable. */
export const TURNSTILE_SCRIPT_TIMEOUT_MS = 20_000

/** Interval between checks while the shared script is still loading. */
const TURNSTILE_SCRIPT_POLL_MS = 50

export type TurnstileStatus = "idle" | "verified" | "error" | "unavailable"

/**
 * Espera máxima por un desafío que no entregó token. Un desafío sano aparece en 1-2 s y en
 * redes móviles lentas en 3-5 s; pasado este límite se ofrece el reintento. Mostrarlo de más
 * sólo agrega un botón, mientras que no mostrarlo deja la recarga de la página como única salida.
 */
export const TURNSTILE_DESAFIO_DEMORADO_MS = 6_000

/** Pista que acompaña al reintento cuando el desafío quedó en blanco sin informar un error. */
export const copyDesafioDemorado = "¿No aparece la verificación? Tocá «Reintentar la verificación»."

/**
 * Avisa cuando el desafío no entregó un token dentro del límite. Cloudflare puede quedar en
 * blanco después de un `reset()` (visto en iPhone) sin llamar a `error-callback`, y el widget
 * quedaba "idle" sin ninguna salida.
 *
 * @param alDemorarse - Se llama una vez cuando vence el límite.
 * @param limiteMs - Espera máxima; por defecto `TURNSTILE_DESAFIO_DEMORADO_MS`.
 * @returns Función que cancela la vigilancia.
 */
export function vigilarDesafioDemorado(
  alDemorarse: () => void,
  limiteMs = TURNSTILE_DESAFIO_DEMORADO_MS,
): () => void {
  const temporizador = setTimeout(alDemorarse, limiteMs)
  return () => clearTimeout(temporizador)
}

/** Texto de cada estado; los formularios y las pruebas leen el mismo texto que muestra el widget. */
export const copyDeEstadoTurnstile: Record<TurnstileStatus, string> = {
  idle: "Verificación de seguridad",
  verified: "Verificación de seguridad completada.",
  error: "No pudimos completar la verificación de seguridad.",
  // Reintentar vuelve a esperar la API, pero no recarga un script que el navegador bloqueó:
  // la instrucción de recargar la página sigue siendo la salida honesta para el caso offline.
  unavailable: "No pudimos cargar la verificación de seguridad. Revisá tu conexión y recargá la página.",
}

/**
 * Cómo continúa el reintento según el estado actual de la verificación.
 *
 * - `remontar-desafio`: la API está cargada; el desafío se quita y se vuelve a dibujar en el
 *   mismo contenedor. Aunque haya un desafío montado no se usa `reset()`, porque un reset puede
 *   dejar la caja en blanco sin avisar ningún error.
 * - `reiniciar-espera`: la API nunca llegó (script lento o todavía en vuelo), así que la espera
 *   acotada arranca de nuevo en vez de dejar el widget sin salida.
 */
export type ReintentoDeVerificacion = "remontar-desafio" | "reiniciar-espera"

/**
 * Decide qué hace el botón de reintento sin tocar el estado de React.
 *
 * @param params.tieneDesafio - Si hay un desafío montado en este momento.
 * @param params.apiLista - Si la API de Cloudflare ya está disponible.
 * @returns La acción que debe ejecutar el reintento.
 */
export function decidirReintentoDeVerificacion({
  tieneDesafio,
  apiLista,
}: {
  tieneDesafio: boolean
  apiLista: boolean
}): ReintentoDeVerificacion {
  return tieneDesafio || apiLista ? "remontar-desafio" : "reiniciar-espera"
}

/**
 * El reintento se ofrece siempre que la verificación no esté resuelta: un error interno, un
 * script que nunca llegó o un desafío que quedó esperando sin entregar un token. Esos casos
 * dejaban al widget sin más recuperación que recargar la página entera.
 *
 * @param status - Estado actual del widget.
 * @param desafioDemorado - Si venció la espera de `vigilarDesafioDemorado`.
 * @returns Si hay que renderizar el control de reintento.
 */
export function mostrarReintentoDeVerificacion(status: TurnstileStatus, desafioDemorado = false): boolean {
  return status === "error" || status === "unavailable" || (status === "idle" && desafioDemorado)
}

/** Opciones de la espera acotada; el efecto del widget sólo pasa la señal de cancelación. */
export type TurnstileApiWaitOptions = {
  /** Lee la API; por defecto `window.turnstile`. */
  obtenerApi?: () => TurnstileApi | undefined
  /** Espera máxima antes de darse por vencido. */
  limiteMs?: number
  /**
   * Cancela la espera cuando el widget se desmonta o se reintenta. Después de cancelar, la
   * promesa nunca se resuelve: nadie reacciona a una carga que ya no importa.
   */
  signal?: AbortSignal
}

/**
 * Firma histórica posicional: `(obtenerApi, limiteMs)`. Se conserva porque el módulo la
 * exporta y sus consumidores ya la usaban así; sólo agrega la cancelación opcional al final.
 */
export function esperarApiTurnstile(
  obtenerApi?: () => TurnstileApi | undefined,
  limiteMs?: number,
  opciones?: TurnstileApiWaitOptions,
): Promise<TurnstileApi | null>
/** Firma por opciones, que es la que usa el efecto del widget para poder cancelar la espera. */
export function esperarApiTurnstile(opciones?: TurnstileApiWaitOptions): Promise<TurnstileApi | null>
/**
 * Resuelve cuando la API de Cloudflare existe. `next/script` no puede avisarlo de forma
 * confiable: marca un src compartido como cargado apenas una segunda instancia empieza a
 * esperar, así que un widget montado más tarde durante la carga (un cambio de pestaña) creería
 * que está listo con la API todavía ausente. Cada widget consulta la API por su cuenta.
 *
 * Acepta la firma histórica posicional y la variante por opciones; en ambas `obtenerApi` lee la
 * API (por defecto `window.turnstile`) y `limiteMs` acota la espera. Con `signal` ya cancelada
 * no se consulta la API: la promesa queda pendiente a propósito.
 *
 * @returns La API, o `null` cuando nunca llegó dentro del límite (bloqueada o sin conexión).
 */
export function esperarApiTurnstile(
  obtenerApiUOpciones: (() => TurnstileApi | undefined) | TurnstileApiWaitOptions = () => window.turnstile,
  limiteMs = TURNSTILE_SCRIPT_TIMEOUT_MS,
  opciones: TurnstileApiWaitOptions = {},
): Promise<TurnstileApi | null> {
  const configuracion =
    typeof obtenerApiUOpciones === "function"
      ? { obtenerApi: obtenerApiUOpciones, limiteMs, signal: opciones.signal }
      : {
          obtenerApi: obtenerApiUOpciones.obtenerApi ?? (() => window.turnstile),
          limiteMs: obtenerApiUOpciones.limiteMs ?? TURNSTILE_SCRIPT_TIMEOUT_MS,
          signal: obtenerApiUOpciones.signal,
        }

  // Una espera cancelada de antemano no consulta ni entrega la API: ya no importa.
  if (configuracion.signal?.aborted) return new Promise<TurnstileApi | null>(() => {})

  const disponible = configuracion.obtenerApi()
  if (disponible) return Promise.resolve(disponible)

  return new Promise((resolve) => {
    const inicio = Date.now()
    const intervalo = setInterval(() => {
      const api = configuracion.obtenerApi()
      if (!api && Date.now() - inicio < configuracion.limiteMs) return
      clearInterval(intervalo)
      configuracion.signal?.removeEventListener("abort", alCancelar)
      resolve(api ?? null)
    }, TURNSTILE_SCRIPT_POLL_MS)

    /** Corta el sondeo sin resolver: quien esperaba ya abandonó esta espera. */
    function alCancelar() {
      clearInterval(intervalo)
    }

    configuracion.signal?.addEventListener("abort", alCancelar, { once: true })
  })
}

type TurnstileWidgetProps = {
  onTokenChange: (token: string | null) => void
  /** Increment to request a fresh challenge (tokens are single-use). */
  resetSignal: number
  /** Action bound to the issued token; the server verifies the same value with Siteverify. */
  action?: string
  className?: string
}

/** State returned by a protected form action: `error` marks a failed attempt. */
export type EstadoDeIntentoDeFormulario = { error?: string; message?: string } | null | undefined

/**
 * Values a protected form must keep after an attempt. A rejected CAPTCHA (or any other
 * failure) never discards what the person already typed: they only solve the challenge
 * again. Only a successful attempt replaces them, which is how the signup form clears its
 * passwords once the account exists.
 *
 * @param state - Latest action state; `error` means the attempt failed.
 * @param actual - Values currently held by the form.
 * @param limpio - Values to hold after a successful attempt.
 * @returns Values the form must hold after the attempt.
 */
export function valoresTrasIntentoFallido<Valor>(
  state: EstadoDeIntentoDeFormulario,
  actual: Valor,
  limpio: Valor,
): Valor {
  return state?.error ? actual : limpio
}

/**
 * Renders the Cloudflare Turnstile challenge and reports its token to the form.
 *
 * The browser passes the token to Supabase Auth (`captchaToken`) and Supabase verifies it
 * with the secret configured in the dashboard; nothing here trusts the client token.
 *
 * @param props.onTokenChange - Receives the token, or `null` when it expires or the widget goes away.
 * @param props.resetSignal - Bumped by the form once a token was consumed.
 * @param props.action - Optional action bound to the token for server-side verification.
 * @param props.className - Optional layout classes for the container.
 * @returns Challenge container, or nothing when no site key is configured.
 */
export function TurnstileWidget({ onTokenChange, resetSignal, action, className }: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const handleRef = useRef<TurnstileWidgetHandle | null>(null)
  const onTokenChangeRef = useRef(onTokenChange)
  const lastResetSignalRef = useRef(resetSignal)
  // Read when the challenge mounts: changing it later must not restart the widget.
  const actionRef = useRef(action)
  const [scriptReady, setScriptReady] = useState(() => typeof window !== "undefined" && Boolean(window.turnstile))
  const [status, setStatus] = useState<TurnstileStatus>("idle")
  // Lo incrementa el botón de reintento cuando el desafío nunca se renderizó.
  const [mountAttempt, setMountAttempt] = useState(0)
  // Lo incrementa el botón de reintento cuando la API nunca llegó: reinicia la espera acotada.
  const [waitAttempt, setWaitAttempt] = useState(0)
  // Se activa cuando el desafío pasó demasiado tiempo sin entregar un token.
  const [desafioDemorado, setDesafioDemorado] = useState(false)
  const statusId = useId()

  useEffect(() => {
    onTokenChangeRef.current = onTokenChange
  }, [onTokenChange])

  // El desafío se monta sólo cuando la API existe de verdad, sin importar cómo cargue el
  // script compartido. `waitAttempt` reinicia la espera acotada cuando el reintento lo pide.
  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || scriptReady) return

    const control = new AbortController()
    esperarApiTurnstile({ signal: control.signal }).then((api) => {
      if (api) setScriptReady(true)
      else setStatus("unavailable")
    })

    // Desmontar o reintentar corta el sondeo; una espera cancelada nunca se resuelve, así que
    // el widget no puede pasar a "unavailable" por una carga que ya no está esperando.
    return () => control.abort()
  }, [scriptReady, waitAttempt])

  useEffect(() => {
    const container = containerRef.current
    const turnstile = window.turnstile

    if (!scriptReady || !container || !turnstile || !TURNSTILE_SITE_KEY) {
      return
    }

    // A failed render can leave partial markup behind; clear it before trying again.
    if (mountAttempt > 0) {
      container.replaceChildren()
    }

    const challenge = startTurnstileChallenge({
      container,
      turnstile,
      action: actionRef.current,
      callbacks: {
        onToken: (token) => {
          onTokenChangeRef.current(token)
          setDesafioDemorado(false)
          setStatus(token ? "verified" : "idle")
        },
        onError: () => {
          onTokenChangeRef.current(null)
          setStatus("error")
        },
      },
    })

    handleRef.current = challenge.handle

    // Leaving the form (tab switch, navigation) or retrying invalidates the token it was
    // given. The session outlives a failed mount so the queued `error-callback` still
    // reaches the form and shows the retry button.
    return () => {
      challenge.dispose()
      if (handleRef.current === challenge.handle) {
        handleRef.current = null
      }
    }
  }, [mountAttempt, scriptReady])

  // Only react to deliberate resets: the first render must not restart the challenge.
  useEffect(() => {
    if (resetSignal === lastResetSignalRef.current) return
    lastResetSignalRef.current = resetSignal
    setStatus("idle")
    setDesafioDemorado(false)
    handleRef.current?.reset()
  }, [resetSignal])

  // Mientras se espera un token, una caja que Cloudflare dejó en blanco no avisa ningún error:
  // vencido el límite se ofrece el reintento. Cada reset o remontaje reinicia la vigilancia.
  useEffect(() => {
    if (!scriptReady || status !== "idle") return
    return vigilarDesafioDemorado(() => setDesafioDemorado(true))
  }, [status, scriptReady, mountAttempt, resetSignal])

  const retry = () => {
    const accion = decidirReintentoDeVerificacion({
      tieneDesafio: Boolean(handleRef.current),
      apiLista: scriptReady,
    })

    setStatus("idle")
    setDesafioDemorado(false)

    if (accion === "remontar-desafio") {
      // Se quita el desafío (si lo había) y se dibuja de nuevo: un reset podía no redibujar nada.
      setMountAttempt((attempt) => attempt + 1)
      return
    }

    // La API nunca llegó: se espera otra vez en lugar de dejar sólo una recarga de página.
    setWaitAttempt((attempt) => attempt + 1)
  }

  if (!TURNSTILE_SITE_KEY) {
    return null
  }

  return (
    <>
      <Script
        src={TURNSTILE_SCRIPT_SRC}
        strategy="afterInteractive"
        onError={() => setStatus("unavailable")}
      />
      <div className="space-y-2">
        <div
          ref={containerRef}
          data-testid="turnstile-container"
          className={className ?? "min-h-[65px]"}
          aria-describedby={statusId}
        />
        <p
          id={statusId}
          role="status"
          aria-live="polite"
          className={
            status === "error" || status === "unavailable"
              ? "text-xs text-destructive"
              : "text-xs text-muted-foreground"
          }
        >
          {status === "idle" && desafioDemorado ? copyDesafioDemorado : copyDeEstadoTurnstile[status]}
        </p>
        {mostrarReintentoDeVerificacion(status, desafioDemorado) && (
          <Button type="button" variant="outline" size="sm" onClick={retry}>
            Reintentar la verificación
          </Button>
        )}
      </div>
    </>
  )
}
