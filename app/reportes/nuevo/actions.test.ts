/** Pruebas de la frontera de sesión, la verificación Turnstile y el control de envíos de la acción. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { createClient, createAdminClient } = vi.hoisted(() => ({
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
}))

vi.mock("@/utils/supabase/server", () => ({ createClient }))
vi.mock("@/utils/supabase/admin", () => ({ createAdminClient }))

const dobles = vi.hoisted(() => ({ workflow: vi.fn(), claim: vi.fn(), release: vi.fn() }))
vi.mock("next/headers", () => ({ headers: async () => new Headers() }))
vi.mock("@/lib/use-cases/reportes", () => ({ crearReporteWorkflow: dobles.workflow, mutationErrorMessage: (e: Error) => e.message }))
vi.mock("@/lib/security/report-submission-guard.server", () => ({ claimReportSubmission: dobles.claim, releaseReportSubmission: dobles.release, hashClientIp: () => "ip-sintetica", reportSubmissionClaimMessage: () => "Envío duplicado" }))
import { crearReporteAction } from "./actions"

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"
// Secretos de prueba oficiales de Cloudflare (sin guión), válidos solo fuera de producción.
const SECRETO_PRUEBA = "1x0000000000000000000000000000000AA"
const TOKEN_DE_REPORTE = "tok-reporte-1234"
const MENSAJE_TOKEN_RECHAZADO = "La verificación falló o venció. Completá la verificación y volvé a intentarlo."
const MENSAJE_VERIFICACION_FALLIDA = "La verificación falló. Volvé a intentarlo."
const MENSAJE_RED = "No pudimos contactar la verificación. Volvé a intentarlo en unos segundos."
const MENSAJE_CAPTCHA_NO_DISPONIBLE =
  "La verificación de seguridad no está disponible en este momento. Por seguridad no podemos procesar el formulario; si el problema continúa, contactá a la administración de Reporty."

/** Respuesta controlada de Siteverify: nunca se resuelve un challenge real en las pruebas. */
function siteverify(overrides: Record<string, unknown> = {}) {
  const llamada = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({ success: true, hostname: "reporty.com.ar", action: "crear_reporte", "error-codes": [], ...overrides }),
      { status: 200 },
    ),
  )
  vi.stubGlobal("fetch", llamada)
  return llamada
}

/** Configuración de Turnstile válida para desarrollo y pruebas. */
function configurarTurnstile() {
  vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "1x00000000000000000000AA")
  vi.stubEnv("TURNSTILE_SECRET_KEY", SECRETO_PRUEBA)
  vi.stubEnv("TURNSTILE_ALLOWED_HOSTNAMES", "reporty.com.ar")
}

/** Construye un envío válido que no requiere datos reales. */
function formulario() {
  const datos = new FormData()
  for (const [clave, valor] of Object.entries({ titulo: "Bache", descripcion: "Frente a la plaza principal", categoriaId: "1", prioridadId: "1", lat: "-27.37", lon: "-55.9", submissionId: "e1a3f644-9c40-4a40-9000-000000000001" })) datos.set(clave, valor)
  datos.set("captcha_token", TOKEN_DE_REPORTE)
  datos.set("image", new File(["foto"], "reporte.png", { type: "image/png" }))
  return datos
}

