/** Contratos de creación, autorización y puntos independientes de la fotografía. */
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
const dobles = vi.hoisted(() => ({ crearReporte: vi.fn(), sumarPuntos: vi.fn(), getUserRoleContext: vi.fn(), moderarYGuardarImagenReporte: vi.fn(), subirImagenReporte: vi.fn(), obtenerDireccion: vi.fn(), moderateText: vi.fn() }))
vi.mock("@/lib/geocodificacion/direccion-inversa", () => ({ obtenerDireccion: dobles.obtenerDireccion }))
vi.mock("@/database/queries/reportes/nuevo", () => ({ crearReporte: dobles.crearReporte, subirImagenReporte: dobles.subirImagenReporte }))
vi.mock("@/database/queries/puntos", () => ({ sumarPuntos: dobles.sumarPuntos, PUNTOS: { CREAR_REPORTE: 10 } }))
vi.mock("@/lib/authz/roles", async (original) => ({ ...await original<typeof import("@/lib/authz/roles")>(), getUserRoleContext: dobles.getUserRoleContext }))
vi.mock("@/lib/moderation/imagenes-reporte.server", () => ({ moderarYGuardarImagenReporte: dobles.moderarYGuardarImagenReporte }))
vi.mock("@/lib/moderation/textos.server", () => ({ moderateText: dobles.moderateText }))
import { crearReporteWorkflow } from "./create-report"
const rpc = vi.fn()
const leerReporte = vi.fn()
const categoria = vi.fn()
const consultaReporte = { select: () => consultaReporte, eq: () => consultaReporte, single: leerReporte }
const consultaCategoria = { select: () => consultaCategoria, eq: () => consultaCategoria, single: categoria }
const supabase = { rpc, from: (table: string) => table === "categorias" ? consultaCategoria : consultaReporte } as unknown as SupabaseClient
const entrada = { usuarioId: "persona", titulo: "Bache", descripcion: "Frente a la plaza", categoriaId: 1, prioridadId: 1, lat: -27.37, lon: -55.9 }

/** Restaura respuestas independientes para evitar dependencia entre casos. */
beforeEach(() => {
  vi.clearAllMocks()
  dobles.getUserRoleContext.mockResolvedValue({ data: { roleId: 2 }, error: null })
  dobles.crearReporte.mockResolvedValue({ id: 7 })
  dobles.obtenerDireccion.mockResolvedValue("Bolívar 1450, Posadas")
  rpc.mockReset().mockImplementation((name: string) => Promise.resolve({ data: name === "reservar_presupuesto_texto" ? true : true, error: null }))
  categoria.mockReset().mockResolvedValue({ data: { nombre: "Bache" }, error: null })
  dobles.moderateText.mockReset().mockResolvedValue({ decision: "APPROVED", motivo: "RELEVANT" })
  leerReporte.mockReset().mockResolvedValue({ data: { deleted_at: null }, error: null })
  dobles.sumarPuntos.mockResolvedValue({ success: true })
  dobles.moderarYGuardarImagenReporte.mockResolvedValue({ estado: "REVIEW", publicada: false, motivos: ["Pendiente"], advertencias: [] })
})

