/** Contratos de creación, autorización y puntos independientes de la fotografía. */
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
const dobles = vi.hoisted(() => ({ crearReporte: vi.fn(), sumarPuntos: vi.fn(), getUserRoleContext: vi.fn(), moderarYGuardarImagenReporte: vi.fn(), subirImagenReporte: vi.fn() }))
vi.mock("@/database/queries/reportes/nuevo", () => ({ crearReporte: dobles.crearReporte, subirImagenReporte: dobles.subirImagenReporte }))
vi.mock("@/database/queries/puntos", () => ({ sumarPuntos: dobles.sumarPuntos, PUNTOS: { CREAR_REPORTE: 10 } }))
vi.mock("@/lib/authz/roles", async (original) => ({ ...await original<typeof import("@/lib/authz/roles")>(), getUserRoleContext: dobles.getUserRoleContext }))
vi.mock("@/lib/moderation/imagenes-reporte.server", () => ({ moderarYGuardarImagenReporte: dobles.moderarYGuardarImagenReporte }))
import { crearReporteWorkflow } from "./create-report"
const supabase = {} as SupabaseClient
const entrada = { usuarioId: "persona", titulo: "Bache", descripcion: "Frente a la plaza", categoriaId: 1, prioridadId: 1, lat: -27.37, lon: -55.9 }

/** Restaura respuestas independientes para evitar dependencia entre casos. */
beforeEach(() => {
  vi.clearAllMocks()
  dobles.getUserRoleContext.mockResolvedValue({ data: { roleId: 2 }, error: null })
  dobles.crearReporte.mockResolvedValue({ id: 7 })
  dobles.sumarPuntos.mockResolvedValue({ success: true })
  dobles.moderarYGuardarImagenReporte.mockResolvedValue({ estado: "REVIEW", publicada: false, motivos: ["Pendiente"], advertencias: [] })
})

describe("crearReporteWorkflow", () => {
  it("sin imagen conserva creación y puntos", async () => {
    expect(await crearReporteWorkflow(supabase, entrada)).toMatchObject({ success: true, data: { reportId: 7, imageUploaded: false, pointsAwarded: 10, isGuest: false } })
    expect(dobles.moderarYGuardarImagenReporte).not.toHaveBeenCalled()
  })
  it("invitado verificado no recibe puntos aunque su rol permita crear", async () => {
    expect(await crearReporteWorkflow(supabase, { ...entrada, actorIsAnonymous: true })).toMatchObject({ success: true, data: { pointsAwarded: 0, isGuest: true } })
    expect(dobles.sumarPuntos).not.toHaveBeenCalled()
  })
  it("rol no permitido no lee imagen ni crea reporte", async () => {
    dobles.getUserRoleContext.mockResolvedValue({ data: { roleId: 3 }, error: null })
    const image = new File(["invalida"], "x.png", { type: "image/png" }); const leer = vi.spyOn(image, "arrayBuffer")
    expect(await crearReporteWorkflow(supabase, { ...entrada, image })).toEqual({ success: false, error: "No tenés permisos para crear reportes." })
    expect(leer).not.toHaveBeenCalled(); expect(dobles.crearReporte).not.toHaveBeenCalled()
  })
  it("tipo inválido conserva error sin crear reporte", async () => {
    await expect(crearReporteWorkflow(supabase, { ...entrada, image: new File(["x"], "x.svg", { type: "image/svg+xml" }) })).rejects.toThrow("JPG, PNG o WebP")
    expect(dobles.crearReporte).not.toHaveBeenCalled()
  })
  it.each(["REJECTED", "REVIEW", "ERROR_PRIVADO", "APPROVED"])("%s conserva reporte y puntos y devuelve estado seguro", async (estado) => {
    // Encabezado aceptado históricamente; el módulo confiable simulado realiza el decode real.
    const bytes = new Uint8Array(24); bytes.set([137,80,78,71,13,10,26,10]); bytes[19] = 1; bytes[23] = 1
    const image = new File([bytes], "x.png", { type: "image/png" })
    const imageThumbnail = new File(["contenido ajeno"], "falsa.jpg", { type: "image/jpeg" })
    dobles.moderarYGuardarImagenReporte.mockResolvedValue({ estado, publicada: estado === "APPROVED", motivos: ["Texto seguro"], advertencias: [] })
    expect(await crearReporteWorkflow(supabase, { ...entrada, image, imageThumbnail })).toMatchObject({ success: true, data: { reportId: 7, pointsAwarded: 10, imageUploaded: estado === "APPROVED", imageModeration: { estado } } })
    expect(dobles.moderarYGuardarImagenReporte).toHaveBeenCalledWith(supabase, { reporteId: 7, propietarioId: "persona", image })
    expect(dobles.subirImagenReporte).not.toHaveBeenCalled()
  })
})
