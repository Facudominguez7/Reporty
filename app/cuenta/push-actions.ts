"use server"

import type { User } from "@supabase/supabase-js"

import {
  actualizarPreferenciaPush,
  eliminarSuscripcionPush,
  guardarSuscripcionPush,
  obtenerPreferenciasPush,
} from "@/database/queries/push/suscripciones"
import { getUserRoleContext, isAdminRole, isAnonymousUser } from "@/lib/authz/roles"
import { esTipoPush, type PreferenciasPush } from "@/lib/push/tipos"
import { createAdminClient } from "@/utils/supabase/admin"
import { createClient } from "@/utils/supabase/server"

/** Resultado de las acciones de notificaciones push. */
export type ResultadoPush = { success: true } | { success: false; error: string }

/** Lo que necesita el cliente para ofrecer las notificaciones push. */
export type EstadoPush =
  | { disponible: false }
  | { disponible: true; clavePublica: string; esAdmin: boolean; preferencias: PreferenciasPush }

const ERROR_SESION = "Iniciá sesión con tu cuenta para recibir notificaciones."
const ERROR_SUSCRIPCION = "La suscripción del navegador no es válida."
const ERROR_TIPO = "Ese tipo de notificación no existe."

/** Claves de la suscripción: base64url, con el mismo tope de largo que la tabla. */
const CLAVE_BASE64URL = /^[A-Za-z0-9_-]+={0,2}$/

/**
 * Devuelve el usuario de la sesión si tiene una cuenta registrada (los invitados no tienen
 * correo ni reciben avisos de sus publicaciones).
 *
 * @returns El usuario, o `null`.
 */
async function usuarioRegistrado(): Promise<User | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user || isAnonymousUser(user)) return null
  return user
}

/**
 * Valida la forma de `PushSubscription.toJSON()` que manda el navegador.
 *
 * @param datos - Valor recibido del cliente.
 * @returns Endpoint y claves, o `null` si no es una suscripción válida.
 */
function leerSuscripcion(datos: unknown): { endpoint: string; p256dh: string; auth: string } | null {
  if (!datos || typeof datos !== "object") return null
  const { endpoint, keys } = datos as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }
  if (typeof endpoint !== "string" || endpoint.length > 1000 || !endpoint.startsWith("https://")) return null
  try {
    if (!new URL(endpoint).hostname) return null
  } catch {
    return null
  }
  const p256dh = keys?.p256dh
  const auth = keys?.auth
  if (typeof p256dh !== "string" || p256dh.length > 200 || !CLAVE_BASE64URL.test(p256dh)) return null
  if (typeof auth !== "string" || auth.length > 100 || !CLAVE_BASE64URL.test(auth)) return null
  return { endpoint, p256dh, auth }
}

/**
 * Informa si las notificaciones push están disponibles para la sesión y con qué configuración.
 *
 * La clave pública VAPID no es secreta: el navegador la necesita para suscribirse.
 *
 * @returns La clave pública, las preferencias y si es administrador; o `{ disponible: false }`.
 */
export async function obtenerEstadoPushAction(): Promise<EstadoPush> {
  const clavePublica = process.env.VAPID_PUBLIC_KEY?.trim()
  if (!clavePublica) return { disponible: false }

  const user = await usuarioRegistrado()
  if (!user) return { disponible: false }

  const supabase = await createClient()
  const [{ data: contextoRol }, { data: preferencias }] = await Promise.all([
    getUserRoleContext(supabase, user.id),
    obtenerPreferenciasPush(createAdminClient(), user.id),
  ])

  return { disponible: true, clavePublica, esAdmin: isAdminRole(contextoRol?.roleId), preferencias }
}

/**
 * Guarda la suscripción push de este dispositivo a nombre de la persona de la sesión.
 *
 * Patrón de mutación del proyecto: valida la sesión con el cliente de servidor y escribe con el
 * cliente de servicio. El id sale de la sesión, nunca del cliente.
 *
 * @param datos - Resultado de `PushSubscription.toJSON()`.
 * @returns Éxito, o el error en español.
 */
export async function guardarSuscripcionPushAction(datos: unknown): Promise<ResultadoPush> {
  const user = await usuarioRegistrado()
  if (!user) return { success: false, error: ERROR_SESION }

  const suscripcion = leerSuscripcion(datos)
  if (!suscripcion) return { success: false, error: ERROR_SUSCRIPCION }

  const error = await guardarSuscripcionPush(createAdminClient(), user.id, suscripcion)
  if (error) {
    console.error("No pudimos guardar la suscripción push:", error)
    return { success: false, error: "No pudimos activar las notificaciones. Probá de nuevo." }
  }
  return { success: true }
}

/**
 * Borra la suscripción push de este dispositivo (solo si es de la persona de la sesión).
 *
 * @param endpoint - Endpoint de `PushSubscription`.
 * @returns Éxito, o el error en español.
 */
export async function eliminarSuscripcionPushAction(endpoint: unknown): Promise<ResultadoPush> {
  if (typeof endpoint !== "string" || !endpoint) return { success: false, error: ERROR_SUSCRIPCION }

  const user = await usuarioRegistrado()
  if (!user) return { success: false, error: ERROR_SESION }

  const error = await eliminarSuscripcionPush(createAdminClient(), user.id, endpoint)
  if (error) {
    console.error("No pudimos borrar la suscripción push:", error)
    return { success: false, error: "No pudimos desactivar las notificaciones. Probá de nuevo." }
  }
  return { success: true }
}

/**
 * Activa o apaga un tipo de notificación push para la persona de la sesión.
 *
 * @param tipo - Uno de `TIPOS_PUSH`.
 * @param activo - Nuevo valor del interruptor.
 * @returns Éxito, o el error en español.
 */
export async function actualizarPreferenciaPushAction(tipo: unknown, activo: unknown): Promise<ResultadoPush> {
  if (!esTipoPush(tipo) || typeof activo !== "boolean") return { success: false, error: ERROR_TIPO }

  const user = await usuarioRegistrado()
  if (!user) return { success: false, error: ERROR_SESION }

  const error = await actualizarPreferenciaPush(createAdminClient(), user.id, tipo, activo)
  if (error) {
    console.error("No pudimos guardar la preferencia push:", error)
    return { success: false, error: "No pudimos guardar el cambio. Probá de nuevo." }
  }
  return { success: true }
}
