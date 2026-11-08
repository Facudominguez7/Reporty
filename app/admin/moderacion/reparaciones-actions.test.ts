import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
  getUserRoleContext: vi.fn(),
  resolverImpugnacion: vi.fn(),
  resolverEvidencia: vi.fn(),
  revalidatePath: vi.fn(),
}))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock("@/utils/supabase/server", () => ({ createClient: mocks.createClient }))
vi.mock("@/utils/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }))
vi.mock("@/lib/authz/roles", () => ({
  getUserRoleContext: mocks.getUserRoleContext,
  isAdminRole: (roleId: number | null | undefined) => roleId === 1,
}))
vi.mock("@/lib/use-cases/reportes/evidencia-reparacion", () => ({
  resolverImpugnacionReparacionWorkflow: mocks.resolverImpugnacion,
  resolverEvidenciaReparacionWorkflow: mocks.resolverEvidencia,
}))

import { resolverEvidenciaColaAction, resolverImpugnacionColaAction } from "./reparaciones-actions"
import { ROLE_IDS } from "@/lib/authz/catalog"

const IMPUGNACION_ID = "11111111-1111-4111-8111-111111111111"
const EVIDENCIA_ID = "22222222-2222-4222-8222-222222222222"

const admin = { from: vi.fn() }
let filas: Record<string, unknown>

/** Consulta administrativa falsa: `select(...).eq(...).maybeSingle()`. */
function consultaFalsa(tabla: string) {
  const consulta = {
    eq: vi.fn(() => consulta),
    select: vi.fn(() => consulta),
    maybeSingle: vi.fn(async () => ({ data: filas[tabla] ?? null, error: null })),
  }
  return { select: consulta.select, eq: consulta.eq, maybeSingle: consulta.maybeSingle }
}

beforeEach(() => {
  vi.clearAllMocks()
  filas = {}
  mocks.createClient.mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: { id: "admin-1", is_anonymous: false } } }) },
  })
  mocks.createAdminClient.mockReturnValue(admin)
  mocks.getUserRoleContext.mockResolvedValue({ data: { roleId: ROLE_IDS.ADMIN }, error: null })
  mocks.resolverImpugnacion.mockResolvedValue({
    success: true,
    data: {
      accion: "aceptada", repetida: false, evidenciaEstado: "rechazada", reporteEstadoId: 1,
      cerrado: false, confirmaciones: 2, impugnaciones: 1, impugnacionesPendientes: 0,
    },
  })
  mocks.resolverEvidencia.mockResolvedValue({
    success: true,
    data: {
      accion: "aprobar", repetida: false, evidenciaEstado: "validada", reporteEstadoId: 2,
      cerrado: true, revertido: false, confirmaciones: 3, impugnaciones: 0, impugnacionesPendientes: 0,
    },
  })
  admin.from.mockImplementation((tabla: string) => consultaFalsa(tabla))
})

