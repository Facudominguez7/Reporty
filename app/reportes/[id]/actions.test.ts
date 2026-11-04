import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(), createAdminClient: vi.fn(), actualizarDatosReporte: vi.fn(),
  reemplazarFoto: vi.fn(), quitarFoto: vi.fn(), revalidatePath: vi.fn(),
  crearComentario: vi.fn(), votarNoExiste: vi.fn(), votarReparado: vi.fn(),
}))
vi.mock("@/utils/supabase/server", () => ({ createClient: mocks.createClient }))
vi.mock("@/utils/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock("@/lib/use-cases/reportes", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/use-cases/reportes")>()),
  actualizarDatosReporteAdminWorkflow: mocks.actualizarDatosReporte,
  reemplazarFotoReporteAdminWorkflow: mocks.reemplazarFoto,
  quitarFotoReporteAdminWorkflow: mocks.quitarFoto,
  crearComentarioWorkflow: mocks.crearComentario,
  votarNoExisteWorkflow: mocks.votarNoExiste,
  votarReparadoWorkflow: mocks.votarReparado,
}))
import { actualizarReporteAdminAction, cambiarEstadoAdminAction, crearComentarioAction, eliminarComentarioAdminAction, eliminarComentarioPropioAction, eliminarReporteAdminAction, eliminarReportePropioAction, quitarFotoReporteAdminAction, reemplazarFotoReporteAdminAction, votarNoExisteAction, votarReparadoAction } from "./actions"

beforeEach(() => {
  vi.clearAllMocks()
  mocks.createClient.mockResolvedValue({ auth: { getUser: async () => ({ data: { user: null } }) } })
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

const invalidIdMessage = JSON.stringify([{ code: "too_small", minimum: 0, type: "number", inclusive: false, exact: false, message: "Number must be greater than 0", path: [] }], null, 2)
const cases = [
  ["votarNoExiste", (id: number) => votarNoExisteAction(id), "Tenés que iniciar sesión para votar."],
  ["crearComentario", (id: number) => crearComentarioAction(id, "problema_sigue_igual"), "Tenés que iniciar sesión para comentar."],
  ["votarReparado", (id: number) => votarReparadoAction(id), "Tenés que iniciar sesión para votar."],
  ["eliminarComentarioPropio", (id: number) => eliminarComentarioPropioAction(id), "Tenés que iniciar sesión para eliminar el comentario."],
  ["eliminarComentarioAdmin", (id: number) => eliminarComentarioAdminAction(id), "Tenés que iniciar sesión para eliminar el comentario."],
  ["eliminarReportePropio", (id: number) => eliminarReportePropioAction(id), "Tenés que iniciar sesión para eliminar el reporte."],
  ["eliminarReporteAdmin", (id: number) => eliminarReporteAdminAction(id), "Tenés que iniciar sesión para eliminar el reporte."],
  ["cambiarEstado", (id: number) => cambiarEstadoAdminAction(id, 2), "Tenés que iniciar sesión para cambiar el estado."],
] as const

it("requires a signed-in user before photo replacement or removal", async () => {
  const image = new File(["image"], "photo.png", { type: "image/png" })
  expect(await reemplazarFotoReporteAdminAction(7, 22, image)).toEqual({ success: false, error: "Tenés que iniciar sesión para editar la foto." })
  expect(await quitarFotoReporteAdminAction(7, 22)).toEqual({ success: false, error: "Tenés que iniciar sesión para editar la foto." })
  expect(mocks.reemplazarFoto).not.toHaveBeenCalled()
  expect(mocks.quitarFoto).not.toHaveBeenCalled()
})

it("passes authenticated photo replacement to the guarded workflow", async () => {
  const image = new File(["image"], "photo.png", { type: "image/png" })
  mocks.createClient.mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: "admin-1" } } }) } })
  mocks.createAdminClient.mockReturnValue({})
  mocks.reemplazarFoto.mockResolvedValue({ success: true, data: { estado: "REVIEW", publicada: false, motivos: [], advertencias: [] } })
  expect(await reemplazarFotoReporteAdminAction(7, 22, image)).toMatchObject({ success: true })
  expect(mocks.reemplazarFoto).toHaveBeenCalledWith(expect.anything(), 7, 22, "admin-1", image)
  expect(mocks.revalidatePath).toHaveBeenCalledWith("/reportes/7")
})

it("requires a signed-in user before attempting an admin report update", async () => {
  expect(await actualizarReporteAdminAction(7, { titulo: "Nuevo título" })).toEqual({
    success: false,
    error: "Tenés que iniciar sesión para editar el reporte.",
  })
  expect(mocks.createAdminClient).not.toHaveBeenCalled()
})

