import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const acciones = vi.hoisted(() => ({
  guardarSuscripcionPushAction: vi.fn(),
  eliminarSuscripcionPushAction: vi.fn(),
}))
vi.mock("@/app/cuenta/push-actions", () => acciones)

import { activarPushEnEsteDispositivo, base64UrlABytes, desactivarPushEnEsteDispositivo, leerSuscripcionPush } from "./cliente"

const JSON_SUSCRIPCION = { endpoint: "https://fcm.googleapis.com/x", keys: { p256dh: "p", auth: "a" } }

/**
 * Instala un navegador falso con service worker, PushManager y Notification.
 *
 * @param opciones.permiso - Respuesta de `Notification.requestPermission()`.
 * @param opciones.registrado - Si hay un service worker registrado.
 * @param opciones.existente - Suscripción que ya tenía el navegador.
 * @returns Los dobles para inspeccionar las llamadas.
 */
function navegadorFalso({
  permiso = "granted",
  registrado = true,
  existente = null as null | { endpoint: string; unsubscribe: () => Promise<boolean>; toJSON: () => unknown },
} = {}) {
  const nueva = { endpoint: JSON_SUSCRIPCION.endpoint, toJSON: () => JSON_SUSCRIPCION, unsubscribe: vi.fn(async () => true) }
  const pushManager = { getSubscription: vi.fn(async () => existente), subscribe: vi.fn(async () => nueva) }
  const requestPermission = vi.fn(async () => permiso)
  vi.stubGlobal("navigator", { serviceWorker: { getRegistration: vi.fn(async () => (registrado ? { pushManager } : undefined)) } })
  vi.stubGlobal("window", { PushManager: function PushManager() {}, Notification: { requestPermission } })
  vi.stubGlobal("Notification", { requestPermission, permission: "default" })
  return { pushManager, requestPermission, nueva }
}

describe("cliente de notificaciones push", () => {
  beforeEach(() => {
    acciones.guardarSuscripcionPushAction.mockReset().mockResolvedValue({ success: true })
    acciones.eliminarSuscripcionPushAction.mockReset().mockResolvedValue({ success: true })
  })

  afterEach(() => vi.unstubAllGlobals())

  it("convierte la clave VAPID base64url a bytes", () => {
    expect([...base64UrlABytes("AQID_-8")]).toEqual([1, 2, 3, 255, 239])
  })

  it("pide permiso, suscribe con la clave del servidor y guarda la suscripción", async () => {
    const { pushManager, requestPermission } = navegadorFalso()

    expect(await activarPushEnEsteDispositivo("AQID")).toBe("activada")
    expect(requestPermission).toHaveBeenCalled()
    expect(pushManager.subscribe).toHaveBeenCalledWith({ userVisibleOnly: true, applicationServerKey: new Uint8Array([1, 2, 3]) })
    expect(acciones.guardarSuscripcionPushAction).toHaveBeenCalledWith(JSON_SUSCRIPCION)
  })

  it("si la persona no da permiso, no suscribe nada", async () => {
    const { pushManager } = navegadorFalso({ permiso: "denied" })

    expect(await activarPushEnEsteDispositivo("AQID")).toBe("denegada")
    expect(pushManager.subscribe).not.toHaveBeenCalled()
    expect(acciones.guardarSuscripcionPushAction).not.toHaveBeenCalled()
  })

  it("sin service worker registrado (por ejemplo en desarrollo) informa que no está soportado", async () => {
    navegadorFalso({ registrado: false })
    expect(await activarPushEnEsteDispositivo("AQID")).toBe("no-soportado")
  })

  it("si el servidor no guarda la suscripción, la deshace en el navegador", async () => {
    const { nueva } = navegadorFalso()
    acciones.guardarSuscripcionPushAction.mockResolvedValue({ success: false, error: "x" })

    expect(await activarPushEnEsteDispositivo("AQID")).toBe("error")
    expect(nueva.unsubscribe).toHaveBeenCalled()
  })

  it("lee la suscripción existente y la desactiva en el navegador y en el servidor", async () => {
    const existente = { endpoint: "https://fcm.googleapis.com/vieja", toJSON: () => ({}), unsubscribe: vi.fn(async () => true) }
    navegadorFalso({ existente })

    expect(await leerSuscripcionPush()).toBe(existente)
    expect(await desactivarPushEnEsteDispositivo()).toBe(true)
    expect(existente.unsubscribe).toHaveBeenCalled()
    expect(acciones.eliminarSuscripcionPushAction).toHaveBeenCalledWith("https://fcm.googleapis.com/vieja")
  })
})
