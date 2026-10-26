/** Pruebas de la frontera de sesión y control de envíos de la acción. */
import { beforeEach, describe, expect, it, vi } from "vitest"

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

/** Construye un envío válido que no requiere datos reales. */
function formulario() {
  const datos = new FormData()
  for (const [clave, valor] of Object.entries({ titulo: "Bache", descripcion: "Frente a la plaza principal", categoriaId: "1", prioridadId: "1", lat: "-27.37", lon: "-55.9", submissionId: "e1a3f644-9c40-4a40-9000-000000000001" })) datos.set(clave, valor)
  return datos
}

beforeEach(() => {
  vi.clearAllMocks()
  createClient.mockResolvedValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "persona", is_anonymous: false } } }) } })
  createAdminClient.mockReturnValue({})
  dobles.claim.mockResolvedValue("ok")
  dobles.workflow.mockResolvedValue({ success: true, data: { reportId: 7, imageUploaded: false } })
})

describe("crearReporteAction", () => {
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
  it("rejects a location outside the municipalities before creating a client", async () => {
    const formData = new FormData()
    formData.set("titulo", "Bache en la calle")
    formData.set("descripcion", "El bache está frente a la plaza.")
    formData.set("categoriaId", "1")
    formData.set("prioridadId", "1")
    formData.set("lat", "-27.32")
    formData.set("lon", "-55.89")
    formData.set("submissionId", "e1a3f644-9c40-4a40-9000-000000000001")

    await expect(crearReporteAction(formData)).resolves.toEqual({
      success: false,
      error: "La ubicación debe estar dentro de Posadas, Garupá o Candelaria.",
    })
    expect(createClient).not.toHaveBeenCalled()
    expect(createAdminClient).not.toHaveBeenCalled()
  })
})