it.each(cases)("preserves %s authentication for valid coerced IDs", async (_name, action, error) => {
  expect(await action("7" as unknown as number)).toEqual({ success: false, error })
  expect(mocks.createClient).toHaveBeenCalledTimes(1)
  expect(mocks.createAdminClient).not.toHaveBeenCalled()
})

it.each(cases)("preserves %s malformed ID errors without external work", async (_name, action) => {
  expect(await action(-1)).toEqual({ success: false, error: invalidIdMessage })
  expect(mocks.createClient).not.toHaveBeenCalled()
  expect(mocks.createAdminClient).not.toHaveBeenCalled()
})

it.each([
  ["bad", JSON.stringify([{ code: "invalid_type", expected: "number", received: "nan", path: [], message: "Expected number, received nan" }], null, 2)],
  [1.5, JSON.stringify([{ code: "invalid_type", expected: "integer", received: "float", message: "Expected integer, received float", path: [] }], null, 2)],
])("preserves scalar numeric validation feedback for %s", async (id, error) => {
  expect(await votarNoExisteAction(id as number)).toEqual({ success: false, error })
  expect(mocks.createClient).not.toHaveBeenCalled()
  expect(mocks.createAdminClient).not.toHaveBeenCalled()
})

it("validates report edit fields before the admin workflow", async () => {
  mocks.createClient.mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: "admin-1" } } }) } })
  const result = await actualizarReporteAdminAction(7, { titulo: "x", descripcion: "Descripción válida", categoriaId: 1, prioridadId: 1 })
  expect(result.success).toBe(false)
  expect(mocks.actualizarDatosReporte).not.toHaveBeenCalled()
})

it("rejects clearing the required report location before the admin workflow", async () => {
  mocks.createClient.mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: "admin-1" } } }) } })
  mocks.createAdminClient.mockReturnValue({})
  mocks.actualizarDatosReporte.mockResolvedValue({ success: true, data: true })

  const invalidPatch = { lat: null, lon: null } as unknown as Parameters<typeof actualizarReporteAdminAction>[1]
  const result = await actualizarReporteAdminAction(7, invalidPatch)

  expect(result.success).toBe(false)
  expect(mocks.actualizarDatosReporte).not.toHaveBeenCalled()
})

it("accepts a valid single-field edit and forwards only that whitelisted field", async () => {
  mocks.createClient.mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: "admin-1" } } }) } })
  mocks.createAdminClient.mockReturnValue({})
  mocks.actualizarDatosReporte.mockResolvedValue({ success: true, data: true })

  const result = await actualizarReporteAdminAction(7, { titulo: "Nuevo título" } as Parameters<typeof actualizarReporteAdminAction>[1])

  expect(result).toEqual({ success: true, data: true })
  expect(mocks.actualizarDatosReporte).toHaveBeenCalledWith({}, 7, "admin-1", { titulo: "Nuevo título" })
  expect(mocks.revalidatePath).toHaveBeenCalledWith("/reportes/7")
})

it("rejects empty and non-editable report patches", async () => {
  mocks.createClient.mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: "admin-1" } } }) } })
  mocks.createAdminClient.mockReturnValue({})
  mocks.actualizarDatosReporte.mockResolvedValue({ success: true, data: true })
  const empty = {} as Parameters<typeof actualizarReporteAdminAction>[1]
  const immutable = {
    titulo: "Título válido", descripcion: "Descripción válida", categoriaId: 1, prioridadId: 1, lat: null, lon: null, usuario_id: "owner",
  } as unknown as Parameters<typeof actualizarReporteAdminAction>[1]

  expect((await actualizarReporteAdminAction(7, empty)).success).toBe(false)
  expect((await actualizarReporteAdminAction(7, immutable)).success).toBe(false)
  expect(mocks.actualizarDatosReporte).not.toHaveBeenCalled()
})

it("requires location patches to include both coordinates", async () => {
  mocks.createClient.mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: "admin-1" } } }) } })
  const result = await actualizarReporteAdminAction(7, { lat: -27.36 } as Parameters<typeof actualizarReporteAdminAction>[1])
  expect(result).toMatchObject({ success: false, error: expect.stringContaining("La latitud y longitud deben indicarse juntas.") })
  expect(mocks.actualizarDatosReporte).not.toHaveBeenCalled()
})

it("does not introduce a safe-integer restriction on existing IDs", async () => {
  expect(await votarNoExisteAction(9007199254740992)).toEqual({ success: false, error: "Tenés que iniciar sesión para votar." })
  expect(mocks.createClient).toHaveBeenCalledTimes(1)
  expect(mocks.createAdminClient).not.toHaveBeenCalled()
})