beforeEach(() => {
  vi.clearAllMocks()
  configurarTurnstile()
  siteverify()
  createClient.mockResolvedValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "persona", is_anonymous: false } } }) } })
  createAdminClient.mockReturnValue({})
  dobles.claim.mockResolvedValue("ok")
  dobles.workflow.mockResolvedValue({ success: true, data: { reportId: 7, imageUploaded: false } })
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe("crearReporteAction", () => {
  it("requires a photo before starting the report submission", async () => {
    const datos = formulario()
    datos.delete("image")

    expect(await crearReporteAction(datos)).toEqual({ success: false, error: "Adjuntá una fotografía para crear el reporte." })
    expect(createClient).not.toHaveBeenCalled()
    expect(createAdminClient).not.toHaveBeenCalled()
    expect(dobles.claim).not.toHaveBeenCalled()
    expect(dobles.workflow).not.toHaveBeenCalled()
  })

  it("preserves generic UUID submission identifiers accepted before the upgrade", async () => {
    const datos = formulario()
    datos.set("submissionId", "e1a3f644-9c40-0a40-0000-000000000001")
    expect(await crearReporteAction(datos)).toEqual({ success: true, data: { reportId: 7, imageUploaded: false } })
    expect(dobles.claim.mock.calls[0][1].submissionId).toBe("e1a3f644-9c40-0a40-0000-000000000001")
  })
  it.each([
    ["titulo", "ab", "El título debe tener al menos 3 caracteres."],
    ["descripcion", "corta", "La descripción debe tener al menos 10 caracteres."],
    ["categoriaId", "0", "Seleccioná una categoría."],
    ["categoriaId", "bad", "Expected number, received nan"],
    ["prioridadId", "1.5", "Expected integer, received float"],
    ["submissionId", "bad", "No pudimos identificar el envío. Recargá la página e intentá nuevamente."],
  ])("preserves malformed %s feedback before external work", async (field, value, error) => {
    const datos = formulario(); datos.set(field, value)
    expect(await crearReporteAction(datos)).toEqual({ success: false, error })
    expect(createClient).not.toHaveBeenCalled()
    expect(createAdminClient).not.toHaveBeenCalled()
    expect(dobles.claim).not.toHaveBeenCalled()
    expect(dobles.workflow).not.toHaveBeenCalled()
  })
  it("sin sesión no procesa imagen inválida ni llama workflow", async () => {
    createClient.mockResolvedValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) } })
    const datos = formulario(); datos.set("image", new File(["invalida"], "x.svg", { type: "image/svg+xml" }))
    expect(await crearReporteAction(datos)).toMatchObject({ success: false, error: expect.stringContaining("sesión") })
    expect(dobles.claim).not.toHaveBeenCalled(); expect(dobles.workflow).not.toHaveBeenCalled()
  })
  it("duplicado no procesa imagen ni llama workflow", async () => {
    dobles.claim.mockResolvedValue("duplicate")
    const datos = formulario(); datos.set("image", new File(["invalida"], "x.svg", { type: "image/svg+xml" }))
    expect(await crearReporteAction(datos)).toEqual({ success: false, error: "Envío duplicado" })
    expect(dobles.workflow).not.toHaveBeenCalled()
  })
  it("ignora miniatura ajena y pasa solo la imagen del envío autenticado", async () => {
    const datos = formulario()
    const image = new File(["validación posterior al rol"], "x.png", { type: "image/png" })
    datos.set("image", image); datos.set("imageThumbnail", new File(["maliciosa"], "x.svg", { type: "image/svg+xml" }))
    expect(await crearReporteAction(datos)).toMatchObject({ success: true })
    expect(dobles.workflow.mock.calls[0][1]).toMatchObject({ usuarioId: "persona", actorIsAnonymous: false, image })
    expect(dobles.workflow.mock.calls[0][1]).not.toHaveProperty("imageThumbnail")
  })
  it("fallo previo a creación libera claim; éxito no lo libera", async () => {
    dobles.workflow.mockResolvedValueOnce({ success: false, error: "No permitido" })
    await crearReporteAction(formulario())
    expect(dobles.release).toHaveBeenCalledTimes(1)
    await crearReporteAction(formulario())
    expect(dobles.release).toHaveBeenCalledTimes(1)
  })
  it.each([["sin el campo", null], ["vacío", ""]])("crea el reporte con el título %s: lo arma el servidor", async (_caso, valor) => {
    const datos = formulario()
    if (valor === null) datos.delete("titulo"); else datos.set("titulo", valor)
    expect(await crearReporteAction(datos)).toEqual({ success: true, data: { reportId: 7, imageUploaded: false } })
    expect(dobles.workflow.mock.calls[0][1].titulo).toBeUndefined()
  })
  it("devuelve el pedido de título sin dirección y libera el envío para reenviarlo", async () => {
    const pedido = { success: false, requiereTitulo: true, error: "No pudimos obtener la dirección de ese punto. Escribí un título para el reporte y volvé a enviarlo." }
    dobles.workflow.mockResolvedValue(pedido)
    expect(await crearReporteAction(formulario())).toEqual(pedido)
    expect(dobles.release).toHaveBeenCalledTimes(1)
  })
  it("rejects a location outside the municipalities before creating a client", async () => {
    const formData = new FormData()
    formData.set("titulo", "Bache en la calle")
    formData.set("descripcion", "El bache está frente a la plaza.")
    formData.set("categoriaId", "1")
    formData.set("prioridadId", "1")
    formData.set("lat", "-27.32")
    formData.set("lon", "-55.89")
    formData.set("submissionId", "e1a3f644-9c40-4a40-9000-000000000001")
    formData.set("captcha_token", TOKEN_DE_REPORTE)

    await expect(crearReporteAction(formData)).resolves.toEqual({
      success: false,
      error: "La ubicación debe estar dentro de Posadas, Garupá o Candelaria.",
    })
    expect(createClient).not.toHaveBeenCalled()
    expect(createAdminClient).not.toHaveBeenCalled()
  })
})

