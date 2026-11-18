/** Pruebas de la frontera de sesión y el control de envíos de la acción. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { createClient, createAdminClient } = vi.hoisted(() => ({
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
}))

vi.mock("@/utils/supabase/server", () => ({ createClient }))
vi.mock("@/utils/supabase/admin", () => ({ createAdminClient }))

const dobles = vi.hoisted(() => ({ workflow: vi.fn(), claim: vi.fn(), release: vi.fn(), notify: vi.fn(), buscarDuplicado: vi.fn(), rol: vi.fn() }))
vi.mock("@/database/queries/reportes/nuevo", () => ({ buscarDuplicado: dobles.buscarDuplicado }))
vi.mock("@/lib/authz/roles", async (original) => ({ ...await original<typeof import("@/lib/authz/roles")>(), getUserRoleContext: dobles.rol }))
vi.mock("@/lib/use-cases/reportes/notificar-organismos", () => ({ notificarOrganismosDeReporte: dobles.notify }))
vi.mock("next/headers", () => ({ headers: async () => new Headers() }))
vi.mock("@/lib/use-cases/reportes", () => ({ crearReporteWorkflow: dobles.workflow, mutationErrorMessage: (e: Error) => e.message }))
vi.mock("@/lib/security/report-submission-guard.server", () => ({ claimReportSubmission: dobles.claim, releaseReportSubmission: dobles.release, hashClientIp: () => "ip-sintetica", reportSubmissionClaimMessage: () => "Envío duplicado" }))
import { crearReporteAction, avisarOrganismosAction, buscarDuplicadoAction } from "./actions"


/** Construye un envío válido que no requiere datos reales. */
function formulario() {
  const datos = new FormData()
  for (const [clave, valor] of Object.entries({ titulo: "Bache", descripcion: "Frente a la plaza principal", categoriaId: "1", prioridadId: "1", lat: "-27.37", lon: "-55.9", submissionId: "e1a3f644-9c40-4a40-9000-000000000001" })) datos.set(clave, valor)
  datos.set("image", new File(["foto"], "reporte.png", { type: "image/png" }))
  return datos
}

beforeEach(() => {
  vi.clearAllMocks()
  createClient.mockResolvedValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "persona", is_anonymous: false } } }) } })
  createAdminClient.mockReturnValue({})
  dobles.claim.mockResolvedValue("ok")
  dobles.workflow.mockResolvedValue({ success: true, data: { reportId: 7, imageUploaded: false } })
  dobles.buscarDuplicado.mockResolvedValue(null)
  dobles.rol.mockResolvedValue({ data: { roleId: 2 }, error: null })
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
    await expect(crearReporteAction(formData)).resolves.toEqual({
      success: false,
      error: "La ubicación debe estar dentro de Posadas, Garupá o Candelaria.",
    })
    expect(createClient).not.toHaveBeenCalled()
    expect(createAdminClient).not.toHaveBeenCalled()
  })
})

describe("avisarOrganismosAction", () => {
  const report = { usuario_id: "persona", deleted_at: null, estado_id: 1, titulo: "Bache", categoria_id: 1, descripcion: "Calle rota", lat: -27.37, lon: -55.9 }
  // Regla S3: al avisar, el autor deja mínimo email o teléfono; la action lo persiste en el reporte.
  const contacto = { email: "flor@example.com", telefono: null }
  function db(row: (Omit<typeof report, "deleted_at"> & { deleted_at: string | null }) | null = report, photos = [{ id: 1 }]) {
    const reportQuery = { eq: vi.fn(() => reportQuery), single: vi.fn(async () => ({ data: row, error: null })) }
    const photoQuery = { eq: vi.fn(() => photoQuery), maybeSingle: vi.fn(async () => ({ data: photos[0] ?? null, error: null })) }
    const updateQuery = { eq: vi.fn(async () => ({ error: null })) }
    createAdminClient.mockReturnValue({ from: vi.fn((table: string) => ({
      select: vi.fn(() => table === "reportes" ? reportQuery : photoQuery),
      update: vi.fn(() => updateQuery),
    })) })
    return { reportQuery, photoQuery }
  }
  it("only sends on an explicit request for an owned published report", async () => {
    db(); dobles.notify.mockResolvedValue(["institucion@example.com"])
    expect(await avisarOrganismosAction(7, contacto)).toEqual({ success: true, correosEnviados: ["institucion@example.com"] })
    expect(dobles.notify).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ reporteId: 7, titulo: "Bache" }))
  })
  it.each([
    ["missing", null], ["another owner", { ...report, usuario_id: "otro" }],
    ["withdrawn", { ...report, deleted_at: "now" }], ["rejected", { ...report, estado_id: 3 }],
  ])("rejects %s without dispatch", async (_label, row) => {
    db(row); expect((await avisarOrganismosAction(7, contacto)).success).toBe(false)
    expect(dobles.notify).not.toHaveBeenCalled()
  })
  it("rejects unpublished images and invalid IDs", async () => {
    db(report, []); expect((await avisarOrganismosAction(7, contacto)).success).toBe(false)
    expect((await avisarOrganismosAction(-1, contacto)).success).toBe(false)
    expect(dobles.notify).not.toHaveBeenCalled()
  })
  it("rejects a notice without the mandatory contact (minimum email or phone, S3)", async () => {
    db()
    expect((await avisarOrganismosAction(7)).success).toBe(false)
    expect(dobles.notify).not.toHaveBeenCalled()
  })
  it("reports delivery failure rather than claiming no institution exists", async () => {
    db(); dobles.notify.mockRejectedValue(new Error("provider unavailable"))
    expect(await avisarOrganismosAction(7, contacto)).toEqual({ success: false, error: "No pudimos avisar al organismo. Intentá nuevamente." })
  })
  it("rejects missing sessions, including a lost guest session", async () => {
    db(); createClient.mockResolvedValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) } })
    expect((await avisarOrganismosAction(7, contacto)).success).toBe(false)
    expect(dobles.notify).not.toHaveBeenCalled()
  })
})

