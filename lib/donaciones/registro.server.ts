import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { ROLE_IDS } from "@/lib/authz/catalog"
import { interpretarPago, obtenerPago, type PagoDonacion } from "@/lib/donaciones/mercado-pago.server"
import { enviarAgradecimientoDonante, enviarAvisoDonacionAdmins } from "@/lib/notifications/donacion-notifications"

export type ResultadoRegistro = { tipo: "registrada"; donacion: PagoDonacion } | { tipo: "ignorada" }

type Dependencias = {
  buscarPago?: typeof obtenerPago
  agradecer?: typeof enviarAgradecimientoDonante
  avisarAdmins?: typeof enviarAvisoDonacionAdmins
}

/**
 * Consulta el pago en Mercado Pago y guarda o actualiza la donación. Nunca confía en datos
 * del navegador ni del webhook: todo sale de la API con nuestro access token. Si el pago
 * quedó aprobado, manda los emails una sola vez.
 */
export async function registrarDonacion(
  servicio: SupabaseClient,
  pagoId: string,
  { buscarPago = obtenerPago, agradecer = enviarAgradecimientoDonante, avisarAdmins = enviarAvisoDonacionAdmins }: Dependencias = {},
): Promise<ResultadoRegistro> {
  const pago = await buscarPago(pagoId)
  const donacion = pago ? interpretarPago(pago) : null
  if (!donacion) return { tipo: "ignorada" }

  const { error } = await servicio.from("donaciones").upsert({
    pago_id: donacion.pagoId,
    referencia: donacion.referencia,
    monto: donacion.monto,
    moneda: donacion.moneda,
    estado: donacion.estado,
    estado_mp: donacion.estadoMp,
    nombre: donacion.nombre,
    mensaje: donacion.mensaje,
    usuario_id: donacion.usuarioId,
    aprobada_at: donacion.aprobadaAt,
    updated_at: new Date().toISOString(),
  }, { onConflict: "pago_id" })
  if (error) throw new Error(`No se pudo guardar la donación ${donacion.pagoId}: ${error.message}`)

  if (donacion.estado === "aprobada") {
    await notificarUnaVez(servicio, donacion, agradecer, avisarAdmins)
  }

  return { tipo: "registrada", donacion }
}

/**
 * Reclama el envío marcando `agradecimiento_enviado_at` solo si seguía vacío, así dos
 * avisos simultáneos de Mercado Pago no mandan los emails dos veces. Si el envío falla,
 * libera la marca y relanza para que el próximo aviso lo reintente.
 */
async function notificarUnaVez(
  servicio: SupabaseClient,
  donacion: PagoDonacion,
  agradecer: typeof enviarAgradecimientoDonante,
  avisarAdmins: typeof enviarAvisoDonacionAdmins,
) {
  const { data: reclamada, error } = await servicio
    .from("donaciones")
    .update({ agradecimiento_enviado_at: new Date().toISOString() })
    .eq("pago_id", donacion.pagoId)
    .is("agradecimiento_enviado_at", null)
    .select("pago_id")
    .maybeSingle()
  if (error) throw new Error(`No se pudo reclamar el aviso de la donación ${donacion.pagoId}: ${error.message}`)
  if (!reclamada) return

  try {
    const [donante, admins] = await Promise.all([
      buscarDonante(servicio, donacion.usuarioId),
      buscarEmailsAdmins(servicio),
    ])
    const datos = { pagoId: donacion.pagoId, monto: donacion.monto, nombre: donacion.nombre, mensaje: donacion.mensaje }
    await Promise.all([
      donante ? agradecer({ destinatario: donante.email, nombreUsuario: donante.username, donacion: datos }) : null,
      avisarAdmins({ destinatarios: admins, donacion: datos }),
    ])
  } catch (falla) {
    await servicio.from("donaciones").update({ agradecimiento_enviado_at: null }).eq("pago_id", donacion.pagoId)
    throw falla
  }
}

/**
 * Busca el email del donante con sesión. Los invitados (sin email) no reciben agradecimiento.
 */
async function buscarDonante(servicio: SupabaseClient, usuarioId: string | null) {
  if (!usuarioId) return null
  const [{ data: usuario }, { data: perfil }] = await Promise.all([
    servicio.auth.admin.getUserById(usuarioId),
    servicio.from("profiles").select("username").eq("id", usuarioId).maybeSingle(),
  ])
  const cuenta = usuario?.user
  const email = cuenta?.email?.trim()
  if (!cuenta || !email || cuenta.is_anonymous) return null
  return { email, username: (perfil?.username as string | null | undefined) ?? null }
}

/**
 * Devuelve los emails de los administradores, sin vacíos ni repetidos.
 */
async function buscarEmailsAdmins(servicio: SupabaseClient): Promise<string[]> {
  const { data, error } = await servicio.from("profiles").select("email").eq("rol_id", ROLE_IDS.ADMIN)
  if (error) throw new Error(`No se pudieron leer los admins: ${error.message}`)
  const emails = (data ?? []).map((fila) => (typeof fila.email === "string" ? fila.email.trim() : "")).filter(Boolean)
  return [...new Set(emails)]
}
