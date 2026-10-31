import { beforeEach, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(), createAdminClient: vi.fn(), actualizarDatosReporte: vi.fn(),
  reemplazarFoto: vi.fn(), quitarFoto: vi.fn(), revalidatePath: vi.fn(),
}))
vi.mock("@/utils/supabase/server", () => ({ createClient: mocks.createClient }))
vi.mock("@/utils/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock("@/lib/use-cases/reportes", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/use-cases/reportes")>()),
  actualizarDatosReporteAdminWorkflow: mocks.actualizarDatosReporte,
  reemplazarFotoReporteAdminWorkflow: mocks.reemplazarFoto,
  quitarFotoReporteAdminWorkflow: mocks.quitarFoto,
}))
import { actualizarReporteAdminAction, cambiarEstadoAdminAction, crearComentarioAction, eliminarComentarioAdminAction, eliminarComentarioPropioAction, eliminarReporteAdminAction, eliminarReportePropioAction, quitarFotoReporteAdminAction, reemplazarFotoReporteAdminAction, votarNoExisteAction, votarReparadoAction } from "./actions"

beforeEach(() => {
  vi.clearAllMocks()
  mocks.createClient.mockResolvedValue({ auth: { getUser: async () => ({ data: { user: null } }) } })
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
  expect(await actualizarReporteAdminAction(7, { titulo: "Nuevo título", descripcion: "Descripción válida", categoriaId: 1, prioridadId: 1, lat: null, lon: null })).toEqual({
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
  const result = await actualizarReporteAdminAction(7, { titulo: "x", descripcion: "Descripción válida", categoriaId: 1, prioridadId: 1, lat: null, lon: null })
  expect(result.success).toBe(false)
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
