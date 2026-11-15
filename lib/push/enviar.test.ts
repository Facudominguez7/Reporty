import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const consultas = vi.hoisted(() => ({
  listarSuscripcionesParaTipo: vi.fn(),
  eliminarSuscripcionesVencidas: vi.fn(),
}))
vi.mock("@/database/queries/push/suscripciones", () => consultas)

import { enviarPush } from "./enviar.server"

const ADMIN = {} as never
const MENSAJE = { titulo: "Título", cuerpo: "Cuerpo", url: "/reportes/7", etiqueta: "reporte-7" }

/**
 * Genera un par de claves P-256 en el formato que usan el navegador y VAPID (base64url).
 *
 * @returns Clave pública sin comprimir y clave privada `d`.
 */
async function generarClaves() {
  const par = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair
  const publica = Buffer.from(await crypto.subtle.exportKey("raw", par.publicKey)).toString("base64url")
  const { d } = await crypto.subtle.exportKey("jwk", par.privateKey)
  return { publica, privada: d! }
}

/**
 * Arma una suscripción de navegador válida para el usuario y endpoint dados.
 *
 * @param usuarioId - Dueño de la suscripción.
 * @param endpoint - URL del servicio push.
 * @returns La suscripción con claves reales.
 */
async function suscripcion(usuarioId: string, endpoint: string) {
  const { publica } = await generarClaves()
  return { usuarioId, endpoint, p256dh: publica, auth: Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64url") }
}

describe("enviarPush", () => {
  const fetchFalso = vi.fn()

  beforeEach(async () => {
    const vapid = await generarClaves()
    vi.stubEnv("VAPID_PUBLIC_KEY", vapid.publica)
    vi.stubEnv("VAPID_PRIVATE_KEY", vapid.privada)
    vi.stubEnv("VAPID_SUBJECT", "mailto:contacto@reporty.com.ar")
    vi.stubGlobal("fetch", fetchFalso)
    fetchFalso.mockReset()
    consultas.listarSuscripcionesParaTipo.mockReset()
    consultas.eliminarSuscripcionesVencidas.mockReset().mockResolvedValue(null)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it("envía un mensaje cifrado y firmado con VAPID a cada dispositivo del tipo pedido", async () => {
    const dispositivos = [await suscripcion("u1", "https://fcm.googleapis.com/a"), await suscripcion("u1", "https://updates.push.services.mozilla.com/b")]
    consultas.listarSuscripcionesParaTipo.mockResolvedValue({ data: dispositivos, error: null })
    fetchFalso.mockResolvedValue(new Response(null, { status: 201 }))

    const resultado = await enviarPush({ admin: ADMIN, usuarioIds: ["u1"], tipo: "comentarios", mensaje: MENSAJE })

    expect(consultas.listarSuscripcionesParaTipo).toHaveBeenCalledWith(ADMIN, ["u1"], "comentarios")
    expect(resultado).toEqual({ enviadas: 2, vencidas: 0, fallidas: 0 })
    expect(fetchFalso.mock.calls.map(([url]) => url).sort()).toEqual(dispositivos.map((d) => d.endpoint).sort())
    const [, pedido] = fetchFalso.mock.calls[0]
    expect(pedido.method.toUpperCase()).toBe("POST")
    expect(pedido.headers["content-encoding"]).toBe("aes128gcm")
    expect(pedido.headers.authorization).toMatch(/^vapid t=.+, k=.+$/)
    expect(pedido.body.byteLength).toBeGreaterThan(0)
  })

  it("corta el pedido a un servicio push que no responde y lo cuenta como fallido", async () => {
    vi.useFakeTimers()
    try {
      consultas.listarSuscripcionesParaTipo.mockResolvedValue({ data: [await suscripcion("u1", "https://fcm.googleapis.com/lento")], error: null })
      fetchFalso.mockImplementation((_url: string, pedido: RequestInit) => new Promise((_resolver, rechazar) => {
        pedido.signal?.addEventListener("abort", () => rechazar(new DOMException("abortado", "AbortError")))
      }))
      vi.spyOn(console, "error").mockImplementation(() => {})

      const envio = enviarPush({ admin: ADMIN, usuarioIds: ["u1"], tipo: "comentarios", mensaje: MENSAJE })
      await vi.waitFor(() => expect(fetchFalso).toHaveBeenCalledOnce())
      await vi.advanceTimersByTimeAsync(10_000)

      await expect(envio).resolves.toEqual({ enviadas: 0, vencidas: 0, fallidas: 1 })
    } finally {
      vi.useRealTimers()
    }
  })

  it("borra las suscripciones que el servicio push da por vencidas (404 y 410)", async () => {
    const dispositivos = [
      await suscripcion("u1", "https://fcm.googleapis.com/ok"),
      await suscripcion("u1", "https://fcm.googleapis.com/vencida-410"),
      await suscripcion("u2", "https://fcm.googleapis.com/vencida-404"),
    ]
    consultas.listarSuscripcionesParaTipo.mockResolvedValue({ data: dispositivos, error: null })
    fetchFalso.mockImplementation(async (url: string) =>
      new Response(null, { status: url.endsWith("410") ? 410 : url.endsWith("404") ? 404 : 201 }),
    )

    const resultado = await enviarPush({ admin: ADMIN, usuarioIds: ["u1", "u2"], tipo: "estado_reporte", mensaje: MENSAJE })

    expect(resultado).toEqual({ enviadas: 1, vencidas: 2, fallidas: 0 })
    expect(consultas.eliminarSuscripcionesVencidas).toHaveBeenCalledTimes(1)
    expect(consultas.eliminarSuscripcionesVencidas.mock.calls[0][1].sort()).toEqual([
      "https://fcm.googleapis.com/vencida-404",
      "https://fcm.googleapis.com/vencida-410",
    ])
  })

  it("nunca lanza: un error de red o del servicio cuenta como fallida y sigue con el resto", async () => {
    const dispositivos = [await suscripcion("u1", "https://fcm.googleapis.com/caida"), await suscripcion("u1", "https://fcm.googleapis.com/ok")]
    consultas.listarSuscripcionesParaTipo.mockResolvedValue({ data: dispositivos, error: null })
    fetchFalso.mockImplementation(async (url: string) => {
      if (url.endsWith("caida")) throw new Error("red caída")
      return new Response(null, { status: 201 })
    })
    vi.spyOn(console, "error").mockImplementation(() => {})

    await expect(enviarPush({ admin: ADMIN, usuarioIds: ["u1"], tipo: "mascotas", mensaje: MENSAJE })).resolves.toEqual({
      enviadas: 1,
      vencidas: 0,
      fallidas: 1,
    })
    expect(consultas.eliminarSuscripcionesVencidas).not.toHaveBeenCalled()
  })

  it("nunca lanza si falla la consulta de suscripciones", async () => {
    consultas.listarSuscripcionesParaTipo.mockRejectedValue(new Error("db caída"))
    vi.spyOn(console, "error").mockImplementation(() => {})

    await expect(enviarPush({ admin: ADMIN, usuarioIds: ["u1"], tipo: "comentarios", mensaje: MENSAJE })).resolves.toEqual({
      enviadas: 0,
      vencidas: 0,
      fallidas: 0,
    })
  })

  it("sin claves VAPID configuradas no consulta ni envía nada", async () => {
    vi.stubEnv("VAPID_PRIVATE_KEY", "")

    await expect(enviarPush({ admin: ADMIN, usuarioIds: ["u1"], tipo: "comentarios", mensaje: MENSAJE })).resolves.toEqual({
      enviadas: 0,
      vencidas: 0,
      fallidas: 0,
    })
    expect(consultas.listarSuscripcionesParaTipo).not.toHaveBeenCalled()
    expect(fetchFalso).not.toHaveBeenCalled()
  })

  it("sin destinatarios no consulta la base", async () => {
    await enviarPush({ admin: ADMIN, usuarioIds: [], tipo: "moderacion", mensaje: MENSAJE })
    expect(consultas.listarSuscripcionesParaTipo).not.toHaveBeenCalled()
  })
})
