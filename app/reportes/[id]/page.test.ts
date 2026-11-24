import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import ReporteDetallePage from "./page"
import { crearComentarioAction } from "./actions"

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  getCategorias: vi.fn(),
  getPrioridades: vi.fn(),
  estadoFotografias: vi.fn(),
  tieneRevisionRechazoPendiente: vi.fn(),
  getUserRoleContext: vi.fn(),
  verificarEsAdmin: vi.fn(),
  obtenerGestionOperativaDetalle: vi.fn(),
  obtenerSeccionReparacion: vi.fn(),
  crearComentarioWorkflow: vi.fn(),
  getReporteDetalle: vi.fn(),
  getNumeroReclamoDefensoria: vi.fn(),
}))

vi.mock("./reporte-detalle-client", () => ({ ReporteDetalleClient: () => null }))
vi.mock("@/lib/moderation/estado-publico.server", () => ({
  estadoFotografias: mocks.estadoFotografias,
  tieneRevisionRechazoPendiente: mocks.tieneRevisionRechazoPendiente,
}))
vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser } }),
}))
vi.mock("@/utils/supabase/admin", () => ({ createAdminClient: () => ({}) }))
vi.mock("@/lib/use-cases/reportes", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/use-cases/reportes")>()),
  crearComentarioWorkflow: mocks.crearComentarioWorkflow,
}))
vi.mock("@/database/queries/reportes/[id]/index", () => ({
  getReporteDetalle: mocks.getReporteDetalle,
  getComentariosReporte: async () => ({ data: [] }),
  getHistorialEstados: async () => ({ data: [] }),
  getNumeroReclamoDefensoria: mocks.getNumeroReclamoDefensoria,
}))
vi.mock("@/database/queries/reportes/nuevo", () => ({
  getCategorias: mocks.getCategorias,
  getPrioridades: mocks.getPrioridades,
}))
vi.mock("@/database/queries/admin/index", () => ({
  verificarEsAdmin: mocks.verificarEsAdmin,
  getEstados: async () => ({ data: [] }),
}))
vi.mock("@/lib/authz/roles", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/authz/roles")>()),
  getUserRoleContext: mocks.getUserRoleContext,
}))
vi.mock("@/lib/use-cases/cuadrillas/detalle-operativo", () => ({
  obtenerGestionOperativaDetalle: mocks.obtenerGestionOperativaDetalle,
}))
vi.mock("@/lib/use-cases/reportes/evidencia-reparacion-detalle.server", () => ({
  obtenerSeccionReparacion: mocks.obtenerSeccionReparacion,
}))

const ROLE = { ADMIN: 1, CIUDADANO: 2, OPERADOR: 4, INVITADO: 5, DEFENSORIA: 6 }

function signInAs(roleId: number, isAnonymous = false) {
  mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1", is_anonymous: isAnonymous } } })
  mocks.getUserRoleContext.mockResolvedValue({ data: { roleId }, error: null })
  mocks.verificarEsAdmin.mockResolvedValue({ isAdmin: roleId === ROLE.ADMIN })
}

const renderPage = () => ReporteDetallePage({ params: Promise.resolve({ id: "5" }) })

