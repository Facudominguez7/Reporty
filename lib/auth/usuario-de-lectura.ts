/**
 * Usuario de la sesión para páginas que solo leen (issue #310).
 *
 * `auth.getUser()` viaja a Supabase Auth en cada llamada (~165 ms de p50 desde el Worker).
 * `auth.getClaims()` verifica la firma del access token en el servidor con la clave ES256 del
 * proyecto y no viaja. A cambio, no se entera de una sesión revocada en otro lado hasta que vence
 * el access token (como máximo, una hora), igual que PostgREST, que también acepta ese token hasta
 * su vencimiento.
 *
 * Por eso este helper es solo para páginas que leen con la sesión del usuario. Las server actions
 * y los route handlers que escriben, y las páginas de staff que leen con el cliente de servicio,
 * siguen usando `auth.getUser()`.
 */

import type { SupabaseClient, User, UserAppMetadata, UserMetadata } from "@supabase/supabase-js"

/**
 * Datos del usuario que trae un access token ya verificado.
 *
 * `correo_confirmado` sale de `user_metadata.email_verified`, que Supabase Auth marca al confirmar
 * el correo (en producción lo tienen los 116 usuarios confirmados y ninguno sin confirmar). Como
 * el usuario puede editar sus propios metadatos, solo sirve para decidir qué se muestra: las
 * acciones que exigen correo confirmado lo vuelven a comprobar con `auth.getUser()`.
 */
export type UsuarioDeLectura = Pick<User, "id" | "email" | "is_anonymous" | "user_metadata" | "app_metadata"> & {
  correo_confirmado: boolean
}

/**
 * Indica si un valor es un objeto plano (no `null` ni una lista).
 *
 * @param valor - Valor leído de un claim.
 * @returns `true` si se puede usar como objeto de metadatos.
 */
function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor)
}

/**
 * Arma el usuario a partir de los claims verificados de un access token.
 *
 * @param claims - Payload verificado por `auth.getClaims()`.
 * @returns El usuario, o `null` si el token no identifica a nadie.
 */
export function usuarioDesdeClaims(claims: Record<string, unknown> | null | undefined): UsuarioDeLectura | null {
  const id = claims?.sub
  if (typeof id !== "string" || id.length === 0) return null

  const metadatos = esObjeto(claims?.user_metadata) ? claims.user_metadata : {}
  const esAnonimo = claims?.is_anonymous === true

  return {
    id,
    email: typeof claims?.email === "string" && claims.email.length > 0 ? claims.email : undefined,
    is_anonymous: esAnonimo,
    user_metadata: metadatos as UserMetadata,
    app_metadata: (esObjeto(claims?.app_metadata) ? claims.app_metadata : {}) as UserAppMetadata,
    correo_confirmado: !esAnonimo && metadatos.email_verified === true,
  }
}

/**
 * Confirma con Supabase Auth que la sesión del pedido sigue vigente para ese usuario.
 *
 * Es para las lecturas de staff que usan el cliente de servicio: ahí una sesión revocada no puede
 * seguir viendo datos internos hasta que venza su token. Cuesta un viaje a Auth, así que solo se
 * llama cuando el rol ya indicó que hace falta.
 *
 * @param supabase - Cliente con la sesión del pedido.
 * @param usuarioId - Id que se leyó de los claims.
 * @returns `true` si Auth devuelve el mismo usuario.
 */
export async function sesionVigenteEnAuth(supabase: SupabaseClient, usuarioId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.auth.getUser()
    return !error && data.user?.id === usuarioId
  } catch (error) {
    console.error("Error al confirmar la sesión con Supabase Auth:", error)
    return false
  }
}

/**
 * Lee el usuario de la sesión sin viajar a Supabase Auth.
 *
 * Si la sesión venció, `getClaims` la refresca antes de verificarla, igual que `getUser`. Un token
 * que no verifica, o un error al leer las claves, cuenta como visitante sin sesión.
 *
 * @param supabase - Cliente con la sesión del pedido (`utils/supabase/server.ts`).
 * @returns El usuario de la sesión, o `null` si no hay una sesión válida.
 */
export async function obtenerUsuarioDeLectura(supabase: SupabaseClient): Promise<UsuarioDeLectura | null> {
  try {
    const { data, error } = await supabase.auth.getClaims()
    if (error || !data) return null
    return usuarioDesdeClaims(data.claims)
  } catch (error) {
    console.error("Error al verificar la sesión:", error)
    return null
  }
}
