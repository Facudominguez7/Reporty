import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import ReporteDetallePage from "./page"
import { crearComentarioAction } from "./actions"

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  tieneFotografiaPendiente: vi.fn(),
  getUserRoleContext: vi.fn(),
  verificarEsAdmin: vi.fn(),
  obtenerGestionOperativaDetalle: vi.fn(),
  crearComentarioWorkflow: vi.fn(),
}))

vi.mock("./reporte-detalle-client", () => ({ ReporteDetalleClient: () => null }))
vi.mock("@/lib/moderation/estado-publico.server", () => ({
  tieneFotografiaPendiente: mocks.tieneFotografiaPendiente,
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
  getReporteDetalle: async () => ({ data: { id: 5, estado_id: 1 }, error: null }),
  getComentariosReporte: async () => ({ data: [] }),
  getHistorialEstados: async () => ({ data: [] }),
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

const ROLE = { ADMIN: 1, CIUDADANO: 2, OPERADOR: 4, INVITADO: 5 }

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
    mocks.tieneFotografiaPendiente.mockReset().mockResolvedValue(false)
    mocks.obtenerGestionOperativaDetalle.mockReset().mockResolvedValue({
      puedeOperar: false,
      estadoOperativo: null,
      cuadrillaNombre: null,
      eventos: [],
    })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("passes only the pending boolean to anonymous visitors", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } })
    mocks.tieneFotografiaPendiente.mockResolvedValue(true)
    const page = await renderPage()
    expect(page.props.fotografiaPendiente).toBe(true)
    expect(mocks.tieneFotografiaPendiente).toHaveBeenCalledWith(5)
    expect(page.props.reporte).toEqual({ id: 5, estado_id: 1 })
  })

  it("does not show the notice without a pending photo", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } })
    expect((await renderPage()).props.fotografiaPendiente).toBe(false)
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

    expect(mocks.obtenerGestionOperativaDetalle).toHaveBeenCalledWith(expect.anything(), "user-1", 5)
    expect(page.props.gestionOperativa).toMatchObject({ puedeOperar: false })
    expect(page.props.puedeVotar).toBe(true)
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
})
