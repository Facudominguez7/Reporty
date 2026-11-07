import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(), createAdminClient: vi.fn(), actualizarDatosReporte: vi.fn(),
  reemplazarFoto: vi.fn(), quitarFoto: vi.fn(), revalidatePath: vi.fn(),
  crearComentario: vi.fn(), votarNoExiste: vi.fn(), votarReparado: vi.fn(),
  informarReparacion: vi.fn(), verificarReparacion: vi.fn(),
  resolverEvidencia: vi.fn(), resolverImpugnacion: vi.fn(),
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
vi.mock("@/lib/use-cases/reportes/evidencia-reparacion", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/use-cases/reportes/evidencia-reparacion")>()),
  informarReparacionWorkflow: mocks.informarReparacion,
  verificarReparacionWorkflow: mocks.verificarReparacion,
  resolverEvidenciaReparacionWorkflow: mocks.resolverEvidencia,
  resolverImpugnacionReparacionWorkflow: mocks.resolverImpugnacion,
}))
import { actualizarReporteAdminAction, cambiarEstadoAdminAction, confirmarReparacionAction, crearComentarioAction, eliminarComentarioAdminAction, eliminarComentarioPropioAction, eliminarReporteAdminAction, eliminarReportePropioAction, impugnarReparacionAction, informarReparacionAction, quitarFotoReporteAdminAction, reemplazarFotoReporteAdminAction, resolverEvidenciaReparacionAdminAction, resolverImpugnacionReparacionAdminAction, votarNoExisteAction, votarReparadoAction } from "./actions"

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
  await votarNoExisteAction(7)
  expect(mocks.createAdminClient).toHaveBeenCalledTimes(permitido ? 1 : 0)
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
function sesionConRol(rol: number | null, anonimo = false, id = "ciudadano-1", emailConfirmado: string | null = "2026-01-01T00:00:00.000Z") {
  const consulta = { select: () => consulta, eq: () => consulta, single: async () => ({ data: { rol_id: rol, roles: null }, error: null }) }
  mocks.createClient.mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: { id, is_anonymous: anonimo, email_confirmed_at: emailConfirmado } } }) },
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

  it("registra el voto no existe sin consultar Siteverify ni pedir token", async () => {
    const llamada = siteverify()

    await expect(votarNoExisteAction(7)).resolves.toMatchObject({ success: true })

    expect(llamada).not.toHaveBeenCalled()
    expect(mocks.votarNoExiste).toHaveBeenCalledWith({}, 7, "ciudadano-1")
  })

  it("retira el voto reparado: nunca escribe estado ni cierra el reporte", async () => {
    const llamada = siteverify()

    expect(await votarReparadoAction(7)).toEqual({
      success: false,
      error: "El voto «reparado» fue reemplazado: informá la reparación con una foto y la comunidad la verifica.",
    })
    expect(llamada).not.toHaveBeenCalled()
    expect(mocks.votarReparado).not.toHaveBeenCalled()
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })
})

const EVIDENCIA_ID = "11111111-1111-4111-8111-111111111111"
const IMPUGNACION_ID = "22222222-2222-4222-8222-222222222222"
const TOKEN_DE_EVIDENCIA = "tok-evidencia-1234"
const COMENTARIO = "  Bache tapado y señalizado  "
const MENSAJE_SIN_SESION = "Tenés que iniciar sesión para informar una reparación."
const MENSAJE_CUENTA_REPARACION =
  "Necesitás una cuenta registrada con el correo confirmado para informar y verificar reparaciones."
const MENSAJE_COMENTARIO = "Contá en hasta 500 caracteres qué se reparó."
const MENSAJE_EVIDENCIA_INVALIDA = "No pudimos identificar la evidencia de reparación."

/** Respuesta controlada de Siteverify para la action del formulario de evidencia. */
function siteverifyEvidencia(overrides: Record<string, unknown> = {}) {
  return siteverify({ action: "informar_reparacion", ...overrides })
}

