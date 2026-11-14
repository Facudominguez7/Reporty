import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  getUserRoleContext: vi.fn(),
  createAdminClient: vi.fn(() => ({ servicio: true })),
  guardarSuscripcionPush: vi.fn(),
  eliminarSuscripcionPush: vi.fn(),
  obtenerPreferenciasPush: vi.fn(),
  actualizarPreferenciaPush: vi.fn(),
}))
vi.mock("@/utils/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser } }) }))
vi.mock("@/utils/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }))
vi.mock("@/lib/authz/roles", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/authz/roles")>()),
  getUserRoleContext: mocks.getUserRoleContext,
}))
vi.mock("@/database/queries/push/suscripciones", () => ({
  guardarSuscripcionPush: mocks.guardarSuscripcionPush,
  eliminarSuscripcionPush: mocks.eliminarSuscripcionPush,
  obtenerPreferenciasPush: mocks.obtenerPreferenciasPush,
  actualizarPreferenciaPush: mocks.actualizarPreferenciaPush,
}))

import {
  actualizarPreferenciaPushAction,
  eliminarSuscripcionPushAction,
  guardarSuscripcionPushAction,
  obtenerEstadoPushAction,
} from "./push-actions"

const SERVICIO = { servicio: true }
const SUSCRIPCION = {
  endpoint: "https://fcm.googleapis.com/fcm/send/abc",
  keys: { p256dh: "B".repeat(87), auth: "a".repeat(22) },
}
const SESION_REQUERIDA = { success: false, error: "Iniciá sesión con tu cuenta para recibir notificaciones." }

beforeEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
  vi.stubEnv("VAPID_PUBLIC_KEY", "clave-publica")
  mocks.getUser.mockResolvedValue({ data: { user: { id: "u1", is_anonymous: false } } })
  mocks.getUserRoleContext.mockResolvedValue({ data: { roleId: 2 }, error: null })
  mocks.guardarSuscripcionPush.mockResolvedValue(null)
  mocks.eliminarSuscripcionPush.mockResolvedValue(null)
  mocks.actualizarPreferenciaPush.mockResolvedValue(null)
  mocks.obtenerPreferenciasPush.mockResolvedValue({
    data: { estado_reporte: true, comentarios: false, mascotas: true, moderacion: true },
    error: null,
  })
})

describe("obtenerEstadoPushAction", () => {
  it("devuelve la clave pública, las preferencias de la sesión y si es administrador", async () => {
    expect(await obtenerEstadoPushAction()).toEqual({
      disponible: true,
      clavePublica: "clave-publica",
      esAdmin: false,
      preferencias: { estado_reporte: true, comentarios: false, mascotas: true, moderacion: true },
    })
    expect(mocks.obtenerPreferenciasPush).toHaveBeenCalledWith(SERVICIO, "u1")
  })

  it("marca a los administradores", async () => {
    mocks.getUserRoleContext.mockResolvedValue({ data: { roleId: 1 }, error: null })
    expect(await obtenerEstadoPushAction()).toMatchObject({ disponible: true, esAdmin: true })
  })

  it("no está disponible sin sesión, para invitados ni sin clave VAPID", async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: null } })
    expect(await obtenerEstadoPushAction()).toEqual({ disponible: false })

    mocks.getUser.mockResolvedValueOnce({ data: { user: { id: "u1", is_anonymous: true } } })
    expect(await obtenerEstadoPushAction()).toEqual({ disponible: false })

    vi.stubEnv("VAPID_PUBLIC_KEY", "")
    expect(await obtenerEstadoPushAction()).toEqual({ disponible: false })
  })
})