describe("crearReporteAction — sin verificación Turnstile", () => {
  it("acepta un envío autenticado sin token de seguridad", async () => {
    const datos = formulario()

    expect(await crearReporteAction(datos)).toEqual({ success: true, data: { reportId: 7, imageUploaded: false } })
    expect(dobles.claim).toHaveBeenCalledOnce()
    expect(dobles.workflow).toHaveBeenCalledOnce()
  })

  it("acepta también el envío de una sesión invitada sin token de seguridad", async () => {
    createClient.mockResolvedValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "invitado", is_anonymous: true } } }) } })

    expect(await crearReporteAction(formulario())).toEqual({ success: true, data: { reportId: 7, imageUploaded: false } })
    expect(dobles.claim).toHaveBeenCalledOnce()
    expect(dobles.workflow).toHaveBeenCalledOnce()
  })
})

describe("decisión sobre reportes duplicados al crear", () => {
  it("sin decisión envía al workflow que no confirmó ni pidió reemplazo", async () => {
    await crearReporteAction(formulario())
    expect(dobles.workflow.mock.calls[0][1]).toMatchObject({ confirmaDistinto: false, reemplazaReporteId: null })
  })

  it("pasa la confirmación de que es otro problema", async () => {
    const datos = formulario()
    datos.set("confirmaDistinto", "true")
    await crearReporteAction(datos)
    expect(dobles.workflow.mock.calls[0][1]).toMatchObject({ confirmaDistinto: true, reemplazaReporteId: null })
  })

  it("pasa el reporte propio a reemplazar", async () => {
    const datos = formulario()
    datos.set("reemplazaReporteId", "50")
    await crearReporteAction(datos)
    expect(dobles.workflow.mock.calls[0][1]).toMatchObject({ reemplazaReporteId: 50 })
  })

  it("rechaza un reporte a reemplazar inválido sin llamar al workflow", async () => {
    const datos = formulario()
    datos.set("reemplazaReporteId", "-3")
    expect(await crearReporteAction(datos)).toMatchObject({ success: false })
    expect(dobles.workflow).not.toHaveBeenCalled()
  })

  it("devuelve el aviso de duplicado del workflow y libera el envío", async () => {
    const duplicado = { tipo: "ajeno", metros: 40, reporte: { id: 50, titulo: "Alumbrado", descripcion: null, createdAt: "2026-11-14T16:29:31Z" } }
    dobles.workflow.mockResolvedValue({ success: false, error: "Ya hay un reporte parecido a 40 m.", duplicado })
    expect(await crearReporteAction(formulario())).toEqual({ success: false, error: "Ya hay un reporte parecido a 40 m.", duplicado })
    expect(dobles.release).toHaveBeenCalled()
  })
})

describe("buscarDuplicadoAction", () => {
  const coincidencia = {
    tipo: "ajeno" as const, metros: 40,
    reporte: { id: 50, usuarioId: "otra", titulo: "Alumbrado", descripcion: "Sin luz", createdAt: "2026-11-14T16:29:31Z", lat: -27.37, lon: -55.9 },
  }

  it("busca con la sesión y devuelve el aviso sin autor ni coordenadas", async () => {
    dobles.buscarDuplicado.mockResolvedValue(coincidencia)
    expect(await buscarDuplicadoAction({ categoriaId: 4, lat: -27.37, lon: -55.9 })).toEqual({
      aviso: { tipo: "ajeno", metros: 40, reporte: { id: 50, titulo: "Alumbrado", descripcion: "Sin luz", createdAt: "2026-11-14T16:29:31Z" } },
      puedeAportar: true,
    })
    expect(dobles.buscarDuplicado.mock.calls[0][1]).toEqual({ categoriaId: 4, lat: -27.37, lon: -55.9, usuarioId: "persona" })
  })

  it("sin sesión busca igual, sin reportes propios ni aportes", async () => {
    createClient.mockResolvedValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) } })
    dobles.buscarDuplicado.mockResolvedValue(coincidencia)
    expect(await buscarDuplicadoAction({ categoriaId: 4, lat: -27.37, lon: -55.9 })).toMatchObject({ puedeAportar: false })
    expect(dobles.buscarDuplicado.mock.calls[0][1]).toMatchObject({ usuarioId: null })
  })

  it("una sesión invitada no puede aportar", async () => {
    createClient.mockResolvedValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "invitada", is_anonymous: true } } }) } })
    dobles.buscarDuplicado.mockResolvedValue(coincidencia)
    expect(await buscarDuplicadoAction({ categoriaId: 4, lat: -27.37, lon: -55.9 })).toMatchObject({ puedeAportar: false })
  })

  it("sin coincidencia no hay aviso", async () => {
    expect(await buscarDuplicadoAction({ categoriaId: 4, lat: -27.37, lon: -55.9 })).toEqual({ aviso: null, puedeAportar: true })
  })

  it("con datos inválidos o fuera de cobertura no consulta", async () => {
    expect(await buscarDuplicadoAction({ categoriaId: 0, lat: -27.37, lon: -55.9 })).toEqual({ aviso: null, puedeAportar: false })
    expect(await buscarDuplicadoAction({ categoriaId: 4, lat: -34.6, lon: -58.4 })).toEqual({ aviso: null, puedeAportar: false })
    expect(dobles.buscarDuplicado).not.toHaveBeenCalled()
  })
})