it.each([
  [1, false, false], [4, false, false], [5, false, false], [2, true, false],
  [2, false, true], [3, false, true], [null, false, true],
])("controla el rol %s y anonimato %s antes de usar service role", async (rol, anonimo, permitido) => {
  const consulta = { select: () => consulta, eq: () => consulta, single: async () => ({ data: { rol_id: rol, roles: null }, error: null }) }
  mocks.createClient.mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: "votante", is_anonymous: anonimo } } }) }, from: () => consulta })
  mocks.createAdminClient.mockReturnValue({ from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: null, error: {} }) }) }) }) })
  await votarReparadoAction(7)
  await votarNoExisteAction(7)
  expect(mocks.createAdminClient).toHaveBeenCalledTimes(permitido ? 2 : 0)
})

it("preserves invalid contribution feedback before external work", async () => {
  const error = JSON.stringify([{ code: "custom", message: "Elegí una actualización válida.", path: [] }], null, 2)
  expect(await crearComentarioAction(7, "invalid")).toEqual({ success: false, error })
  expect(mocks.createClient).not.toHaveBeenCalled()
  expect(mocks.createAdminClient).not.toHaveBeenCalled()
})

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"
// Secretos de prueba oficiales de Cloudflare (sin guión), válidos solo fuera de producción.
const SECRETO_PRUEBA = "1x0000000000000000000000000000000AA"
const TOKEN_DE_COMENTARIO = "tok-comentario-1234"
const APORTE = "problema_sigue_igual"
const MENSAJE_TOKEN_RECHAZADO = "La verificación falló o venció. Completá la verificación y volvé a intentarlo."
const MENSAJE_CAPTCHA_NO_DISPONIBLE =
  "La verificación de seguridad no está disponible en este momento. Por seguridad no podemos procesar el formulario; si el problema continúa, contactá a la administración de Reporty."

/** Respuesta controlada de Siteverify para la action de comentarios. */
function siteverify(overrides: Record<string, unknown> = {}) {
  const llamada = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({ success: true, hostname: "reporty.com.ar", action: "comentar_reporte", "error-codes": [], ...overrides }),
      { status: 200 },
    ),
  )
  vi.stubGlobal("fetch", llamada)
  return llamada
}

/** Configuración completa de Turnstile, tal como la tiene el despliegue protegido. */
function configurarTurnstile() {
  vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "1x00000000000000000000AA")
  vi.stubEnv("TURNSTILE_SECRET_KEY", SECRETO_PRUEBA)
  vi.stubEnv("TURNSTILE_ALLOWED_HOSTNAMES", "reporty.com.ar")
}

/** Sesión con el rol pedido; el guard se evalúa después de la autorización. */
function sesionConRol(rol: number | null, anonimo = false, id = "ciudadano-1") {
  const consulta = { select: () => consulta, eq: () => consulta, single: async () => ({ data: { rol_id: rol, roles: null }, error: null }) }
  mocks.createClient.mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: { id, is_anonymous: anonimo } } }) },
    from: () => consulta,
  })
}