describe("acción administrativa: resolver una impugnación", () => {
  it("delega la aceptación en el caso de uso con el administrador de la sesión", async () => {
    filas.verificaciones_reparacion = {
      id: IMPUGNACION_ID,
      tipo: "impugnacion",
      estado: "pendiente",
      evidencias_reparacion: { reporte_id: 9 },
    }

    expect(await resolverImpugnacionColaAction(IMPUGNACION_ID, "aceptada")).toMatchObject({ success: true })

    expect(mocks.resolverImpugnacion).toHaveBeenCalledWith(admin, IMPUGNACION_ID, "admin-1", "aceptada", undefined)
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/moderacion")
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/reportes/9")
  })

  it("no delega una impugnación que otra persona ya resolvió y pide actualizar la cola", async () => {
    filas.verificaciones_reparacion = {
      id: IMPUGNACION_ID,
      tipo: "impugnacion",
      estado: "aceptada",
      evidencias_reparacion: { reporte_id: 9 },
    }

    expect(await resolverImpugnacionColaAction(IMPUGNACION_ID, "descartada")).toEqual({
      success: false,
      error: "La impugnación ya fue resuelta. Actualizá la cola antes de decidir.",
    })
    expect(mocks.resolverImpugnacion).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it("no delega una verificación que no es una impugnación", async () => {
    filas.verificaciones_reparacion = {
      id: IMPUGNACION_ID,
      tipo: "confirmacion",
      estado: "pendiente",
      evidencias_reparacion: { reporte_id: 9 },
    }

    expect(await resolverImpugnacionColaAction(IMPUGNACION_ID, "aceptada")).toMatchObject({ success: false })
    expect(mocks.resolverImpugnacion).not.toHaveBeenCalled()
  })

  it("devuelve el error del caso de uso sin revalidar la cola", async () => {
    filas.verificaciones_reparacion = {
      id: IMPUGNACION_ID,
      tipo: "impugnacion",
      estado: "pendiente",
      evidencias_reparacion: { reporte_id: 9 },
    }
    mocks.resolverImpugnacion.mockResolvedValue({ success: false, error: "No pudimos resolver la impugnación." })

    expect(await resolverImpugnacionColaAction(IMPUGNACION_ID, "aceptada")).toEqual({
      success: false,
      error: "No pudimos resolver la impugnación.",
    })
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })
})

describe("acción administrativa: resolver una evidencia", () => {
  it("aprueba una evidencia publicada y revalida la ficha del reporte", async () => {
    filas.evidencias_reparacion = { id: EVIDENCIA_ID, estado: "en_verificacion", reporte_id: 9 }

    expect(await resolverEvidenciaColaAction(EVIDENCIA_ID, "aprobar")).toMatchObject({ success: true })

    expect(mocks.resolverEvidencia).toHaveBeenCalledWith(admin, EVIDENCIA_ID, "admin-1", "aprobar", undefined)
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/moderacion")
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/reportes/9")
  })

  it("no aprueba una evidencia que todavía espera la foto publicada", async () => {
    filas.evidencias_reparacion = { id: EVIDENCIA_ID, estado: "informada", reporte_id: 9 }

    expect(await resolverEvidenciaColaAction(EVIDENCIA_ID, "aprobar")).toEqual({
      success: false,
      error: "La evidencia ya cambió de estado. Recargá la cola antes de decidir.",
    })
    expect(mocks.resolverEvidencia).not.toHaveBeenCalled()
  })

  it("delega la cancelación de la revisión con el motivo recortado que escribió administración", async () => {
    filas.evidencias_reparacion = { id: EVIDENCIA_ID, estado: "en_verificacion", reporte_id: 9 }
    mocks.resolverEvidencia.mockResolvedValue({
      success: true,
      data: {
        accion: "rechazar", repetida: false, evidenciaEstado: "rechazada", reporteEstadoId: 1,
        cerrado: false, revertido: false, confirmaciones: 1, impugnaciones: 0, impugnacionesPendientes: 0,
      },
    })

    expect(await resolverEvidenciaColaAction(EVIDENCIA_ID, "rechazar", "  la foto es una captura  ")).toMatchObject({ success: true })
    expect(mocks.resolverEvidencia).toHaveBeenCalledWith(admin, EVIDENCIA_ID, "admin-1", "rechazar", "la foto es una captura")
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/reportes/9")
  })

  it("solo revierte una evidencia validada", async () => {
    filas.evidencias_reparacion = { id: EVIDENCIA_ID, estado: "validada", reporte_id: 9 }
    mocks.resolverEvidencia.mockResolvedValue({
      success: true,
      data: {
        accion: "revertir", repetida: false, evidenciaEstado: "revertida", reporteEstadoId: 1,
        cerrado: false, revertido: true, confirmaciones: 3, impugnaciones: 0, impugnacionesPendientes: 0,
      },
    })

    expect(await resolverEvidenciaColaAction(EVIDENCIA_ID, "revertir")).toMatchObject({ success: true })
    expect(mocks.resolverEvidencia).toHaveBeenCalledWith(admin, EVIDENCIA_ID, "admin-1", "revertir", undefined)

    filas.evidencias_reparacion = { id: EVIDENCIA_ID, estado: "en_verificacion", reporte_id: 9 }
    expect(await resolverEvidenciaColaAction(EVIDENCIA_ID, "revertir")).toMatchObject({ success: false })
  })
})

describe("acción administrativa: autorización y entrada", () => {
  it("deniega a quien no es administrador antes de usar el cliente de servicio", async () => {
    mocks.getUserRoleContext.mockResolvedValue({ data: { roleId: ROLE_IDS.OPERADOR }, error: null })

    expect(await resolverImpugnacionColaAction(IMPUGNACION_ID, "aceptada")).toEqual({
      success: false,
      error: "No tenés permisos para resolver la cola de reparaciones.",
    })
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
    expect(mocks.resolverImpugnacion).not.toHaveBeenCalled()
  })

  it("deniega sesiones anónimas y sesiones cerradas", async () => {
    mocks.createClient.mockResolvedValue({ auth: { getUser: async () => ({ data: { user: null } }) } })
    expect(await resolverEvidenciaColaAction(EVIDENCIA_ID, "aprobar")).toEqual({
      success: false,
      error: "Tenés que iniciar sesión como administrador.",
    })
    expect(mocks.resolverEvidencia).not.toHaveBeenCalled()

    mocks.createClient.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: "invitado-1", is_anonymous: true } } }) },
    })
    expect(await resolverEvidenciaColaAction(EVIDENCIA_ID, "aprobar")).toMatchObject({ success: false })
    expect(mocks.resolverEvidencia).not.toHaveBeenCalled()
  })

  it("rechaza identificadores inválidos y decisiones desconocidas sin tocar la base", async () => {
    expect(await resolverImpugnacionColaAction("no-es-uuid", "aceptada")).toEqual({
      success: false,
      error: "La solicitud no es válida.",
    })
    const accionDesconocida = "publicar" as unknown as Parameters<typeof resolverEvidenciaColaAction>[1]
    expect(await resolverEvidenciaColaAction(EVIDENCIA_ID, accionDesconocida)).toEqual({
      success: false,
      error: "La solicitud no es válida.",
    })
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
    expect(mocks.resolverImpugnacion).not.toHaveBeenCalled()
    expect(mocks.resolverEvidencia).not.toHaveBeenCalled()
  })
})
