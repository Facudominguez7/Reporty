/** Contratos de creación, autorización y puntos independientes de la fotografía. */
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
const dobles = vi.hoisted(() => ({ crearReporte: vi.fn(), sumarPuntos: vi.fn(), getUserRoleContext: vi.fn(), moderarYGuardarImagenReporte: vi.fn(), subirImagenReporte: vi.fn(), obtenerDireccion: vi.fn(), notificarOrganismos: vi.fn() }))
vi.mock("@/lib/geocodificacion/direccion-inversa", () => ({ obtenerDireccion: dobles.obtenerDireccion }))
vi.mock("@/database/queries/reportes/nuevo", () => ({ crearReporte: dobles.crearReporte, subirImagenReporte: dobles.subirImagenReporte }))
vi.mock("@/database/queries/puntos", () => ({ sumarPuntos: dobles.sumarPuntos, PUNTOS: { CREAR_REPORTE: 10 } }))
vi.mock("@/lib/authz/roles", async (original) => ({ ...await original<typeof import("@/lib/authz/roles")>(), getUserRoleContext: dobles.getUserRoleContext }))
vi.mock("@/lib/moderation/imagenes-reporte.server", () => ({ moderarYGuardarImagenReporte: dobles.moderarYGuardarImagenReporte }))
vi.mock("./notificar-organismos", () => ({ notificarOrganismosDeReporte: dobles.notificarOrganismos }))
import { crearReporteWorkflow } from "./create-report"
const rpc = vi.fn()
const leerReporte = vi.fn()
const consulta = { select: () => consulta, eq: () => consulta, single: leerReporte }
const supabase = { rpc, from: () => consulta } as unknown as SupabaseClient
const entrada = { usuarioId: "persona", titulo: "Bache", descripcion: "Frente a la plaza", categoriaId: 1, prioridadId: 1, lat: -27.37, lon: -55.9 }

/** Restaura respuestas independientes para evitar dependencia entre casos. */
beforeEach(() => {
  vi.clearAllMocks()
  dobles.getUserRoleContext.mockResolvedValue({ data: { roleId: 2 }, error: null })
  dobles.crearReporte.mockResolvedValue({ id: 7 })
  dobles.obtenerDireccion.mockResolvedValue("Bolívar 1450, Posadas")
  rpc.mockReset().mockResolvedValue({ data: true, error: null })
  leerReporte.mockReset().mockResolvedValue({ data: { deleted_at: null }, error: null })
  dobles.sumarPuntos.mockResolvedValue({ success: true })
  dobles.moderarYGuardarImagenReporte.mockResolvedValue({ estado: "REVIEW", publicada: false, motivos: ["Pendiente"], advertencias: [] })
  dobles.notificarOrganismos.mockResolvedValue([])
})