/** Foto de evidencia con tipo aceptado; el servidor valida los bytes reales. */
function fotoEvidencia() {
  return new File([new Uint8Array([1, 2, 3, 4])], "reparado.png", { type: "image/png" })
}

describe("informarReparacionAction — evidencia con moderación y Turnstile", () => {
  beforeEach(() => {
    configurarTurnstile()
    siteverifyEvidencia()
    sesionConRol(2)
    mocks.createAdminClient.mockReturnValue({})
    mocks.informarReparacion.mockResolvedValue({
      success: true,
      data: { evidenciaId: EVIDENCIA_ID, estado: "en_verificacion", publicada: true, motivos: [], advertencias: [] },
    })
  })

  it("exige sesión antes de moderar la foto", async () => {
    mocks.createClient.mockResolvedValue({ auth: { getUser: async () => ({ data: { user: null } }) } })
    const llamada = siteverifyEvidencia()

    expect(await informarReparacionAction(7, COMENTARIO, fotoEvidencia(), TOKEN_DE_EVIDENCIA)).toEqual({
      success: false,
      error: MENSAJE_SIN_SESION,
    })
    expect(llamada).not.toHaveBeenCalled()
    expect(mocks.informarReparacion).not.toHaveBeenCalled()
  })

  it.each([
    [2, true, "2026-01-01T00:00:00.000Z", "sesión anónima"],
    [2, false, null, "correo sin confirmar"],
    [5, false, "2026-01-01T00:00:00.000Z", "rol invitado"],
    [4, false, "2026-01-01T00:00:00.000Z", "operador"],
  ])("rechaza %s/%s/%s (%s) antes del CAPTCHA", async (rol, anonimo, correo, _caso) => {
    sesionConRol(rol as number, anonimo as boolean, "cuenta-1", correo as string | null)
    const llamada = siteverifyEvidencia()

    expect(await informarReparacionAction(7, COMENTARIO, fotoEvidencia(), TOKEN_DE_EVIDENCIA)).toEqual({
      success: false,
      error: MENSAJE_CUENTA_REPARACION,
    })
    expect(llamada).not.toHaveBeenCalled()
    expect(mocks.informarReparacion).not.toHaveBeenCalled()
  })

  it("permite que administración informe la reparación (L21)", async () => {
    sesionConRol(1, false, "admin-1")

    await expect(informarReparacionAction(7, COMENTARIO, fotoEvidencia(), TOKEN_DE_EVIDENCIA))
      .resolves.toMatchObject({ success: true })
    expect(mocks.informarReparacion).toHaveBeenCalledWith({}, 7, "admin-1", {
      comentario: "Bache tapado y señalizado",
      image: expect.any(File),
    })
  })

  it("verifica el token con la action de la evidencia y después ejecuta el workflow", async () => {
    const llamada = siteverifyEvidencia()

    const resultado = await informarReparacionAction(7, COMENTARIO, fotoEvidencia(), TOKEN_DE_EVIDENCIA)

    expect(resultado).toMatchObject({ success: true })
    expect(llamada).toHaveBeenCalledOnce()
    const [url, opciones] = llamada.mock.calls[0]
    expect(url).toBe(SITEVERIFY_URL)
    expect(opciones.body.get("response")).toBe(TOKEN_DE_EVIDENCIA)
    expect(mocks.informarReparacion).toHaveBeenCalledOnce()
    expect(mocks.informarReparacion).toHaveBeenCalledWith({}, 7, "ciudadano-1", {
      comentario: "Bache tapado y señalizado",
      image: expect.any(File),
    })
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/reportes/7")
  })

  it("rechaza un envío directo sin token sin moderar la foto", async () => {
    const llamada = siteverifyEvidencia()

    expect(await informarReparacionAction(7, COMENTARIO, fotoEvidencia())).toEqual({
      success: false,
      error: "La verificación falló o venció. Completá la verificación y volvé a intentarlo.",
    })
    expect(llamada).not.toHaveBeenCalled()
    expect(mocks.informarReparacion).not.toHaveBeenCalled()
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
  })

  it("valida comentario y foto antes de abrir la sesión", async () => {
    expect(await informarReparacionAction(7, "   ", fotoEvidencia(), TOKEN_DE_EVIDENCIA)).toEqual({
      success: false,
      error: MENSAJE_COMENTARIO,
    })
    expect(await informarReparacionAction(7, COMENTARIO, "no es un archivo" as unknown as File, TOKEN_DE_EVIDENCIA)).toEqual({
      success: false,
      error: "Adjuntá una fotografía de la reparación.",
    })
    expect(mocks.createClient).not.toHaveBeenCalled()
    expect(mocks.informarReparacion).not.toHaveBeenCalled()
  })

  it("informa el rechazo del workflow sin revalidar", async () => {
    mocks.informarReparacion.mockResolvedValue({ success: false, error: "Alcanzaste el límite de 3 evidencias de reparación por día." })

    expect(await informarReparacionAction(7, COMENTARIO, fotoEvidencia(), TOKEN_DE_EVIDENCIA)).toEqual({
      success: false,
      error: "Alcanzaste el límite de 3 evidencias de reparación por día.",
    })
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })
})

