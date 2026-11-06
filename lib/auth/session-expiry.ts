/**
 * Reglas de vencimiento absoluto de la sesión (issue #180).
 *
 * Supabase renueva el refresh token sin límite, así que una sesión iniciada nunca vencía.
 * Este módulo decide cuándo hay que cerrarla según el tiempo transcurrido desde la
 * autenticación: 30 días para usuarios comunes y 24 horas para administradores, en línea con
 * NIST SP 800-63B-4 (AAL1 y AAL2) y OWASP ASVS 3.3.2. Las sesiones anónimas no vencen por esta
 * regla; esa exclusión la aplica el middleware antes de consultar este módulo.
 */

import { ROLE_IDS } from "@/lib/authz/catalog"

const HORA_MS = 60 * 60 * 1000

/** Duración máxima de una sesión de usuario común (Ciudadano, Interesado, Operador). */
export const LIMITE_SESION_GENERAL_MS = 30 * 24 * HORA_MS

/** Duración máxima de una sesión de administrador, más corta por el alcance de sus permisos. */
export const LIMITE_SESION_ADMIN_MS = 24 * HORA_MS

/**
 * Lee el payload de un JWT sin verificar la firma.
 *
 * Solo debe usarse con un token que Supabase ya validó (`auth.getUser()`); no autentica nada.
 * Devuelve `null` si el token no tiene el formato esperado.
 */
function leerPayloadJwt(token: string): Record<string, unknown> | null {
  const partes = token.split(".")
  if (partes.length !== 3) return null

  try {
    const base64 = partes[1].replace(/-/g, "+").replace(/_/g, "/")
    const payload: unknown = JSON.parse(atob(base64))
    return payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/**
 * Obtiene el instante (ms) en que el usuario se autenticó por última vez en esta sesión.
 *
 * Usa el timestamp más reciente del claim `amr` del access token, que pertenece a la sesión y
 * no cambia al refrescarla. Si el token no lo trae, recurre a `last_sign_in_at` del usuario.
 * Devuelve `null` cuando no hay ningún dato válido.
 */
export function obtenerInicioAutenticacion(
  accessToken: string | undefined,
  ultimoInicioSesion: string | undefined,
): number | null {
  const amr = accessToken ? leerPayloadJwt(accessToken)?.amr : undefined
  const timestamps = Array.isArray(amr)
    ? amr
        .map((entrada) => (entrada as { timestamp?: unknown } | null)?.timestamp)
        .filter((valor): valor is number => typeof valor === "number" && Number.isFinite(valor))
    : []

  if (timestamps.length > 0) {
    return Math.max(...timestamps) * 1000
  }

  const respaldo = ultimoInicioSesion ? Date.parse(ultimoInicioSesion) : Number.NaN
  return Number.isFinite(respaldo) ? respaldo : null
}

/**
 * Indica si la sesión de un usuario no anónimo superó su duración máxima.
 *
 * Un rol desconocido (por ejemplo, si falló la lectura del perfil) recibe el límite más corto,
 * y un inicio desconocido vence la sesión: ante la duda, se pide iniciar sesión de nuevo.
 */
export function sesionVencida({
  inicioMs,
  ahoraMs,
  rolId,
}: {
  inicioMs: number | null
  ahoraMs: number
  rolId: number | null
}): boolean {
  if (inicioMs === null) return true

  const esRolComun = rolId !== null && rolId !== ROLE_IDS.ADMIN
  const limite = esRolComun ? LIMITE_SESION_GENERAL_MS : LIMITE_SESION_ADMIN_MS
  return ahoraMs - inicioMs >= limite
}
