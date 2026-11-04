/** Pruebas sin red del servicio reutilizable de verificación Turnstile (Siteverify). */
import { afterEach, describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))

import { verificarTurnstile } from "./turnstile.server"

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"
// Secretos de prueba oficiales de Cloudflare, sin guión, tal como están documentados.
const SECRETO_PRUEBA = "1x0000000000000000000000000000000AA"
const SECRETO_FALSO_PRUEBA = "2x0000000000000000000000000000000AA"
const SECRETO_INVALIDO_PRUEBA = "3x0000000000000000000000000000000AA"

/** Respuesta exitosa mínima del endpoint oficial, con hostname/action configurables. */
function respuestaExito(overrides: Record<string, unknown> = {}) {
  return new Response(
    JSON.stringify({ success: true, hostname: "reporty.com.ar", "error-codes": [], ...overrides }),
    { status: 200 },
  )
}

/** Habilita únicamente las credenciales de prueba oficiales dentro del entorno aislado. */
function configurar(secreto = SECRETO_PRUEBA) {
  vi.stubEnv("TURNSTILE_SECRET_KEY", secreto)
  vi.stubEnv("TURNSTILE_ALLOWED_HOSTNAMES", "reporty.com.ar, www.reporty.com.ar")
}

function espiaFetch(respuesta: Response | Promise<Response> = respuestaExito()) {
  const llamada = vi.fn().mockReturnValue(respuesta)
  vi.stubGlobal("fetch", llamada)
  return llamada
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe("verificarTurnstile", () => {
  it("1 — verifica un token válido contra el endpoint oficial con secret y response, sin remoteip", async () => {
    configurar()
    const llamada = espiaFetch()
    const resultado = await verificarTurnstile({ token: "tok-valido-1234" })

    expect(resultado).toEqual({ ok: true })
    expect(llamada).toHaveBeenCalledTimes(1)
    const [url, opciones] = llamada.mock.calls[0]
    expect(url).toBe(SITEVERIFY_URL)
    expect(opciones.method).toBe("POST")
    expect(opciones.body.get("secret")).toBe(SECRETO_PRUEBA)
    expect(opciones.body.get("response")).toBe("tok-valido-1234")
    expect(opciones.body.has("remoteip")).toBe(false)
  })

  it.each([undefined, null, "", "   "])("2 — rechaza sin llamar a Siteverify un token faltante (%j)", async token => {
    configurar()
    const llamada = espiaFetch()
    const resultado = await verificarTurnstile({ token: token as string | undefined })

    expect(resultado.ok).toBe(false)
    if (!resultado.ok) expect(resultado.motivo).toBe("token_invalido")
    expect(llamada).not.toHaveBeenCalled()
  })

  it("2 — rechaza localmente un token que supera la longitud máxima sin llamar a Siteverify", async () => {
    configurar()
    const llamada = espiaFetch()
    const resultado = await verificarTurnstile({ token: "a".repeat(2049) })

    expect(resultado.ok).toBe(false)
    expect(llamada).not.toHaveBeenCalled()
  })

  it("2 — rechaza localmente un token con espacios o caracteres de control", async () => {
    configurar()
    const llamada = espiaFetch()
    for (const token of ["tok con espacio", "tok\nsalto", "tok\ttab"]) {
      const resultado = await verificarTurnstile({ token })
      expect(resultado.ok).toBe(false)
    }
    expect(llamada).not.toHaveBeenCalled()
  })

  it("3 y 4 — falla cerrada cuando Siteverify rechaza el token (inválido, vencido o reutilizado)", async () => {
    configurar()
    for (const errorCode of ["invalid-input-response", "timeout-or-duplicate"]) {
      espiaFetch(respuestaExito({ success: false, "error-codes": [errorCode] }))
      const resultado = await verificarTurnstile({ token: "tok-rechazado" })
      expect(resultado.ok).toBe(false)
      if (!resultado.ok) expect(resultado.motivo).toBe("token_invalido")
    }
  })

  it("5 — rechaza una respuesta exitosa cuyo hostname no está permitido", async () => {
    configurar()
    espiaFetch(respuestaExito({ hostname: "malicioso.example" }))
    const resultado = await verificarTurnstile({ token: "tok-otro-host" })

    expect(resultado.ok).toBe(false)
    if (!resultado.ok) expect(resultado.motivo).toBe("hostname_no_autorizado")
  })

  it("5 — acepta cualquier hostname permitido sin distinguir mayúsculas", async () => {
    configurar()
    for (const hostname of ["reporty.com.ar", "www.reporty.com.ar", "REPORTY.COM.AR"]) {
      espiaFetch(respuestaExito({ hostname }))
      const resultado = await verificarTurnstile({ token: "tok-host" })
      expect(resultado.ok).toBe(true)
    }
  })

  it("5 — rechaza una respuesta exitosa sin hostname", async () => {
    configurar()
    espiaFetch(respuestaExito({ hostname: undefined }))
    const resultado = await verificarTurnstile({ token: "tok-sin-hostname" })

    expect(resultado.ok).toBe(false)
    if (!resultado.ok) expect(resultado.motivo).toBe("hostname_no_autorizado")
  })

  it("7 — verifica la action configurada y rechaza una action incorrecta", async () => {
    configurar()
    espiaFetch(respuestaExito({ action: "crear_reporte" }))
    expect(await verificarTurnstile({ token: "tok", expectedAction: "crear_reporte" })).toEqual({ ok: true })

    espiaFetch(respuestaExito({ action: "otra_action" }))
    const resultado = await verificarTurnstile({ token: "tok", expectedAction: "crear_reporte" })
    expect(resultado.ok).toBe(false)
    if (!resultado.ok) expect(resultado.motivo).toBe("action_incorrecta")
  })

  it("7 — rechaza cuando se espera una action y Siteverify no informa ninguna", async () => {
    configurar()
    espiaFetch(respuestaExito({ action: undefined }))
    const resultado = await verificarTurnstile({ token: "tok", expectedAction: "crear_reporte" })

    expect(resultado.ok).toBe(false)
    if (!resultado.ok) expect(resultado.motivo).toBe("action_incorrecta")
  })

  it("7 — fuera de producción acepta sin action la respuesta de una clave de prueba oficial", async () => {
    configurar()
    vi.stubEnv("TURNSTILE_ALLOWED_HOSTNAMES", "example.com")
    espiaFetch(respuestaExito({ hostname: "example.com", metadata: { result_with_testing_key: true } }))

    const resultado = await verificarTurnstile({ token: "XXXX.DUMMY.TOKEN.XXXX", expectedAction: "crear_reporte" })

    expect(resultado).toEqual({ ok: true })
  })

  it("7 — con un secreto real exige la action aunque la respuesta se marque como de prueba", async () => {
    configurar("0x4AAAAAAAsecretoReal")
    espiaFetch(respuestaExito({ metadata: { result_with_testing_key: true } }))

    const resultado = await verificarTurnstile({ token: "tok-valido-1234", expectedAction: "crear_reporte" })

    expect(resultado).toMatchObject({ ok: false, motivo: "action_incorrecta" })
  })

  it("7 — la respuesta de prueba sigue exigiendo un hostname permitido", async () => {
    configurar()
    espiaFetch(respuestaExito({ hostname: "example.com", metadata: { result_with_testing_key: true } }))

    const resultado = await verificarTurnstile({ token: "XXXX.DUMMY.TOKEN.XXXX", expectedAction: "crear_reporte" })

    expect(resultado).toMatchObject({ ok: false, motivo: "hostname_no_autorizado" })
  })

  it("7 — no exige action cuando no se configura una esperada", async () => {
    configurar()
    espiaFetch(respuestaExito({ action: "lo_que_sea" }))
    expect(await verificarTurnstile({ token: "tok" })).toEqual({ ok: true })
  })

  it("8 — falla cerrada ante un error de red de Cloudflare sin exponer detalles", async () => {
    configurar()
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED secreto_prueba")))
    const resultado = await verificarTurnstile({ token: "tok-red" })

    expect(resultado.ok).toBe(false)
    if (!resultado.ok) expect(resultado.motivo).toBe("error_de_red")
    expect(JSON.stringify(resultado)).not.toContain("secreto_prueba")
  })

  it("8 — falla cerrada ante una respuesta HTTP no exitosa o un cuerpo no JSON", async () => {
    configurar()
    espiaFetch(new Response("error", { status: 503 }))
    const http = await verificarTurnstile({ token: "tok" })
    expect(http.ok).toBe(false)

    espiaFetch(new Response("{ no json", { status: 200 }))
    const json = await verificarTurnstile({ token: "tok" })
    expect(json.ok).toBe(false)
  })

  it("8 — falla cerrada y reporta error de red ante internal-error de Siteverify", async () => {
    configurar()
    espiaFetch(respuestaExito({ success: false, "error-codes": ["internal-error"] }))
    const resultado = await verificarTurnstile({ token: "tok" })

    expect(resultado.ok).toBe(false)
    if (!resultado.ok) expect(resultado.motivo).toBe("error_de_red")
  })

  it("8 — falla cerrada ante códigos de error desconocidos", async () => {
    configurar()
    espiaFetch(respuestaExito({ success: false, "error-codes": ["codigo-desconocido"] }))
    const resultado = await verificarTurnstile({ token: "tok" })

    expect(resultado.ok).toBe(false)
    if (!resultado.ok) expect(resultado.motivo).toBe("token_invalido")
  })

  it("8 — trata un secreto rechazado por Siteverify como error de configuración", async () => {
    configurar()
    espiaFetch(respuestaExito({ success: false, "error-codes": ["invalid-input-secret"] }))
    const resultado = await verificarTurnstile({ token: "tok" })

    expect(resultado.ok).toBe(false)
    if (!resultado.ok) expect(resultado.motivo).toBe("configuracion_faltante")
  })

  it("9 — falla cerrada sin llamar a Siteverify cuando falta el secreto", async () => {
    configurar("")
    const llamada = espiaFetch()
    const resultado = await verificarTurnstile({ token: "tok" })

    expect(resultado.ok).toBe(false)
    if (!resultado.ok) expect(resultado.motivo).toBe("configuracion_faltante")
    expect(llamada).not.toHaveBeenCalled()
  })

  it("9 — falla cerrada sin llamar a Siteverify cuando falta la lista de hostnames permitidos", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", SECRETO_PRUEBA)
    vi.stubEnv("TURNSTILE_ALLOWED_HOSTNAMES", " ")
    const llamada = espiaFetch()
    const resultado = await verificarTurnstile({ token: "tok" })

    expect(resultado.ok).toBe(false)
    if (!resultado.ok) expect(resultado.motivo).toBe("configuracion_faltante")
    expect(llamada).not.toHaveBeenCalled()
  })

  it.each([SECRETO_PRUEBA, SECRETO_FALSO_PRUEBA, SECRETO_INVALIDO_PRUEBA])(
    "9 — en producción rechaza el secreto de prueba oficial %s sin llamar a Siteverify",
    async secreto => {
      vi.stubEnv("NODE_ENV", "production")
      vi.stubEnv("TURNSTILE_SECRET_KEY", secreto)
      vi.stubEnv("TURNSTILE_ALLOWED_HOSTNAMES", "reporty.com.ar")
      const llamada = espiaFetch()
      const resultado = await verificarTurnstile({ token: "tok" })

      expect(resultado.ok).toBe(false)
      if (!resultado.ok) expect(resultado.motivo).toBe("secreto_de_prueba_en_produccion")
      expect(llamada).not.toHaveBeenCalled()
    },
  )

  it("9 — en producción acepta un secreto real distinto de los ficticios oficiales", async () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("TURNSTILE_SECRET_KEY", "0x0000000000000000000000000000000-AA")
    vi.stubEnv("TURNSTILE_ALLOWED_HOSTNAMES", "reporty.com.ar")
    espiaFetch(respuestaExito())
    const resultado = await verificarTurnstile({ token: "tok" })

    expect(resultado).toEqual({ ok: true })
  })

  it("9 — fuera de producción permite los secretos de prueba oficiales", async () => {
    configurar()
    vi.stubEnv("NODE_ENV", "development")
    espiaFetch(respuestaExito())
    expect(await verificarTurnstile({ token: "tok" })).toEqual({ ok: true })
  })

  it("8 — limita también una respuesta cuyo cuerpo nunca termina", async () => {
    configurar()
    vi.useFakeTimers()
    // Respuesta con encabezados resueltos pero cuerpo que nunca llega.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockReturnValue({ ok: true, json: () => new Promise(() => {}) }),
    )
    const pendiente = verificarTurnstile({ token: "tok-cuerpo-colgado" })
    const asercion = expect(pendiente).resolves.toMatchObject({ ok: false, motivo: "error_de_red" })
    await vi.advanceTimersByTimeAsync(10_000)
    await asercion
  })

  it("8 — falla cerrada ante cuerpos JSON mal formados (null, texto) sin lanzar excepción", async () => {
    configurar()
    espiaFetch(new Response("null", { status: 200 }))
    const nulo = await verificarTurnstile({ token: "tok-null" })
    expect(nulo.ok).toBe(false)

    espiaFetch(new Response("\"texto\"", { status: 200 }))
    const texto = await verificarTurnstile({ token: "tok-texto" })
    expect(texto.ok).toBe(false)
  })

  it("8 — limita también una respuesta que nunca termina", async () => {
    configurar()
    vi.useFakeTimers()
    vi.stubGlobal(
      "fetch",
      vi.fn().mockReturnValue(new Promise(() => {})),
    )
    const pendiente = verificarTurnstile({ token: "tok-colgado" })
    const asercion = expect(pendiente).resolves.toMatchObject({ ok: false, motivo: "error_de_red" })
    await vi.advanceTimersByTimeAsync(10_000)
    await asercion
  })

  it("no registra el token ni el secreto en logs ni en el resultado", async () => {
    configurar()
    const token = "tok-super-secreto-abc123"
    espiaFetch(respuestaExito({ success: false, "error-codes": ["invalid-input-response"] }))
    const logs = vi.spyOn(console, "error").mockImplementation(() => {})
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {})
    const info = vi.spyOn(console, "log").mockImplementation(() => {})

    const resultado = await verificarTurnstile({ token })

    for (const espia of [logs, aviso, info]) {
      expect(espia).not.toHaveBeenCalled()
    }
    expect(JSON.stringify(resultado)).not.toContain(token)
    expect(JSON.stringify(resultado)).not.toContain(SECRETO_PRUEBA)
  })
})