describe("confirmarReparacionAction e impugnarReparacionAction", () => {
  beforeEach(() => {
    configurarTurnstile()
    sesionConRol(2)
    mocks.createAdminClient.mockReturnValue({})
    mocks.verificarReparacion.mockResolvedValue({
      success: true,
      data: {
        tipo: "confirmacion", repetida: false, evidenciaEstado: "en_verificacion", reporteEstadoId: 1,
        cerrado: false, confirmaciones: 1, impugnaciones: 0, impugnacionesPendientes: 0, umbral: 3,
      },
    })
  })

  it("registra la confirmación sin CAPTCHA y revalida el reporte", async () => {
    const llamada = siteverify()

    await expect(confirmarReparacionAction(7, EVIDENCIA_ID)).resolves.toMatchObject({ success: true })

    expect(llamada).not.toHaveBeenCalled()
    expect(mocks.verificarReparacion).toHaveBeenCalledWith({}, EVIDENCIA_ID, "ciudadano-1", "confirmacion", undefined)
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/reportes/7")
  })

  it("envía el motivo de la impugnación al workflow", async () => {
    mocks.verificarReparacion.mockResolvedValue({
      success: true,
      data: {
        tipo: "impugnacion", repetida: false, evidenciaEstado: "en_verificacion", reporteEstadoId: 1,
        cerrado: false, confirmaciones: 0, impugnaciones: 1, impugnacionesPendientes: 1, umbral: 3,
      },
    })

    await expect(impugnarReparacionAction(7, EVIDENCIA_ID, "  El bache sigue  ")).resolves.toMatchObject({ success: true })

    expect(mocks.verificarReparacion).toHaveBeenCalledWith({}, EVIDENCIA_ID, "ciudadano-1", "impugnacion", "El bache sigue")
  })

  it.each([
    [2, true, "2026-01-01T00:00:00.000Z"],
    [2, false, null],
    [5, false, "2026-01-01T00:00:00.000Z"],
    [4, false, "2026-01-01T00:00:00.000Z"],
  ])("rechaza rol %s anónimo %s correo %s antes de verificar", async (rol, anonimo, correo) => {
    sesionConRol(rol as number, anonimo as boolean, "cuenta-1", correo as string | null)

    expect(await confirmarReparacionAction(7, EVIDENCIA_ID)).toEqual({ success: false, error: MENSAJE_CUENTA_REPARACION })
    expect(mocks.verificarReparacion).not.toHaveBeenCalled()
  })

  it("permite que administración confirme e impugne (L21)", async () => {
    sesionConRol(1, false, "admin-1")

    await expect(confirmarReparacionAction(7, EVIDENCIA_ID)).resolves.toMatchObject({ success: true })
    expect(mocks.verificarReparacion).toHaveBeenCalledWith({}, EVIDENCIA_ID, "admin-1", "confirmacion", undefined)

    await expect(impugnarReparacionAction(7, EVIDENCIA_ID, "  Falta terminar  ")).resolves.toMatchObject({ success: true })
    expect(mocks.verificarReparacion).toHaveBeenLastCalledWith({}, EVIDENCIA_ID, "admin-1", "impugnacion", "Falta terminar")
  })

  it("exige sesión para confirmar o impugnar", async () => {
    mocks.createClient.mockResolvedValue({ auth: { getUser: async () => ({ data: { user: null } }) } })

    expect(await confirmarReparacionAction(7, EVIDENCIA_ID)).toEqual({
      success: false,
      error: "Tenés que iniciar sesión para confirmar o impugnar una reparación.",
    })
    expect(mocks.verificarReparacion).not.toHaveBeenCalled()
  })

  it("rechaza un identificador de evidencia inválido sin abrir sesión", async () => {
    expect(await confirmarReparacionAction(7, "no-es-uuid")).toEqual({ success: false, error: MENSAJE_EVIDENCIA_INVALIDA })
    expect(mocks.createClient).not.toHaveBeenCalled()
  })
})

