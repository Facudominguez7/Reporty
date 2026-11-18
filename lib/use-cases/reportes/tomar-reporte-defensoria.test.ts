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

    // El número de reclamo queda en el historial como evidencia (S9).
    expect(mocks.registrarCambioEstado).toHaveBeenCalledWith(
      expect.anything(),
      77,
      REPORT_STATE_IDS.PENDIENTE,
      REPORT_STATE_IDS.TOMADO_DEFENSORIA,
      "defensoria-1",
      "Reclamo Nº RE-2026-01482",
    )

    // Notificación al autor: email + notificación en el celular (S1, S4).
    expect(mocks.pushTomaDefensoria).toHaveBeenCalled()
    expect(mocks.sendTomaDefensoriaEmail).toHaveBeenCalled()
  })

  it("rechaza el número de reclamo corto (4 a 40 caracteres)", async () => {
    const { supabase } = crearSupabaseMock()
    const resultado = await tomarReporteDefensoriaWorkflow(supabase, 77, "defensoria-1", "RE")
    expect(resultado.success).toBe(false)
    if (!resultado.success) expect(resultado.error).toContain("4 y 40")
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
