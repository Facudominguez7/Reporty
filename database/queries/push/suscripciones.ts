import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js"

import { PREFERENCIAS_PUSH_POR_DEFECTO, TIPOS_PUSH, type PreferenciasPush, type TipoPush } from "@/lib/push/tipos"

/**
 * Consultas de `public.suscripciones_push` y `public.preferencias_push`.
 *
 * Las dos tablas son privadas: todas estas funciones reciben el cliente de servicio
 * (`utils/supabase/admin.ts`) y el id de usuario sale siempre de la sesión validada.
 */

/** Dispositivo suscripto a notificaciones push. */
export type SuscripcionPush = {
  usuarioId: string
  endpoint: string
  p256dh: string
  auth: string
}

/** Datos que entrega `PushSubscription.toJSON()` en el navegador. */
export type DatosSuscripcionPush = Pick<SuscripcionPush, "endpoint" | "p256dh" | "auth">

type FilaSuscripcion = { usuario_id: string; endpoint: string; p256dh: string; auth: string }

/**
 * Guarda (o reasigna) la suscripción de un dispositivo.
 *
 * El endpoint es único: si el mismo navegador se suscribe con otra cuenta, la suscripción pasa
 * a la cuenta nueva, así un dispositivo compartido nunca recibe avisos de la anterior.
 *
 * @param admin - Cliente de servicio.
 * @param usuarioId - Usuario de la sesión.
 * @param datos - Endpoint y claves del navegador.
 * @returns El error de Postgres, o `null` si se guardó.
 */
export async function guardarSuscripcionPush(
  admin: SupabaseClient,
  usuarioId: string,
  datos: DatosSuscripcionPush,
): Promise<PostgrestError | null> {
  const { error } = await admin.from("suscripciones_push").upsert(
    {
      usuario_id: usuarioId,
      endpoint: datos.endpoint,
      p256dh: datos.p256dh,
      auth: datos.auth,
      actualizada_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" },
  )
  return error
}

/**
 * Borra la suscripción de un dispositivo, solo si pertenece al usuario de la sesión.
 *
 * @param admin - Cliente de servicio.
 * @param usuarioId - Usuario de la sesión.
 * @param endpoint - Endpoint del dispositivo.
 * @returns El error de Postgres, o `null`.
 */
export async function eliminarSuscripcionPush(
  admin: SupabaseClient,
  usuarioId: string,
  endpoint: string,
): Promise<PostgrestError | null> {
  const { error } = await admin.from("suscripciones_push").delete().eq("usuario_id", usuarioId).eq("endpoint", endpoint)
  return error
}

/**
 * Borra suscripciones vencidas (el servicio push respondió 404 o 410).
 *
 * @param admin - Cliente de servicio.
 * @param endpoints - Endpoints a borrar.
 * @returns El error de Postgres, o `null`.
 */
export async function eliminarSuscripcionesVencidas(
  admin: SupabaseClient,
  endpoints: string[],
): Promise<PostgrestError | null> {
  if (endpoints.length === 0) return null
  const { error } = await admin.from("suscripciones_push").delete().in("endpoint", endpoints)
  return error
}

/**
 * Lista los dispositivos de los usuarios indicados que tienen activo un tipo de notificación.
 *
 * Quien apagó ese tipo en «Mi cuenta» queda afuera; quien nunca tocó sus preferencias, adentro.
 *
 * @param admin - Cliente de servicio.
 * @param usuarioIds - Destinatarios posibles.
 * @param tipo - Tipo de notificación.
 * @returns Las suscripciones a las que corresponde enviar.
 */
export async function listarSuscripcionesParaTipo(
  admin: SupabaseClient,
  usuarioIds: string[],
  tipo: TipoPush,
): Promise<{ data: SuscripcionPush[]; error: PostgrestError | null }> {
  const ids = [...new Set(usuarioIds)]
  if (ids.length === 0) return { data: [], error: null }

  const apagados = await admin.from("preferencias_push").select("usuario_id").in("usuario_id", ids).eq(tipo, false)
  if (apagados.error) return { data: [], error: apagados.error }

  const excluidos = new Set((apagados.data ?? []).map((fila: { usuario_id: string }) => fila.usuario_id))
  const destinatarios = ids.filter((id) => !excluidos.has(id))
  if (destinatarios.length === 0) return { data: [], error: null }

  const { data, error } = await admin
    .from("suscripciones_push")
    .select("usuario_id, endpoint, p256dh, auth")
    .in("usuario_id", destinatarios)
  if (error) return { data: [], error }

  return {
    data: ((data ?? []) as FilaSuscripcion[]).map((fila) => ({
      usuarioId: fila.usuario_id,
      endpoint: fila.endpoint,
      p256dh: fila.p256dh,
      auth: fila.auth,
    })),
    error: null,
  }
}

/**
 * Lee las preferencias de una persona; sin fila guardada devuelve todo activo.
 *
 * @param admin - Cliente de servicio.
 * @param usuarioId - Usuario de la sesión.
 * @returns Las preferencias y el error de Postgres, si hubo.
 */
export async function obtenerPreferenciasPush(
  admin: SupabaseClient,
  usuarioId: string,
): Promise<{ data: PreferenciasPush; error: PostgrestError | null }> {
  const { data, error } = await admin
    .from("preferencias_push")
    .select(TIPOS_PUSH.join(", "))
    .eq("usuario_id", usuarioId)
    .maybeSingle()
  if (error) return { data: { ...PREFERENCIAS_PUSH_POR_DEFECTO }, error }
  return { data: { ...PREFERENCIAS_PUSH_POR_DEFECTO, ...((data ?? {}) as Partial<PreferenciasPush>) }, error: null }
}

/**
 * Activa o apaga un tipo de notificación para una persona.
 *
 * @param admin - Cliente de servicio.
 * @param usuarioId - Usuario de la sesión.
 * @param tipo - Tipo de notificación.
 * @param activo - Nuevo valor del interruptor.
 * @returns El error de Postgres, o `null`.
 */
export async function actualizarPreferenciaPush(
  admin: SupabaseClient,
  usuarioId: string,
  tipo: TipoPush,
  activo: boolean,
): Promise<PostgrestError | null> {
  const { error } = await admin
    .from("preferencias_push")
    .upsert({ usuario_id: usuarioId, [tipo]: activo, actualizada_at: new Date().toISOString() }, { onConflict: "usuario_id" })
  return error
}