describe("crearReporteWorkflow", () => {
  it("rechaza trolling antes de crear reporte, moderar imagen o acreditar puntos", async () => {
    dobles.moderateText.mockResolvedValueOnce({ decision: "REJECTED", motivo: "OFF_TOPIC", error: "Reescribí" })
    const result = await crearReporteWorkflow(supabase, { ...entrada, titulo: "Cola rota", descripcion: "Se rompio una cola en el terremoto bailable" })
    expect(result).toEqual({ success: false, error: "Reescribí", errorKind: "moderation" })
    expect(dobles.crearReporte).not.toHaveBeenCalled()
    expect(dobles.moderarYGuardarImagenReporte).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalledWith("acreditar_puntos_reporte", expect.anything())
  })

  it("preserves a timeout without creation or geocoding", async () => {
    dobles.moderateText.mockResolvedValueOnce({ decision: "UNAVAILABLE", motivo: "TIMEOUT", error: "La verificación tardó demasiado. Intentá nuevamente." })
    expect(await crearReporteWorkflow(supabase, entrada)).toEqual({
      success: false, errorKind: "timeout", error: "La verificación tardó demasiado. Intentá nuevamente.",
    })
    expect(dobles.crearReporte).not.toHaveBeenCalled()
    expect(dobles.obtenerDireccion).not.toHaveBeenCalled()
  })

  it("does not send coordinates to geocoding when text moderation rejects the report", async () => {
    dobles.moderateText.mockResolvedValueOnce({ decision: "REJECTED", motivo: "OFF_TOPIC", error: "Reescribí" })
    await crearReporteWorkflow(supabase, entrada)
    expect(dobles.obtenerDireccion).not.toHaveBeenCalled()
    expect(dobles.crearReporte).not.toHaveBeenCalled()
  })

  it.each(["REJECTED", "REVIEW", "UNAVAILABLE"] as const)("blocks creation on text moderation %s", async (decision) => {
    const motivo = decision === "REJECTED" ? "OFF_TOPIC" : decision === "REVIEW" ? "UNCERTAIN" : "SERVICE_UNAVAILABLE"
    dobles.moderateText.mockResolvedValueOnce({ decision, motivo, error: "No permitido" })
    expect(await crearReporteWorkflow(supabase, entrada)).toEqual({
      success: false,
      error: "No permitido",
      errorKind: decision === "UNAVAILABLE" ? "verification" : "moderation",
    })
    expect(dobles.crearReporte).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalledWith("acreditar_puntos_reporte", expect.anything())
  })

  it.each([{ data: false, error: null }, { data: null, error: { message: "quota error" } }])("blocks when text budget cannot be reserved", async (reservation) => {
    rpc.mockResolvedValueOnce(reservation)
    expect(await crearReporteWorkflow(supabase, entrada)).toMatchObject({ success: false })
    expect(dobles.moderateText).not.toHaveBeenCalled()
    expect(dobles.crearReporte).not.toHaveBeenCalled()
  })
  it("guarda la dirección de las coordenadas al crear el reporte", async () => {
    await crearReporteWorkflow(supabase, entrada)
    expect(dobles.obtenerDireccion).toHaveBeenCalledWith(-27.37, -55.9)
    expect(dobles.crearReporte).toHaveBeenCalledWith(supabase, expect.objectContaining({ direccion: "Bolívar 1450, Posadas" }))
  })
  it("crea el reporte igual cuando no se encuentra la dirección", async () => {
    dobles.obtenerDireccion.mockResolvedValue(null)
    expect(await crearReporteWorkflow(supabase, entrada)).toMatchObject({ success: true })
    expect(dobles.crearReporte).toHaveBeenCalledWith(supabase, expect.objectContaining({ direccion: null }))
  })
  it("sin imagen conserva creación y puntos", async () => {
    expect(await crearReporteWorkflow(supabase, entrada)).toMatchObject({ success: true, data: { reportId: 7, imageUploaded: false, pointsAwarded: 10, isGuest: false } })
    expect(dobles.moderarYGuardarImagenReporte).not.toHaveBeenCalled()
  })
  it("invitado verificado no recibe puntos aunque su rol permita crear", async () => {
    expect(await crearReporteWorkflow(supabase, { ...entrada, actorIsAnonymous: true })).toMatchObject({ success: true, data: { pointsAwarded: 0, isGuest: true } })
    expect(dobles.sumarPuntos).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalledWith("acreditar_puntos_reporte", expect.anything())
  })
  it("rol no permitido no lee imagen ni crea reporte", async () => {
    dobles.getUserRoleContext.mockResolvedValue({ data: { roleId: 3 }, error: null })
    const image = new File(["invalida"], "x.png", { type: "image/png" }); const leer = vi.spyOn(image, "arrayBuffer")
    expect(await crearReporteWorkflow(supabase, { ...entrada, image })).toEqual({ success: false, error: "No tenés permisos para crear reportes." })
    expect(leer).not.toHaveBeenCalled(); expect(dobles.crearReporte).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })
  it("rol invitado tampoco invoca el premio de creación", async () => {
    dobles.getUserRoleContext.mockResolvedValue({ data: { roleId: 5 }, error: null })
    expect(await crearReporteWorkflow(supabase, entrada)).toMatchObject({ success: true, data: { pointsAwarded: 0, isGuest: true } })
    expect(rpc).not.toHaveBeenCalledWith("acreditar_puntos_reporte", expect.anything())
    expect(dobles.sumarPuntos).not.toHaveBeenCalled()
  })
  it("reintento del mismo reporte no anuncia otro premio", async () => {
    let pointsAttempt = 0
    rpc.mockImplementation((name: string) => Promise.resolve({ data: name === "reservar_presupuesto_texto" || pointsAttempt++ === 0, error: null }))
    expect(await crearReporteWorkflow(supabase, entrada)).toMatchObject({ data: { pointsAwarded: 10 } })
    expect(await crearReporteWorkflow(supabase, entrada)).toMatchObject({ data: { pointsAwarded: 0 } })
    expect(dobles.sumarPuntos).not.toHaveBeenCalled()
  })
  it("excepción del premio no libera ni compensa el reporte ya creado", async () => {
    rpc.mockImplementation((name: string) => name === "acreditar_puntos_reporte" ? Promise.reject(new Error("fallo de transporte")) : Promise.resolve({ data: true, error: null }))
    expect(await crearReporteWorkflow(supabase, entrada)).toMatchObject({ success: true, data: { pointsAwarded: 0 } })
    expect(dobles.sumarPuntos).not.toHaveBeenCalled()
  })
  it.each([false, null])("premio no nuevo (%s) nunca usa fallback", async (data) => {
    rpc.mockImplementation((name: string) => Promise.resolve(name === "reservar_presupuesto_texto" ? { data: true, error: null } : { data, error: data === null ? { message: "fallo" } : null }))
    expect(await crearReporteWorkflow(supabase, entrada)).toMatchObject({ success: true, data: { pointsAwarded: 0 } })
    expect(dobles.sumarPuntos).not.toHaveBeenCalled()
  })
  it("rechazo administrativo concurrente no devuelve premio ni publicación", async () => {
    const bytes = new Uint8Array(24); bytes.set([137,80,78,71,13,10,26,10]); bytes[19] = 1; bytes[23] = 1
    leerReporte.mockResolvedValue({ data: { deleted_at: "retirado" }, error: null })
    expect(await crearReporteWorkflow(supabase, { ...entrada, image: new File([bytes], "x.png", { type: "image/png" }) })).toMatchObject({ success: true, data: { pointsAwarded: 0, imageUploaded: false, imageModeration: { estado: "REJECTED" } } })
    expect(dobles.sumarPuntos).not.toHaveBeenCalled()
  })
  it("tipo inválido conserva error sin crear reporte", async () => {
    await expect(crearReporteWorkflow(supabase, { ...entrada, image: new File(["x"], "x.svg", { type: "image/svg+xml" }) })).rejects.toThrow("JPG, PNG o WebP")
    expect(dobles.crearReporte).not.toHaveBeenCalled()
  })
  it.each(["REJECTED", "REVIEW", "ERROR_PRIVADO", "APPROVED"])("%s usa ledger y devuelve estado seguro", async (estado) => {
    // Encabezado aceptado históricamente; el módulo confiable simulado realiza el decode real.
    const bytes = new Uint8Array(24); bytes.set([137,80,78,71,13,10,26,10]); bytes[19] = 1; bytes[23] = 1
    const image = new File([bytes], "x.png", { type: "image/png" })
    const imageThumbnail = new File(["contenido ajeno"], "falsa.jpg", { type: "image/jpeg" })
    dobles.moderarYGuardarImagenReporte.mockResolvedValue({ estado, publicada: estado === "APPROVED", motivos: ["Texto seguro"], advertencias: [] })
    expect(await crearReporteWorkflow(supabase, { ...entrada, image, imageThumbnail })).toMatchObject({ success: true, data: { reportId: 7, pointsAwarded: estado === "REJECTED" ? 0 : 10, imageUploaded: estado === "APPROVED", imageModeration: { estado } } })
    expect(dobles.sumarPuntos).not.toHaveBeenCalled()
    if (estado !== "REJECTED") expect(rpc).toHaveBeenCalledWith("acreditar_puntos_reporte", { p_reporte_id: 7 })
    else expect(rpc).not.toHaveBeenCalledWith("acreditar_puntos_reporte", expect.anything())
    expect(dobles.moderarYGuardarImagenReporte).toHaveBeenCalledWith(supabase, { reporteId: 7, propietarioId: "persona", image })
    expect(dobles.subirImagenReporte).not.toHaveBeenCalled()
  })
})