describe("crearComentarioAction — verificación Turnstile", () => {
  beforeEach(() => {
    configurarTurnstile()
    siteverify()
    sesionConRol(2)
    mocks.createAdminClient.mockReturnValue({})
    mocks.crearComentario.mockResolvedValue({ success: true, data: { comment: { id: 11, contenido: "El problema sigue igual" }, pointsAwarded: 2 } })
  })

  it("verifica el token con la action de comentarios y después ejecuta el workflow", async () => {
    const llamada = siteverify()

    const resultado = await crearComentarioAction(7, APORTE, TOKEN_DE_COMENTARIO)

    expect(resultado).toMatchObject({ success: true })
    expect(llamada).toHaveBeenCalledOnce()
    const [url, opciones] = llamada.mock.calls[0]
    expect(url).toBe(SITEVERIFY_URL)
    expect(opciones.body.get("secret")).toBe(SECRETO_PRUEBA)
    expect(opciones.body.get("response")).toBe(TOKEN_DE_COMENTARIO)
    expect(mocks.crearComentario).toHaveBeenCalledOnce()
    expect(mocks.crearComentario.mock.calls[0].slice(1)).toEqual([7, "ciudadano-1", APORTE])
  })

  it("rechaza un comentario enviado directamente a la acción sin token", async () => {
    const llamada = siteverify()

    const resultado = await crearComentarioAction(7, APORTE)

    expect(resultado).toEqual({ success: false, error: MENSAJE_TOKEN_RECHAZADO })
    expect(llamada).not.toHaveBeenCalled()
    expect(mocks.crearComentario).not.toHaveBeenCalled()
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
  })

  it("rechaza un token inválido o reutilizado sin publicar ni otorgar puntos", async () => {
    siteverify({ success: false, "error-codes": ["timeout-or-duplicate"] })

    const resultado = await crearComentarioAction(7, APORTE, TOKEN_DE_COMENTARIO)

    expect(resultado).toEqual({ success: false, error: MENSAJE_TOKEN_RECHAZADO })
    expect(mocks.crearComentario).not.toHaveBeenCalled()
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
  })

  it("rechaza un token emitido para otra action, como la de creación de reportes", async () => {
    siteverify({ action: "crear_reporte" })

    expect(await crearComentarioAction(7, APORTE, TOKEN_DE_COMENTARIO)).toEqual({
      success: false,
      error: "La verificación falló. Volvé a intentarlo.",
    })
    expect(mocks.crearComentario).not.toHaveBeenCalled()
  })

  it("en producción sin configuración falla cerrada sin ejecutar el workflow", async () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "")
    vi.stubEnv("TURNSTILE_SECRET_KEY", "")
    const llamada = siteverify()

    expect(await crearComentarioAction(7, APORTE, TOKEN_DE_COMENTARIO)).toEqual({
      success: false,
      error: MENSAJE_CAPTCHA_NO_DISPONIBLE,
    })
    expect(llamada).not.toHaveBeenCalled()
    expect(mocks.crearComentario).not.toHaveBeenCalled()
  })

  it("fuera de producción sin site key mantiene el comentario tal como funcionaba", async () => {
    vi.stubEnv("NODE_ENV", "development")
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "")
    vi.stubEnv("TURNSTILE_SECRET_KEY", "")
    const llamada = siteverify()

    expect(await crearComentarioAction(7, APORTE)).toMatchObject({ success: true })
    expect(llamada).not.toHaveBeenCalled()
    expect(mocks.crearComentario).toHaveBeenCalledOnce()
  })

  it("rechaza a un invitado antes de verificar cualquier token", async () => {
    sesionConRol(2, true, "invitado-1")
    const llamada = siteverify()

    expect(await crearComentarioAction(7, APORTE, TOKEN_DE_COMENTARIO)).toEqual({
      success: false,
      error: "Vinculá tu correo para comentar y votar. Como invitado podés crear y seguir tus reportes.",
    })
    expect(llamada).not.toHaveBeenCalled()
    expect(mocks.crearComentario).not.toHaveBeenCalled()
  })

  it("rechaza a un visitante sin sesión antes de verificar cualquier token", async () => {
    mocks.createClient.mockResolvedValue({ auth: { getUser: async () => ({ data: { user: null } }) } })
    const llamada = siteverify()

    expect(await crearComentarioAction(7, APORTE, TOKEN_DE_COMENTARIO)).toEqual({
      success: false,
      error: "Tenés que iniciar sesión para comentar.",
    })
    expect(llamada).not.toHaveBeenCalled()
    expect(mocks.crearComentario).not.toHaveBeenCalled()
  })

  it("permite reintentar con un token nuevo después de un rechazo", async () => {
    siteverify({ success: false, "error-codes": ["timeout-or-duplicate"] })
    expect(await crearComentarioAction(7, APORTE, TOKEN_DE_COMENTARIO)).toMatchObject({ success: false })

    siteverify()
    expect(await crearComentarioAction(7, APORTE, "tok-segundo-intento")).toMatchObject({ success: true })
    expect(mocks.crearComentario).toHaveBeenCalledOnce()
  })
})

describe("acciones de voto sin CAPTCHA", () => {
  beforeEach(() => {
    configurarTurnstile()
    sesionConRol(2)
    mocks.createAdminClient.mockReturnValue({})
    mocks.votarNoExiste.mockResolvedValue({ success: true, data: { votosNoExiste: 1, votosReparado: 0, primero: true } })
    mocks.votarReparado.mockResolvedValue({ success: true, data: { votosNoExiste: 0, votosReparado: 1, primero: true } })
  })

  it("registra los votos sin consultar Siteverify ni pedir token", async () => {
    const llamada = siteverify()

    await expect(votarNoExisteAction(7)).resolves.toMatchObject({ success: true })
    await expect(votarReparadoAction(7)).resolves.toMatchObject({ success: true })

    expect(llamada).not.toHaveBeenCalled()
    expect(mocks.votarNoExiste).toHaveBeenCalledWith({}, 7, "ciudadano-1")
    expect(mocks.votarReparado).toHaveBeenCalledWith({}, 7, "ciudadano-1")
  })
})
