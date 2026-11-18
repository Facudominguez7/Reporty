import { beforeEach, describe, expect, it, vi } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"

import { REPORT_STATE_IDS, ROLE_IDS } from "@/lib/authz/catalog"

const mocks = vi.hoisted(() => ({
  getUserRoleContext: vi.fn(),
  getReportContext: vi.fn(),
  registrarCambioEstado: vi.fn(),
  pushTomaDefensoria: vi.fn(),
  sendTomaDefensoriaEmail: vi.fn(),
}))
vi.mock("@/lib/authz/roles", () => ({
  getUserRoleContext: mocks.getUserRoleContext,
  esDefensoria: (roleId: number | null | undefined) => roleId === ROLE_IDS.DEFENSORIA,
}))
vi.mock("./detail-mutations", () => ({
  getReportContext: mocks.getReportContext,
}))
vi.mock("@/database/queries/reportes/[id]/historial-estados", () => ({
  registrarCambioEstado: mocks.registrarCambioEstado,
}))
vi.mock("@/lib/push/avisos.server", () => ({
  pushTomaDefensoria: mocks.pushTomaDefensoria,
}))
vi.mock("@/lib/notifications/report-notifications", () => ({
  sendTomaDefensoriaEmail: mocks.sendTomaDefensoriaEmail,
}))

import { tomarReporteDefensoriaWorkflow } from "./tomar-reporte-defensoria"

/**
 * Cliente encadenable mínimo para el workflow: `getReportContext` hace
 * from("reportes").select(...).eq().single() y el workflow inserta/updatea por tabla.
 */
function crearSupabaseMock(overrides: { insertError?: unknown } = {}) {
  const from = vi.fn((tabla: string) => {
      if (tabla === "reportes") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: reportePendiente.data, error: null }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }),
        }
      }
      if (tabla === "profiles") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { username: "flor", email: "flor@example.com" }, error: null }),
        }
      }
      // reclamos_defensoria
      return { insert: vi.fn().mockReturnValue({ error: overrides.insertError ?? null }) }
    })
  return { supabase: { from } as unknown as SupabaseClient, from }
}

/** Reporte Pendiente con dueño autenticado, base para los escenarios. */
const reportePendiente = {
  success: true as const,
  data: {
    id: 77,
    usuario_id: "autor-1",
    titulo: "Bache profundo sobre Av. Freyre",
    estado_id: REPORT_STATE_IDS.PENDIENTE,
    lat: -27.36,
    lon: -55.9,
    deleted_at: null,
    ownerProfile: [{ username: "flor", email: "flor@example.com" }],
  },
}

const rolDefensoria = {
  success: true as const,
  data: { roleId: ROLE_IDS.DEFENSORIA },
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getUserRoleContext.mockResolvedValue(rolDefensoria)
  mocks.getReportContext.mockResolvedValue(reportePendiente)
  mocks.registrarCambioEstado.mockResolvedValue({ error: null })
  mocks.pushTomaDefensoria.mockResolvedValue(undefined)
  mocks.sendTomaDefensoriaEmail.mockResolvedValue({ error: null })
})

describe("tomarReporteDefensoriaWorkflow", () => {
  it("toma un reporte Pendiente: crea el reclamo, cambia el estado y notifica al autor", async () => {
    const { supabase, from } = crearSupabaseMock()

    const resultado = await tomarReporteDefensoriaWorkflow(supabase, 77, "defensoria-1", "RE-2026-01482")

    expect(resultado.success).toBe(true)

    const llamadaReclamo = from.mock.calls.filter(([tabla]) => tabla === "reclamos_defensoria")
    expect(llamadaReclamo.length).toBeGreaterThan(0)

    // El historial es la evidencia visible para la comunidad, pero el número de reclamo es
    // privado del autor (S9): el comentario queda neutral, sin el número.
    expect(mocks.registrarCambioEstado).toHaveBeenCalledWith(
      expect.anything(),
      77,
      REPORT_STATE_IDS.PENDIENTE,
      REPORT_STATE_IDS.TOMADO_DEFENSORIA,
      "defensoria-1",
      "Tomado por la Defensoría del Pueblo",
    )
    const comentario = mocks.registrarCambioEstado.mock.calls[0]?.[5] as string
    expect(comentario).not.toContain("RE-2026-01482")

    // Notificación al autor: email + notificación en el celular (S1, S4).
    expect(mocks.pushTomaDefensoria).toHaveBeenCalled()
    expect(mocks.sendTomaDefensoriaEmail).toHaveBeenCalled()
  })

  it.each(["RE", "R".repeat(41)])("acepta y normaliza el reclamo sin rango: %s", async (numero) => {
    const { supabase, from } = crearSupabaseMock()
    const resultado = await tomarReporteDefensoriaWorkflow(supabase, 77, "defensoria-1", `  ${numero}  `)
    expect(resultado).toEqual({ success: true, data: { numeroReclamo: numero } })
    expect(from).toHaveBeenCalledWith("reclamos_defensoria")
    expect(mocks.pushTomaDefensoria).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ numeroReclamo: numero }))
    expect(mocks.sendTomaDefensoriaEmail).toHaveBeenCalledWith(expect.objectContaining({ numeroReclamo: numero }))
  })

  it.each(["", " \t\n "])("rechaza el reclamo vacío sin efectos: %j", async (numero) => {
    const { supabase, from } = crearSupabaseMock()
    const resultado = await tomarReporteDefensoriaWorkflow(supabase, 77, "defensoria-1", numero)
    expect(resultado).toEqual({ success: false, error: "El número de reclamo es obligatorio." })
    expect(from).not.toHaveBeenCalled()
    expect(mocks.getUserRoleContext).not.toHaveBeenCalled()
    expect(mocks.registrarCambioEstado).not.toHaveBeenCalled()
    expect(mocks.pushTomaDefensoria).not.toHaveBeenCalled()
    expect(mocks.sendTomaDefensoriaEmail).not.toHaveBeenCalled()
  })

  it("rechaza un actor que no es Defensoría", async () => {
    mocks.getUserRoleContext.mockResolvedValue({ success: true, data: { roleId: ROLE_IDS.CIUDADANO } })
    const { supabase } = crearSupabaseMock()
    const resultado = await tomarReporteDefensoriaWorkflow(supabase, 77, "ciudadano-1", "RE-2026-01482")
    expect(resultado.success).toBe(false)
    if (!resultado.success) expect(resultado.error).toContain("Defensoría")
  })

  it("rechaza un reporte que ya no está Pendiente", async () => {
    mocks.getReportContext.mockResolvedValue({
      success: true as const,
      data: { ...reportePendiente.data, estado_id: REPORT_STATE_IDS.TOMADO_DEFENSORIA },
    })
    const { supabase, from } = crearSupabaseMock()
    const resultado = await tomarReporteDefensoriaWorkflow(supabase, 77, "defensoria-1", "RE-2026-01482")
    expect(resultado.success).toBe(false)
    if (!resultado.success) expect(resultado.error).toContain("ya fue tomado")
  })

  it("rechaza cuando otro tomó el reclamo primero (único por reporte)", async () => {
    const { supabase } = crearSupabaseMock({ insertError: { code: "23505" } })
    const resultado = await tomarReporteDefensoriaWorkflow(supabase, 77, "defensoria-1", "RE-2026-01482")
    expect(resultado.success).toBe(false)
    if (!resultado.success) expect(resultado.error).toContain("ya tiene un reclamo")
  })
})