describe("guardarSuscripcionPushAction", () => {
  it("guarda la suscripción del navegador a nombre de la sesión", async () => {
    expect(await guardarSuscripcionPushAction(SUSCRIPCION)).toEqual({ success: true })
    expect(mocks.guardarSuscripcionPush).toHaveBeenCalledWith(SERVICIO, "u1", {
      endpoint: SUSCRIPCION.endpoint,
      p256dh: SUSCRIPCION.keys.p256dh,
      auth: SUSCRIPCION.keys.auth,
    })
  })

  it("exige una cuenta registrada", async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: null } })
    expect(await guardarSuscripcionPushAction(SUSCRIPCION)).toEqual(SESION_REQUERIDA)

    mocks.getUser.mockResolvedValueOnce({ data: { user: { id: "u1", is_anonymous: true } } })
    expect(await guardarSuscripcionPushAction(SUSCRIPCION)).toEqual(SESION_REQUERIDA)
    expect(mocks.guardarSuscripcionPush).not.toHaveBeenCalled()
  })

  it.each([
    ["sin datos", null],
    ["endpoint http", { ...SUSCRIPCION, endpoint: "http://fcm.googleapis.com/x" }],
    ["endpoint inválido", { ...SUSCRIPCION, endpoint: "https://" }],
    ["sin claves", { endpoint: SUSCRIPCION.endpoint }],
    ["clave con caracteres inválidos", { ...SUSCRIPCION, keys: { ...SUSCRIPCION.keys, auth: "<script>" } }],
    ["clave demasiado larga", { ...SUSCRIPCION, keys: { ...SUSCRIPCION.keys, p256dh: "B".repeat(201) } }],
  ])("rechaza una suscripción inválida (%s) sin llegar a la base", async (_caso, datos) => {
    expect(await guardarSuscripcionPushAction(datos)).toEqual({ success: false, error: "La suscripción del navegador no es válida." })
    expect(mocks.guardarSuscripcionPush).not.toHaveBeenCalled()
  })

  it("informa un error genérico si la base falla", async () => {
    mocks.guardarSuscripcionPush.mockResolvedValue({ message: "boom" })
    vi.spyOn(console, "error").mockImplementation(() => {})
    expect(await guardarSuscripcionPushAction(SUSCRIPCION)).toEqual({
      success: false,
      error: "No pudimos activar las notificaciones. Probá de nuevo.",
    })
  })
})

describe("eliminarSuscripcionPushAction", () => {
  it("borra solo el dispositivo de la sesión", async () => {
    expect(await eliminarSuscripcionPushAction(SUSCRIPCION.endpoint)).toEqual({ success: true })
    expect(mocks.eliminarSuscripcionPush).toHaveBeenCalledWith(SERVICIO, "u1", SUSCRIPCION.endpoint)
  })

  it("rechaza un endpoint que no es texto y exige sesión", async () => {
    expect(await eliminarSuscripcionPushAction(42)).toEqual({ success: false, error: "La suscripción del navegador no es válida." })
    mocks.getUser.mockResolvedValueOnce({ data: { user: null } })
    expect(await eliminarSuscripcionPushAction(SUSCRIPCION.endpoint)).toEqual(SESION_REQUERIDA)
    expect(mocks.eliminarSuscripcionPush).not.toHaveBeenCalled()
  })
})

describe("actualizarPreferenciaPushAction", () => {
  it("guarda el interruptor del tipo para la sesión", async () => {
    expect(await actualizarPreferenciaPushAction("comentarios", false)).toEqual({ success: true })
    expect(mocks.actualizarPreferenciaPush).toHaveBeenCalledWith(SERVICIO, "u1", "comentarios", false)
  })

  it("rechaza tipos desconocidos o valores que no son booleanos", async () => {
    expect(await actualizarPreferenciaPushAction("marketing", true)).toEqual({ success: false, error: "Ese tipo de notificación no existe." })
    expect(await actualizarPreferenciaPushAction("comentarios", "no")).toEqual({ success: false, error: "Ese tipo de notificación no existe." })
    expect(mocks.actualizarPreferenciaPush).not.toHaveBeenCalled()
  })

  it("exige sesión", async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: null } })
    expect(await actualizarPreferenciaPushAction("comentarios", false)).toEqual(SESION_REQUERIDA)
  })
})
