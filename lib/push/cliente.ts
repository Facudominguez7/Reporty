"use client"

import { eliminarSuscripcionPushAction, guardarSuscripcionPushAction } from "@/app/cuenta/push-actions"

/** Resultado de intentar activar las notificaciones en este dispositivo. */
export type ResultadoActivacionPush = "activada" | "denegada" | "no-soportado" | "error"

/**
 * Convierte una clave base64url (como la clave pública VAPID) a bytes.
 *
 * @param clave - Texto base64url, con o sin relleno.
 * @returns Los bytes de la clave.
 */
export function base64UrlABytes(clave: string): Uint8Array<ArrayBuffer> {
  const base64 = clave.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(clave.length / 4) * 4, "=")
  const binario = atob(base64)
  const bytes = new Uint8Array(new ArrayBuffer(binario.length))
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i)
  return bytes
}

/**
 * Indica si el navegador sabe recibir notificaciones push.
 *
 * @returns `true` si hay service workers, PushManager y Notification.
 */
export function navegadorSoportaPush(): boolean {
  return (
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    typeof window !== "undefined" &&
    "PushManager" in window &&
    "Notification" in window
  )
}

/**
 * Devuelve el PushManager del service worker registrado. Usa `getRegistration` y no `ready`,
 * porque en desarrollo el worker no se registra y `ready` nunca resolvería.
 *
 * @returns El PushManager, o `null` si no hay service worker o el navegador no soporta push.
 */
async function obtenerPushManager(): Promise<PushManager | null> {
  if (!navegadorSoportaPush()) return null
  const registro = await navigator.serviceWorker.getRegistration()
  return registro?.pushManager ?? null
}

/**
 * Lee la suscripción push actual de este dispositivo.
 *
 * @returns La suscripción, o `null` si no hay o no se puede leer.
 */
export async function leerSuscripcionPush(): Promise<PushSubscription | null> {
  try {
    return (await (await obtenerPushManager())?.getSubscription()) ?? null
  } catch {
    return null
  }
}

/**
 * Pide permiso, suscribe este dispositivo y guarda la suscripción en el servidor.
 *
 * Tiene que llamarse desde un gesto de la persona (un clic): los navegadores ignoran el
 * pedido de permiso fuera de un gesto, y en la app Android lo atiende el diálogo del sistema.
 *
 * @param clavePublica - Clave pública VAPID que devuelve `obtenerEstadoPushAction`.
 * @returns Cómo terminó el intento.
 */
export async function activarPushEnEsteDispositivo(clavePublica: string): Promise<ResultadoActivacionPush> {
  try {
    const pushManager = await obtenerPushManager()
    if (!pushManager) return "no-soportado"

    const permiso = await Notification.requestPermission()
    if (permiso !== "granted") return "denegada"

    const suscripcion = await pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlABytes(clavePublica),
    })
    const resultado = await guardarSuscripcionPushAction(suscripcion.toJSON())
    if (!resultado.success) {
      await suscripcion.unsubscribe().catch(() => false)
      return "error"
    }
    return "activada"
  } catch (error) {
    console.error("No pudimos activar las notificaciones push:", error)
    return "error"
  }
}

/**
 * Desuscribe este dispositivo en el navegador y lo borra del servidor.
 *
 * @returns `true` si quedó desactivado.
 */
export async function desactivarPushEnEsteDispositivo(): Promise<boolean> {
  try {
    const suscripcion = await leerSuscripcionPush()
    if (!suscripcion) return true
    const endpoint = suscripcion.endpoint
    await suscripcion.unsubscribe()
    const resultado = await eliminarSuscripcionPushAction(endpoint)
    return resultado.success
  } catch (error) {
    console.error("No pudimos desactivar las notificaciones push:", error)
    return false
  }
}