describe("acciones administrativas de evidencia", () => {
  beforeEach(() => {
    sesionConRol(1, false, "admin-1")
    mocks.createAdminClient.mockReturnValue({})
    mocks.resolverEvidencia.mockResolvedValue({
      success: true,
      data: {
        accion: "aprobar", repetida: false, evidenciaEstado: "validada", reporteEstadoId: 2,
        cerrado: true, revertido: false, confirmaciones: 1, impugnaciones: 0, impugnacionesPendientes: 0,
      },
    })
    mocks.resolverImpugnacion.mockResolvedValue({
      success: true,
      data: {
        accion: "descartada", repetida: false, evidenciaEstado: "en_verificacion", reporteEstadoId: 1,
        cerrado: false, revertido: false, confirmaciones: 1, impugnaciones: 1, impugnacionesPendientes: 0,
      },
    })
  })

  it("aprueba una evidencia y revalida el reporte", async () => {
    await expect(resolverEvidenciaReparacionAdminAction(7, EVIDENCIA_ID, "aprobar", "  Foto clara  ")).resolves.toMatchObject({ success: true })

    expect(mocks.resolverEvidencia).toHaveBeenCalledWith({}, EVIDENCIA_ID, "admin-1", "aprobar", "Foto clara")
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/reportes/7")
  })

  it("revierte una reparación validada", async () => {
    await resolverEvidenciaReparacionAdminAction(7, EVIDENCIA_ID, "revertir")

    expect(mocks.resolverEvidencia).toHaveBeenCalledWith({}, EVIDENCIA_ID, "admin-1", "revertir", undefined)
  })

  it("resuelve una impugnación pendiente", async () => {
    await resolverImpugnacionReparacionAdminAction(7, IMPUGNACION_ID, "descartada", "  Sigue igual  ")

    expect(mocks.resolverImpugnacion).toHaveBeenCalledWith({}, IMPUGNACION_ID, "admin-1", "descartada", "Sigue igual")
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/reportes/7")
  })

  it("rechaza acciones administrativas desconocidas sin abrir sesión", async () => {
    expect(await resolverEvidenciaReparacionAdminAction(7, EVIDENCIA_ID, "publicar" as never)).toEqual({
      success: false,
      error: "Acción administrativa inválida.",
    })
    expect(await resolverImpugnacionReparacionAdminAction(7, IMPUGNACION_ID, "ignorada" as never)).toEqual({
      success: false,
      error: "Elegí aceptar o descartar la impugnación.",
    })
    expect(mocks.createClient).not.toHaveBeenCalled()
  })

  it("exige sesión para revisar evidencias", async () => {
    mocks.createClient.mockResolvedValue({ auth: { getUser: async () => ({ data: { user: null } }) } })

    expect(await resolverEvidenciaReparacionAdminAction(7, EVIDENCIA_ID, "aprobar")).toEqual({
      success: false,
      error: "Tenés que iniciar sesión para revisar la evidencia.",
    })
  })
})
