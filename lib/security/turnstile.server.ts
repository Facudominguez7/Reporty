import "server-only"

/**
 * Reusable server-side Cloudflare Turnstile verification (official Siteverify endpoint).
 * The secret is read exclusively from the server environment, every failure is fail-closed,
 * and neither tokens nor secrets are ever logged or included in returned results.
 */
const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"

/** Turnstile tokens are at most 2048 characters long. */
const TOKEN_MAX_LENGTH = 2048

/** Network timeout for the Siteverify call; failures within it are fail-closed. */
export const TURNSTILE_SITEVERIFY_TIMEOUT_MS = 10_000

/**
 * Official Cloudflare dummy secret keys always start with `1x`, `2x` or `3x` followed by
 * zeros and the `AA` suffix. They must never reach production.
 */
const SECRETO_DE_PRUEBA = /^[123]x0+AA$/

export type TurnstileMotivoFalla =
  | "configuracion_faltante"
  | "secreto_de_prueba_en_produccion"
  | "token_invalido"
  | "hostname_no_autorizado"
  | "action_incorrecta"
  | "error_de_red"

const MENSAJES: Record<TurnstileMotivoFalla, string> = {
  configuracion_faltante:
    "La verificación anti bots no está configurada. Contactá a soporte.",
  secreto_de_prueba_en_produccion:
    "La verificación anti bots no está configurada. Contactá a soporte.",
  token_invalido:
    "La verificación falló o venció. Completá la verificación y volvé a intentarlo.",
  hostname_no_autorizado: "La verificación falló. Volvé a intentarlo.",
  action_incorrecta: "La verificación falló. Volvé a intentarlo.",
  error_de_red: "No pudimos contactar la verificación. Volvé a intentarlo en unos segundos.",
}

export type VerificacionTurnstile =
  | { ok: true }
  | { ok: false; motivo: TurnstileMotivoFalla; mensaje: string }

interface RespuestaSiteverify {
  success?: boolean
  "error-codes"?: unknown
  hostname?: unknown
  action?: unknown
}

interface ConfiguracionTurnstile {
  secreto: string
  hostnames: string[]
}

function leerConfiguracion(): ConfiguracionTurnstile {
  const secreto = process.env.TURNSTILE_SECRET_KEY?.trim() ?? ""
  const hostnames = (process.env.TURNSTILE_ALLOWED_HOSTNAMES ?? "")
    .split(",")
    .map(hostname => hostname.trim().toLowerCase())
    .filter(hostname => hostname.length > 0)

  return { secreto, hostnames }
}

/** Validates token shape locally: presence, maximum length, no whitespace or control chars. */
function tokenValido(token: string) {
  return token.length > 0 && token.length <= TOKEN_MAX_LENGTH && !/\s/.test(token)
}

/** Classifies a Siteverify rejection; unknown codes still fail closed as an invalid token. */
function motivoDeRechazo(codigos: string[]): TurnstileMotivoFalla {
  if (codigos.some(codigo => codigo === "missing-input-secret" || codigo === "invalid-input-secret")) {
    return "configuracion_faltante"
  }
  if (codigos.includes("internal-error")) {
    return "error_de_red"
  }
  return "token_invalido"
}

function codigosDeError(respuesta: RespuestaSiteverify): string[] {
  if (!Array.isArray(respuesta["error-codes"])) {
    return []
  }
  return respuesta["error-codes"].filter((codigo): codigo is string => typeof codigo === "string")
}

/**
 * Verifies a Turnstile token against the official Siteverify endpoint. The client token is
 * never trusted on its own and the client IP is intentionally not forwarded: Siteverify
 * only receives the server secret and the token.
 */
export async function verificarTurnstile(input: { token: string | null | undefined; expectedAction?: string }): Promise<VerificacionTurnstile> {
  const { secreto, hostnames } = leerConfiguracion()

  if (secreto.length === 0 || hostnames.length === 0) {
    return { ok: false, motivo: "configuracion_faltante", mensaje: MENSAJES.configuracion_faltante }
  }

  if (process.env.NODE_ENV === "production" && SECRETO_DE_PRUEBA.test(secreto)) {
    return {
      ok: false,
      motivo: "secreto_de_prueba_en_produccion",
      mensaje: MENSAJES.secreto_de_prueba_en_produccion,
    }
  }

  const token = typeof input.token === "string" ? input.token : ""
  if (!tokenValido(token)) {
    return { ok: false, motivo: "token_invalido", mensaje: MENSAJES.token_invalido }
  }

  const falla = (motivo: TurnstileMotivoFalla): VerificacionTurnstile => ({
    ok: false,
    motivo,
    mensaje: MENSAJES[motivo],
  })

  let cuerpo: RespuestaSiteverify
  try {
    const controlador = new AbortController()
    let vencimiento: ReturnType<typeof setTimeout> | undefined
    const agotado = new Promise<never>((_, reject) => {
      vencimiento = setTimeout(() => {
        controlador.abort()
        reject(new Error("siteverify timeout"))
      }, TURNSTILE_SITEVERIFY_TIMEOUT_MS)
    })
    try {
      const resultado = await Promise.race([
        (async () => {
          const respuesta = await fetch(SITEVERIFY_URL, {
            method: "POST",
            headers: { "content-type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ secret: secreto, response: token }),
            signal: controlador.signal,
          })
          if (!respuesta.ok) throw new Error("siteverify HTTP error")
          return respuesta.json() as Promise<unknown>
        })(),
        agotado,
      ])
      if (typeof resultado !== "object" || resultado === null || Array.isArray(resultado)) {
        return falla("error_de_red")
      }
      cuerpo = resultado as RespuestaSiteverify
    } finally {
      clearTimeout(vencimiento)
    }
  } catch {
    return falla("error_de_red")
  }


  if (cuerpo.success !== true) {
    return falla(motivoDeRechazo(codigosDeError(cuerpo)))
  }

  const hostname = typeof cuerpo.hostname === "string" ? cuerpo.hostname.toLowerCase() : ""
  if (hostname.length === 0 || !hostnames.includes(hostname)) {
    return falla("hostname_no_autorizado")
  }

  if (input.expectedAction) {
    if (cuerpo.action !== input.expectedAction) {
      return falla("action_incorrecta")
    }
  }

  return { ok: true }
}