describe("crearReporteWorkflow", () => {
  it("bloquea el texto ofensivo antes de guardar el reporte", async () => {
    const result = await crearReporteWorkflow(supabase, { ...entrada, categoriaId: 7, titulo: "p3lotudo" })
    expect(result).toEqual({ success: false, error: "El texto contiene lenguaje ofensivo. Corregilo antes de publicar." })
    expect(dobles.crearReporte).not.toHaveBeenCalled()
    expect(dobles.obtenerDireccion).not.toHaveBeenCalled()
  })

  it("bloquea una descripción ofensiva aunque el título sea automático", async () => {
    expect(await crearReporteWorkflow(supabase, { ...entrada, descripcion: "p3lotudo el que rompió esto" })).toEqual({ success: false, error: "El texto contiene lenguaje ofensivo. Corregilo antes de publicar." })
    expect(dobles.crearReporte).not.toHaveBeenCalled()
  })
  it("arma el título con la categoría y la dirección, sin usar el título enviado", async () => {
    const result = await crearReporteWorkflow(supabase, { ...entrada, titulo: "Cualquier cosa" })
    expect(dobles.crearReporte).toHaveBeenCalledWith(supabase, expect.objectContaining({ titulo: "Bache en Bolívar 1450, Posadas" }))
    expect(result).toMatchObject({ success: true, data: { titulo: "Bache en Bolívar 1450, Posadas" } })
  })
  it.each([undefined, "", "ab"])("sin dirección pide un título escrito sin crear el reporte (%j)", async (titulo) => {
    dobles.obtenerDireccion.mockResolvedValue(null)
    expect(await crearReporteWorkflow(supabase, { ...entrada, titulo })).toEqual({
      success: false, requiereTitulo: true,
      error: "No pudimos obtener la dirección de ese punto. Escribí un título para el reporte y volvé a enviarlo.",
    })
    expect(dobles.crearReporte).not.toHaveBeenCalled()
  })
  it("sin dirección usa el título escrito por la persona", async () => {
    dobles.obtenerDireccion.mockResolvedValue(null)
    const result = await crearReporteWorkflow(supabase, { ...entrada, titulo: "  Bache frente a la escuela  " })
    expect(dobles.crearReporte).toHaveBeenCalledWith(supabase, expect.objectContaining({ titulo: "Bache frente a la escuela", direccion: null }))
    expect(result).toMatchObject({ success: true, data: { titulo: "Bache frente a la escuela" } })
  })
  it("bloquea un título ofensivo aunque la categoría tenga título automático", async () => {
    dobles.obtenerDireccion.mockResolvedValue(null)
    expect(await crearReporteWorkflow(supabase, { ...entrada, titulo: "p3lotudo" })).toEqual({ success: false, error: "El texto contiene lenguaje ofensivo. Corregilo antes de publicar." })
    expect(dobles.crearReporte).not.toHaveBeenCalled()
  })
  it("en Otros conserva el título escrito por la persona", async () => {
    await crearReporteWorkflow(supabase, { ...entrada, categoriaId: 7, titulo: "  Explosión de cloaca  " })
    expect(dobles.crearReporte).toHaveBeenCalledWith(supabase, expect.objectContaining({ titulo: "Explosión de cloaca" }))
  })
  it.each([undefined, "", "ab"])("en Otros exige un título de al menos 3 caracteres (%j)", async (titulo) => {
    expect(await crearReporteWorkflow(supabase, { ...entrada, categoriaId: 7, titulo })).toEqual({ success: false, error: "En la categoría Otros escribí un título de al menos 3 caracteres." })
    expect(dobles.crearReporte).not.toHaveBeenCalled()
  })
  it("rechaza una categoría desconocida sin crear el reporte", async () => {
    expect(await crearReporteWorkflow(supabase, { ...entrada, categoriaId: 99 })).toEqual({ success: false, error: "Seleccioná una categoría válida." })
    expect(dobles.crearReporte).not.toHaveBeenCalled()
  })
  it("guarda la dirección de las coordenadas al crear el reporte", async () => {
    await crearReporteWorkflow(supabase, entrada)
    expect(dobles.obtenerDireccion).toHaveBeenCalledWith(-27.37, -55.9)
    expect(dobles.crearReporte).toHaveBeenCalledWith(supabase, expect.objectContaining({ direccion: "Bolívar 1450, Posadas" }))
  })
  it("crea el reporte igual cuando no se encuentra la dirección", async () => {
    dobles.obtenerDireccion.mockResolvedValue(null)
    expect(await crearReporteWorkflow(supabase, { ...entrada, titulo: "Bache en la esquina" })).toMatchObject({ success: true })
    expect(dobles.crearReporte).toHaveBeenCalledWith(supabase, expect.objectContaining({ direccion: null }))
  })
  it("sin imagen conserva creación y puntos", async () => {
    expect(await crearReporteWorkflow(supabase, entrada)).toMatchObject({ success: true, data: { reportId: 7, imageUploaded: false, pointsAwarded: 10, isGuest: false } })
    expect(dobles.moderarYGuardarImagenReporte).not.toHaveBeenCalled()
  })
  it("invitado verificado no recibe puntos aunque su rol permita crear", async () => {
    expect(await crearReporteWorkflow(supabase, { ...entrada, actorIsAnonymous: true })).toMatchObject({ success: true, data: { pointsAwarded: 0, isGuest: true } })
    expect(dobles.sumarPuntos).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
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
    expect(rpc).not.toHaveBeenCalled()
    expect(dobles.sumarPuntos).not.toHaveBeenCalled()
  })
  it("reintento del mismo reporte no anuncia otro premio", async () => {
    rpc.mockResolvedValueOnce({ data: true, error: null }).mockResolvedValueOnce({ data: false, error: null })
    expect(await crearReporteWorkflow(supabase, entrada)).toMatchObject({ data: { pointsAwarded: 10 } })
    expect(await crearReporteWorkflow(supabase, entrada)).toMatchObject({ data: { pointsAwarded: 0 } })
    expect(dobles.sumarPuntos).not.toHaveBeenCalled()
  })
  it("excepción del premio no libera ni compensa el reporte ya creado", async () => {
    rpc.mockRejectedValue(new Error("fallo de transporte"))
    expect(await crearReporteWorkflow(supabase, entrada)).toMatchObject({ success: true, data: { pointsAwarded: 0 } })
    expect(dobles.sumarPuntos).not.toHaveBeenCalled()
  })
  it.each([false, null])("premio no nuevo (%s) nunca usa fallback", async (data) => {
    rpc.mockResolvedValue({ data, error: data === null ? { message: "fallo" } : null })
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
  it("la creación no envía correos a organismos automáticamente", async () => {
    const result = await crearReporteWorkflow(supabase, entrada)
    expect(dobles.notificarOrganismos).not.toHaveBeenCalled()
    expect(result).toMatchObject({ success: true, data: { correosEnviados: [] } })
  })
  it.each([
    { nombre: "foto rechazada", estado: "REJECTED" as const },
    { nombre: "retiro administrativo concurrente", estado: "APPROVED" as const, retirado: true },
  ])("$nombre no avisa a organismos", async ({ estado, retirado }) => {
    const bytes = new Uint8Array(24); bytes.set([137,80,78,71,13,10,26,10]); bytes[19] = 1; bytes[23] = 1
    if (retirado) leerReporte.mockResolvedValue({ data: { deleted_at: "retirado" }, error: null })
    dobles.moderarYGuardarImagenReporte.mockResolvedValue({ estado, publicada: false, motivos: ["x"], advertencias: [] })
    await crearReporteWorkflow(supabase, { ...entrada, image: new File([bytes], "x.png", { type: "image/png" }) })
    expect(dobles.notificarOrganismos).not.toHaveBeenCalled()
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
    else expect(rpc).not.toHaveBeenCalled()
    expect(dobles.moderarYGuardarImagenReporte).toHaveBeenCalledWith(supabase, { reporteId: 7, propietarioId: "persona", image })
    expect(dobles.subirImagenReporte).not.toHaveBeenCalled()
  })
})