describe("ReporteDetallePage", () => {
  beforeEach(() => {
    vi.stubEnv("CUADRILLAS_ENABLED", undefined)
    mocks.crearComentarioWorkflow.mockReset().mockResolvedValue({ success: true, data: {} })
    mocks.getCategorias.mockReset().mockResolvedValue([{ id: 1, nombre: "Otros" }])
    mocks.getPrioridades.mockReset().mockResolvedValue([{ id: 2, nombre: "Alta" }])
    mocks.getReporteDetalle.mockReset().mockResolvedValue({ data: { id: 5, estado_id: 1, usuario_id: "autor-5" }, error: null })
    mocks.getNumeroReclamoDefensoria.mockReset().mockResolvedValue("RE-2026-77")
    mocks.estadoFotografias.mockReset().mockResolvedValue({ pendiente: false, aprobada: false })
    mocks.tieneRevisionRechazoPendiente.mockReset().mockResolvedValue(false)
    mocks.obtenerGestionOperativaDetalle.mockReset().mockResolvedValue({
      puedeOperar: false,
      estadoOperativo: null,
      cuadrillaNombre: null,
      eventos: [],
    })
    mocks.obtenerSeccionReparacion.mockReset().mockResolvedValue(null)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("passes only the pending boolean to anonymous visitors", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } })
    mocks.estadoFotografias.mockResolvedValue({ pendiente: true, aprobada: false })
    const page = await renderPage()
    expect(page.props.fotografiaPendiente).toBe(true)
    expect(page.props.puedeContactar).toBe(false)
    expect(mocks.estadoFotografias).toHaveBeenCalledWith(5)
    expect(page.props.reporte).toEqual({ id: 5, estado_id: 1, usuario_id: "autor-5" })
  })

  it("passes only whether an open report is under admin review", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } })
    mocks.tieneRevisionRechazoPendiente.mockResolvedValue(true)
    const page = await renderPage()
    expect(page.props.revisionRechazoPendiente).toBe(true)
    expect(mocks.tieneRevisionRechazoPendiente).toHaveBeenCalledWith(5)
  })

  it("loads edit lookup options only for admins", async () => {
    signInAs(ROLE.ADMIN)
    const page = await renderPage()
    expect(page.props.categoriasDisponibles).toEqual([{ id: 1, nombre: "Otros" }])
    expect(page.props.prioridadesDisponibles).toEqual([{ id: 2, nombre: "Alta" }])
    expect(mocks.getCategorias).toHaveBeenCalledWith(expect.anything())
    expect(mocks.getPrioridades).toHaveBeenCalledWith(expect.anything())

    mocks.getCategorias.mockClear()
    mocks.getPrioridades.mockClear()
    signInAs(ROLE.CIUDADANO)
    const publicPage = await renderPage()
    expect(publicPage.props.categoriasDisponibles).toEqual([])
    expect(publicPage.props.prioridadesDisponibles).toEqual([])
    expect(mocks.getCategorias).not.toHaveBeenCalled()
    expect(mocks.getPrioridades).not.toHaveBeenCalled()
  })

  it("does not show the notice or contact action without matching moderation status", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } })
    const page = await renderPage()
    expect(page.props.fotografiaPendiente).toBe(false)
    expect(page.props.puedeContactar).toBe(false)
  })

  it("allows contact actions only when an image was explicitly approved", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } })
    mocks.estadoFotografias.mockResolvedValue({ pendiente: false, aprobada: true })
    const page = await renderPage()
    expect(page.props.puedeContactar).toBe(true)
    expect(page.props.fotografiaPendiente).toBe(false)
    expect(mocks.estadoFotografias).toHaveBeenCalledWith(5)
  })

  it("lets a citizen vote while crews are turned off", async () => {
    signInAs(ROLE.CIUDADANO)

    const page = await renderPage()

    expect(page.props.puedeVotar).toBe(true)
  })

  it("hides the crew panel while crews are turned off", async () => {
    signInAs(ROLE.CIUDADANO)

    const page = await renderPage()

    expect(page.props.gestionOperativa).toBeNull()
    expect(mocks.obtenerGestionOperativaDetalle).not.toHaveBeenCalled()
  })

  it("keeps admins, operators, guests and visitors from voting", async () => {
    for (const [roleId, isAnonymous] of [
      [ROLE.ADMIN, false],
      [ROLE.OPERADOR, false],
      [ROLE.INVITADO, true],
    ] as const) {
      signInAs(roleId, isAnonymous)
      expect((await renderPage()).props.puedeVotar).toBe(false)
    }

    mocks.getUser.mockResolvedValue({ data: { user: null } })
    expect((await renderPage()).props.puedeVotar).toBe(false)
  })

  it("loads the crew panel when crews are turned on", async () => {
    vi.stubEnv("CUADRILLAS_ENABLED", "true")
    signInAs(ROLE.CIUDADANO)

    const page = await renderPage()

    expect(mocks.obtenerGestionOperativaDetalle).toHaveBeenCalledWith(expect.anything(), "user-1", 5, ROLE.CIUDADANO)
    expect(page.props.gestionOperativa).toMatchObject({ puedeOperar: false })
    expect(page.props.puedeVotar).toBe(true)
  })

  it("lee la sesión y el rol una sola vez por pedido y los comparte con cada sección", async () => {
    vi.stubEnv("CUADRILLAS_ENABLED", "true")
    signInAs(ROLE.CIUDADANO)

    const page = await renderPage()

    expect(mocks.getUser).toHaveBeenCalledTimes(1)
    expect(mocks.getUserRoleContext).toHaveBeenCalledTimes(1)
    expect(mocks.verificarEsAdmin).not.toHaveBeenCalled()
    expect(mocks.obtenerGestionOperativaDetalle).toHaveBeenCalledWith(expect.anything(), "user-1", 5, ROLE.CIUDADANO)
    expect(mocks.obtenerSeccionReparacion).toHaveBeenCalledWith(5, 1, "autor-5", {
      usuario: { id: "user-1", is_anonymous: false },
      rolId: ROLE.CIUDADANO,
    })
    expect(page.props.puedeVotar).toBe(true)
    expect(page.props.isAdmin).toBe(false)
  })

  it("reconoce al admin con el mismo rol leído una sola vez", async () => {
    signInAs(ROLE.ADMIN)

    const page = await renderPage()

    expect(mocks.getUserRoleContext).toHaveBeenCalledTimes(1)
    expect(mocks.verificarEsAdmin).not.toHaveBeenCalled()
    expect(page.props.isAdmin).toBe(true)
  })

  it("trata como no admin a quien no tiene rol legible, sin romper la ficha", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1", is_anonymous: false } } })
    mocks.getUserRoleContext.mockResolvedValue({ data: null, error: { message: "sin perfil" } })

    const page = await renderPage()

    expect(page.props.isAdmin).toBe(false)
    expect(page.props.puedeVotar).toBe(false)
    expect(page.props.reporte).toEqual({ id: 5, estado_id: 1, usuario_id: "autor-5" })
  })

  it("oculta los votos si la lectura del rol lanza una excepción", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1", is_anonymous: false } } })
    mocks.getUserRoleContext.mockRejectedValue(new Error("red caída"))

    const page = await renderPage()

    expect(page.props.puedeVotar).toBe(false)
    expect(page.props.isAdmin).toBe(false)
    expect(page.props.reporte).toEqual({ id: 5, estado_id: 1, usuario_id: "autor-5" })
  })

  it("pide el reporte, la moderación y la revisión sin esperar la sesión ni el reporte", async () => {
    let resolverUsuario: (valor: unknown) => void = () => {}
    mocks.getUser.mockReturnValue(new Promise((resolver) => { resolverUsuario = resolver }))
    let resolverReporte: (valor: unknown) => void = () => {}
    mocks.getReporteDetalle.mockReturnValue(new Promise((resolver) => { resolverReporte = resolver }))

    const pagina = renderPage()
    await new Promise((resolver) => setTimeout(resolver, 0))

    expect(mocks.getReporteDetalle).toHaveBeenCalledTimes(1)
    // A single moderation query: the Worker lets only six requests wait for headers at a time.
    expect(mocks.estadoFotografias).toHaveBeenCalledTimes(1)
    expect(mocks.estadoFotografias).toHaveBeenCalledWith(5)
    expect(mocks.tieneRevisionRechazoPendiente).toHaveBeenCalledWith(5)

    resolverUsuario({ data: { user: null } })
    resolverReporte({ data: { id: 5, estado_id: 1, usuario_id: "autor-5" }, error: null })
    expect((await pagina).props.reporte).toEqual({ id: 5, estado_id: 1, usuario_id: "autor-5" })
  })

  it("no muestra revisión de rechazo en un reporte cerrado aunque la consulta la encuentre", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } })
    mocks.tieneRevisionRechazoPendiente.mockResolvedValue(true)
    mocks.getReporteDetalle.mockResolvedValue({ data: { id: 5, estado_id: 3, usuario_id: "autor-5" }, error: null })

    const page = await renderPage()

    expect(page.props.revisionRechazoPendiente).toBe(false)
  })

  it("no muestra datos de moderación si el reporte no existe", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } })
    mocks.estadoFotografias.mockResolvedValue({ pendiente: true, aprobada: true })
    mocks.getReporteDetalle.mockResolvedValue({ data: null, error: { message: "no existe" } })

    const page = await renderPage()

    expect(page.props.reporte).toBeNull()
    expect(page.props.fotografiaPendiente).toBe(false)
    expect(page.props.puedeContactar).toBe(false)
  })

  it("allows registered users to comment but rejects anonymous guests", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1", is_anonymous: false } } })
    mocks.getUserRoleContext.mockResolvedValue({ data: { roleId: ROLE.CIUDADANO }, error: null })
    await crearComentarioAction(5, "problema_sigue_igual")
    expect(mocks.crearComentarioWorkflow).toHaveBeenCalledWith(expect.anything(), 5, "user-1", "problema_sigue_igual")

    mocks.crearComentarioWorkflow.mockClear()
    mocks.getUser.mockResolvedValue({ data: { user: { id: "guest-1", is_anonymous: true } } })
    mocks.getUserRoleContext.mockResolvedValue({ data: { roleId: ROLE.INVITADO }, error: null })
    const guestResult = await crearComentarioAction(5, "problema_sigue_igual")
    expect(guestResult).toEqual({ success: false, error: "Vinculá tu correo para comentar y votar. Como invitado podés crear y seguir tus reportes." })
    expect(mocks.crearComentarioWorkflow).not.toHaveBeenCalled()

    mocks.getUser.mockResolvedValue({ data: { user: null } })
    const result = await crearComentarioAction(5, "problema_sigue_igual")
    expect(result.success).toBe(false)
    expect(mocks.crearComentarioWorkflow).not.toHaveBeenCalled()
  })

  it("rejects free-text contributions before reaching the workflow", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1", is_anonymous: false } } })
    const result = await crearComentarioAction(5, "Llamé a la municipalidad")
    expect(result.success).toBe(false)
    expect(mocks.crearComentarioWorkflow).not.toHaveBeenCalled()
  })
  it("pasa la sección de evidencia de reparación al detalle con el estado del reporte", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } })
    const seccion = { umbral: 3, evidencia: null, puedeInformar: false, esAutorDelReporte: false }
    mocks.obtenerSeccionReparacion.mockResolvedValue(seccion)

    const page = await renderPage()

    expect(mocks.obtenerSeccionReparacion).toHaveBeenCalledWith(5, 1, "autor-5", { usuario: null, rolId: null })
    expect(page.props.evidenciaReparacion).toEqual(seccion)
    // La ficha existente se conserva: comentarios, historial y fotografías siguen llegando.
    expect(page.props.comentarios).toEqual([])
    expect(page.props.historialEstados).toEqual([])
    expect(page.props.fotografiaPendiente).toBe(false)
  })

  it("sigue mostrando el reporte cuando la evidencia de reparación no se puede leer", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } })
    mocks.obtenerSeccionReparacion.mockRejectedValue(new Error("base no disponible"))

    const page = await renderPage()

    expect(page.props.reporte).toEqual({ id: 5, estado_id: 1, usuario_id: "autor-5" })
    expect(page.props.evidenciaReparacion).toBeNull()
  })

  it("solo el autor ve el número de reclamo en un reporte tomado por Defensoría", async () => {
    signInAs(ROLE.CIUDADANO)
    mocks.getReporteDetalle.mockResolvedValue({ data: { id: 5, estado_id: 4, usuario_id: "user-1" }, error: null })

    const page = await renderPage()

    expect(mocks.getNumeroReclamoDefensoria).toHaveBeenCalledWith(expect.anything(), 5)
    expect(page.props.numeroReclamoDefensoria).toBe("RE-2026-77")
  })

  it("un Admin que no es autor no ve el número: sin excepción en la ficha pública", async () => {
    signInAs(ROLE.ADMIN)
    mocks.getReporteDetalle.mockResolvedValue({ data: { id: 5, estado_id: 4, usuario_id: "autor-5" }, error: null })

    const page = await renderPage()

    expect(mocks.getNumeroReclamoDefensoria).not.toHaveBeenCalled()
    expect(page.props.numeroReclamoDefensoria).toBeNull()
  })

  it("Defensoría no recibe el número en la ficha pública de otro autor", async () => {
    signInAs(ROLE.DEFENSORIA)
    mocks.getReporteDetalle.mockResolvedValue({ data: { id: 5, estado_id: 4, usuario_id: "autor-5" }, error: null })

    const page = await renderPage()

    expect(mocks.getNumeroReclamoDefensoria).not.toHaveBeenCalled()
    expect(page.props.numeroReclamoDefensoria).toBeNull()
  })

  it("un visitante anónimo nunca consulta el número de un reporte tomado", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } })
    mocks.getReporteDetalle.mockResolvedValue({ data: { id: 5, estado_id: 4, usuario_id: "autor-5" }, error: null })

    const page = await renderPage()

    expect(mocks.getNumeroReclamoDefensoria).not.toHaveBeenCalled()
    expect(page.props.numeroReclamoDefensoria).toBeNull()
  })

  it("un reporte Pendiente nunca consulta el reclamo", async () => {
    signInAs(ROLE.CIUDADANO)
    mocks.getReporteDetalle.mockResolvedValue({ data: { id: 5, estado_id: 1, usuario_id: "user-1" }, error: null })

    const page = await renderPage()

    expect(mocks.getNumeroReclamoDefensoria).not.toHaveBeenCalled()
    expect(page.props.numeroReclamoDefensoria).toBeNull()
  })
})
