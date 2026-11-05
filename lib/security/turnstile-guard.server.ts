import "server-only"

/**
 * Política compartida de Cloudflare Turnstile para las operaciones que el propio servidor
 * verifica con Siteverify.
 *
 * Cada operación protegida resuelve el token con una action propia, así un token emitido
 * para un formulario no sirve en otro. La decisión de exigir un challenge es única para toda
 * la aplicación:
 *
 * - Fuera de producción y sin site key pública no se exige: el formulario no puede renderizar
 *   un challenge, así que bloquear la operación rompería el desarrollo y las pruebas.
 * - En producción, o cuando existe site key pero falta el secreto, la operación falla cerrada:
 *   nunca se degrada la protección en silencio.
 * - Con configuración completa se validan el token y la action contra el endpoint oficial.
 */

import { verificarTurnstile, type TurnstileMotivoFalla } from "./turnstile.server"

/**
 * Texto que se devuelve y se muestra cuando la verificación no puede ejecutarse. Es el mismo
 * que exporta `components/turnstile-widget.tsx` como `MENSAJE_CAPTCHA_NO_DISPONIBLE`; una
 * prueba comprueba que ambos coincidan.
 */
export const MENSAJE_CAPTCHA_NO_DISPONIBLE =
  "La verificación de seguridad no está disponible en este momento. Por seguridad no podemos procesar el formulario; si el problema continúa, contactá a la administración de Reporty."

/** Resultado de la política: la operación continúa, se bloquea por configuración o el token fue rechazado. */
export type ResultadoVerificacionCaptcha =
  | { ok: true }
  | { ok: false; tipo: "no_disponible"; mensaje: string }
  | { ok: false; tipo: "rechazada"; motivo: TurnstileMotivoFalla; mensaje: string }

/** Producción nunca acepta una operación protegida con el challenge apagado. */
export function esProduccion(): boolean {
  return process.env.NODE_ENV === "production"
}

/** Espeja al navegador: el widget solo renderiza un challenge cuando esta clave pública existe. */
export function captchaConfigurado(): boolean {
  return (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "").trim().length > 0
}

/** El secreto vive únicamente en el servidor; sin él no se puede llamar a Siteverify. */
export function secretoConfigurado(): boolean {
  return (process.env.TURNSTILE_SECRET_KEY ?? "").trim().length > 0
}

/**
 * Aplica la política compartida a una operación protegida concreta.
 *
 * La función no registra tokens ni secretos: solo devuelve un motivo y el texto en español
 * que la acción puede mostrar. El llamador decide cuándo llamarla, siempre después de
 * autorizar a la persona y antes de ejecutar el workflow que publica o escribe datos.
 *
 * @param input.token - Token de un solo uso emitido por el challenge; puede venir vacío.
 * @param input.expectedAction - Action que el widget fijó al emitir el token.
 * @returns Resultado de la verificación: continúa, no disponible o rechazada.
 */
export async function verificarCaptchaDeAccion(input: {
  token: string | null | undefined
  expectedAction: string
}): Promise<ResultadoVerificacionCaptcha> {
  if (!esProduccion() && !captchaConfigurado()) {
    // Sin site key el formulario no puede renderizar el challenge: se omite la verificación
    // en desarrollo y pruebas. Producción nunca entra acá porque falla cerrada abajo.
    return { ok: true }
  }

  if (!captchaConfigurado() || !secretoConfigurado()) {
    console.error("Turnstile: falló la verificación por un problema operativo", "configuracion_faltante")
    return { ok: false, tipo: "no_disponible", mensaje: MENSAJE_CAPTCHA_NO_DISPONIBLE }
  }

  const verificacion = await verificarTurnstile({
    token: input.token,
    expectedAction: input.expectedAction,
  })

  if (verificacion.ok) {
    return { ok: true }
  }

  // Solo categorías fijas de fallas operativas; nunca el token, el secreto ni errores externos.
  if (
    verificacion.motivo === "configuracion_faltante" ||
    verificacion.motivo === "secreto_de_prueba_en_produccion" ||
    verificacion.motivo === "error_de_red"
  ) {
    console.error("Turnstile: falló la verificación por un problema operativo", verificacion.motivo)
  }

  return { ok: false, tipo: "rechazada", motivo: verificacion.motivo, mensaje: verificacion.mensaje }
}