describe("crearReporteAction — verificación Turnstile del envío final", () => {
  it("exige un token válido y lo verifica contra Siteverify con la action de creación", async () => {
    const llamada = siteverify()

    expect(await crearReporteAction(formulario())).toEqual({ success: true, data: { reportId: 7, imageUploaded: false } })

    expect(llamada).toHaveBeenCalledOnce()
    const [url, opciones] = llamada.mock.calls[0]
    expect(url).toBe(SITEVERIFY_URL)
    expect(opciones.body.get("secret")).toBe(SECRETO_PRUEBA)
    expect(opciones.body.get("response")).toBe(TOKEN_DE_REPORTE)
    expect(opciones.body.has("remoteip")).toBe(false)
  })

  it("rechaza un envío directo a la acción sin token antes de reservar el envío", async () => {
    const llamada = siteverify()
    const datos = formulario()
    datos.delete("captcha_token")

    expect(await crearReporteAction(datos)).toEqual({ success: false, error: MENSAJE_TOKEN_RECHAZADO })
    expect(llamada).not.toHaveBeenCalled()
    expect(dobles.claim).not.toHaveBeenCalled()
    expect(dobles.release).not.toHaveBeenCalled()
    expect(dobles.workflow).not.toHaveBeenCalled()
  })

  it("rechaza un token reutilizado o vencido sin crear el reporte", async () => {
    siteverify({ success: false, "error-codes": ["timeout-or-duplicate"] })

    expect(await crearReporteAction(formulario())).toEqual({ success: false, error: MENSAJE_TOKEN_RECHAZADO })
    expect(createAdminClient).not.toHaveBeenCalled()
    expect(dobles.claim).not.toHaveBeenCalled()
    expect(dobles.workflow).not.toHaveBeenCalled()
  })

  it("rechaza un token emitido para otro hostname", async () => {
    siteverify({ hostname: "malicioso.example" })

    expect(await crearReporteAction(formulario())).toEqual({ success: false, error: MENSAJE_VERIFICACION_FALLIDA })
    expect(dobles.claim).not.toHaveBeenCalled()
  })

  it("rechaza un token emitido para otra action", async () => {
    siteverify({ action: "otra_action" })

    expect(await crearReporteAction(formulario())).toEqual({ success: false, error: MENSAJE_VERIFICACION_FALLIDA })
    expect(dobles.claim).not.toHaveBeenCalled()
  })

  it("falla cerrada ante un error de red de Cloudflare", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")))

    expect(await crearReporteAction(formulario())).toEqual({ success: false, error: MENSAJE_RED })
    expect(dobles.claim).not.toHaveBeenCalled()
  })

  it("en producción falla cerrada sin verificar si falta la configuración", async () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "")
    vi.stubEnv("TURNSTILE_SECRET_KEY", "")
    const llamada = siteverify()
    const errores = vi.spyOn(console, "error").mockImplementation(() => {})

    expect(await crearReporteAction(formulario())).toEqual({ success: false, error: MENSAJE_CAPTCHA_NO_DISPONIBLE })
    expect(llamada).not.toHaveBeenCalled()
    expect(dobles.claim).not.toHaveBeenCalled()
    expect(dobles.workflow).not.toHaveBeenCalled()
    expect(errores).toHaveBeenCalled()
  })

  it("en producción falla cerrada también cuando solo falta el secreto", async () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("TURNSTILE_SECRET_KEY", "")
    vi.spyOn(console, "error").mockImplementation(() => {})
    const llamada = siteverify()

    expect(await crearReporteAction(formulario())).toEqual({ success: false, error: MENSAJE_CAPTCHA_NO_DISPONIBLE })
    expect(llamada).not.toHaveBeenCalled()
    expect(dobles.claim).not.toHaveBeenCalled()
  })

  it("fuera de producción sin configuración no exige un challenge que el formulario no puede mostrar", async () => {
    vi.stubEnv("NODE_ENV", "development")
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "")
    vi.stubEnv("TURNSTILE_SECRET_KEY", "")
    const llamada = siteverify()
    const datos = formulario()
    datos.delete("captcha_token")

    expect(await crearReporteAction(datos)).toEqual({ success: true, data: { reportId: 7, imageUploaded: false } })
    expect(llamada).not.toHaveBeenCalled()
    expect(dobles.claim).toHaveBeenCalledOnce()
  })

  it("exige el token también para una sesión de invitado", async () => {
    createClient.mockResolvedValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "invitado", is_anonymous: true } } }) } })
    siteverify({ success: false, "error-codes": ["invalid-input-response"] })

    expect(await crearReporteAction(formulario())).toEqual({ success: false, error: MENSAJE_TOKEN_RECHAZADO })
    expect(dobles.claim).not.toHaveBeenCalled()
    expect(dobles.workflow).not.toHaveBeenCalled()
  })

  it("permite reintentar con un token nuevo y sin consumir el envío del intento fallido", async () => {
    siteverify({ success: false, "error-codes": ["timeout-or-duplicate"] })
    expect(await crearReporteAction(formulario())).toMatchObject({ success: false })

    siteverify()
    const reintento = formulario()
    reintento.set("captcha_token", "tok-segundo-intento")

    expect(await crearReporteAction(reintento)).toEqual({ success: true, data: { reportId: 7, imageUploaded: false } })
    // El primer intento no reservó el envío: el reintento con token nuevo no es un duplicado.
    expect(dobles.claim).toHaveBeenCalledOnce()
    expect(dobles.release).not.toHaveBeenCalled()
  })
})
