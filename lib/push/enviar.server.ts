import "server-only"

import { buildPushPayload, type VapidKeys } from "@block65/webcrypto-web-push"
import type { SupabaseClient } from "@supabase/supabase-js"

import {
  eliminarSuscripcionesVencidas,
  listarSuscripcionesParaTipo,
  type SuscripcionPush,
} from "@/database/queries/push/suscripciones"
import type { MensajePush, TipoPush } from "@/lib/push/tipos"

/** Remitente VAPID por defecto: el contacto público de Reporty. */
const SUJETO_VAPID_POR_DEFECTO = "mailto:contacto@reporty.com.ar"

/** Un aviso que no se entregó en 24 horas ya no sirve: el servicio push lo descarta. */
const TTL_SEGUNDOS = 24 * 60 * 60

/** Respuestas con las que el servicio push indica que la suscripción ya no existe. */
const ESTADOS_VENCIDA = new Set([404, 410])

/** Resultado de un envío; sirve para logs y pruebas. */
export type ResultadoEnvioPush = { enviadas: number; vencidas: number; fallidas: number }

const SIN_ENVIOS: ResultadoEnvioPush = { enviadas: 0, vencidas: 0, fallidas: 0 }

/**
 * Lee las claves VAPID del entorno.
 *
 * @returns Las claves, o `null` si falta la pública o la privada (las push quedan apagadas).
 */
export function leerClavesVapid(): VapidKeys | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim()
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim()
  if (!publicKey || !privateKey) return null
  return { publicKey, privateKey, subject: process.env.VAPID_SUBJECT?.trim() || SUJETO_VAPID_POR_DEFECTO }
}

/**
 * Entrega el mensaje a un dispositivo.
 *
 * @param suscripcion - Dispositivo de destino.
 * @param mensaje - Contenido de la notificación.
 * @param vapid - Claves del servidor.
 * @returns Si se entregó, si la suscripción venció o si falló.
 */
async function enviarADispositivo(
  suscripcion: SuscripcionPush,
  mensaje: MensajePush,
  vapid: VapidKeys,
): Promise<"enviada" | "vencida" | "fallida"> {
  try {
    const pedido = await buildPushPayload(
      { data: mensaje, options: { ttl: TTL_SEGUNDOS, topic: mensaje.etiqueta.slice(0, 32).replace(/[^A-Za-z0-9_-]/g, "_") } },
      { endpoint: suscripcion.endpoint, expirationTime: null, keys: { p256dh: suscripcion.p256dh, auth: suscripcion.auth } },
      vapid,
    )
    const respuesta = await fetch(suscripcion.endpoint, pedido)
    if (respuesta.ok) return "enviada"
    if (ESTADOS_VENCIDA.has(respuesta.status)) return "vencida"
    console.error(`El servicio push respondió ${respuesta.status} para ${new URL(suscripcion.endpoint).host}`)
    return "fallida"
  } catch (error) {
    console.error("No pudimos enviar una notificación push:", error)
    return "fallida"
  }
}

/**
 * Envía una notificación push a todos los dispositivos de los usuarios indicados.
 *
 * Es un complemento de los correos: nunca lanza, así una push que falla no rompe la acción
 * que la disparó. Respeta las preferencias por tipo de «Mi cuenta» y borra las suscripciones
 * que el servicio push da por vencidas (404/410). Sin claves VAPID configuradas no hace nada.
 *
 * @param params.admin - Cliente de servicio (las tablas push son privadas).
 * @param params.usuarioIds - Destinatarios; se ignoran los repetidos.
 * @param params.tipo - Tipo de notificación, para filtrar por preferencias.
 * @param params.mensaje - Título, cuerpo, ruta a abrir y etiqueta.
 * @returns Cuántas se entregaron, cuántas suscripciones vencieron y cuántas fallaron.
 */
export async function enviarPush({
  admin,
  usuarioIds,
  tipo,
  mensaje,
}: {
  admin: SupabaseClient
  usuarioIds: string[]
  tipo: TipoPush
  mensaje: MensajePush
}): Promise<ResultadoEnvioPush> {
  const vapid = leerClavesVapid()
  if (!vapid || usuarioIds.length === 0) return { ...SIN_ENVIOS }

  try {
    const { data: suscripciones, error } = await listarSuscripcionesParaTipo(admin, usuarioIds, tipo)
    if (error) {
      console.error("No pudimos leer las suscripciones push:", error)
      return { ...SIN_ENVIOS }
    }

    const resultados = await Promise.all(suscripciones.map((suscripcion) => enviarADispositivo(suscripcion, mensaje, vapid)))
    const vencidas = suscripciones.filter((_, indice) => resultados[indice] === "vencida").map((s) => s.endpoint)

    if (vencidas.length > 0) {
      const errorBorrado = await eliminarSuscripcionesVencidas(admin, vencidas)
      if (errorBorrado) console.error("No pudimos borrar suscripciones push vencidas:", errorBorrado)
    }

    return {
      enviadas: resultados.filter((r) => r === "enviada").length,
      vencidas: vencidas.length,
      fallidas: resultados.filter((r) => r === "fallida").length,
    }
  } catch (error) {
    console.error("No pudimos enviar las notificaciones push:", error)
    return { ...SIN_ENVIOS }
  }
}
