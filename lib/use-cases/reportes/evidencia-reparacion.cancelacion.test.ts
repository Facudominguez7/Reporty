/** Cancelación administrativa de una revisión de reparado y avisos de mejor esfuerzo (S4). */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"

const mocks = vi.hoisted(() => ({
  rol: vi.fn(),
  avisoCancelacion: vi.fn(),
  avisoEstado: vi.fn(),
}))

vi.mock("server-only", () => ({}))
vi.mock("@/lib/authz/roles", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/authz/roles")>()),
  getUserRoleContext: mocks.rol,
}))
vi.mock("@/lib/moderation/imagenes-reporte.server", () => ({
  moderarYGuardarImagenEvidenciaReparacion: vi.fn(),
  moderarYGuardarImagenReporte: vi.fn(),
  eliminarFotoReportePublicada: vi.fn(),
  publicarImagenModerada: vi.fn(),
  limpiarImagenModerada: vi.fn(),
}))
vi.mock("@/lib/media/report-image-validation.server", () => ({ validateUploadedReportImage: vi.fn() }))
vi.mock("@/lib/notifications/report-notifications", () => ({
  sendRepairReviewCancelledEmail: mocks.avisoCancelacion,
  sendStatusNotificationEmail: mocks.avisoEstado,
  sendCommentNotificationEmail: vi.fn(),
  sendAdminReviewNotificationEmail: vi.fn(),
}))

import { resolverEvidenciaReparacionWorkflow } from "./evidencia-reparacion"

const RESOLUCION = {
  evidencia_id: "evidencia-1",
  accion: "rechazar",
  repetida: false,
  evidencia_estado: "rechazada",
  reporte_estado_id: 1,
  cerrado: false,
  revertido: false,
  confirmaciones: 2,
  impugnaciones: 1,
  impugnaciones_pendientes: 0,
}

const RESULTADO = {
  success: true,
  data: {
    accion: "rechazar",
    repetida: false,
    evidenciaEstado: "rechazada",
    reporteEstadoId: 1,
    cerrado: false,
    revertido: false,
    confirmaciones: 2,
    impugnaciones: 1,
    impugnacionesPendientes: 0,
  },
}

/** Cliente sintético: identifica el perfil consultado y registra la inserción de historial. */
function clienteFalso(opciones: {
  repetida?: boolean
  correoAutor?: string | null
  errorHistorial?: "respuesta" | "excepcion"
} = {}) {
  const rpc = vi.fn(async () => ({ data: { ...RESOLUCION, repetida: opciones.repetida ?? false }, error: null }))
  const insertar = vi.fn(async () => {
    if (opciones.errorHistorial === "excepcion") throw new Error("historial no disponible")
    return { error: opciones.errorHistorial === "respuesta" ? { message: "historial no disponible" } : null }
  })
  const filtros: Array<{ tabla: string; columna: string; valor: unknown }> = []
  const from = vi.fn((tabla: string) => {
    let id: unknown
    const consulta = {
      select: () => consulta,
      eq: (columna: string, valor: unknown) => {
        filtros.push({ tabla, columna, valor })
        if (columna === "id") id = valor
        return consulta
      },
      insert: insertar,
      single: async () => ({
        data: tabla === "reportes" ? {
          id: 9,
          usuario_id: "duenio-reporte",
          titulo: "Bache en Av. Uruguay",
          estado_id: 1,
          deleted_at: null,
          ownerProfile: { username: "Dueña", email: "duenia@example.invalid" },
        } : null,
        error: null,
      }),
      maybeSingle: async () => ({
        data: tabla === "evidencias_reparacion" && id === "evidencia-1"
          ? { reporte_id: 9, autor_id: "autor-evidencia" }
          : tabla === "profiles" && id === "autor-evidencia"
            ? { username: "Vecino", email: opciones.correoAutor === undefined ? "vecino@example.invalid" : opciones.correoAutor }
            : tabla === "profiles" && id === "duenio-reporte"
              ? { username: "Dueña", email: "duenia@example.invalid" }
              : null,
        error: null,
      }),
    }
    return consulta
  })
  return { supabase: { rpc, from } as unknown as SupabaseClient, rpc, from, insertar, filtros }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, "error").mockImplementation(() => {})
  mocks.rol.mockResolvedValue({ data: { roleId: 1, roleName: "Admin" }, error: null })
  mocks.avisoCancelacion.mockResolvedValue({ data: { id: "correo-1" }, error: null })
  mocks.avisoEstado.mockResolvedValue({ data: { id: "correo-2" }, error: null })
})

afterEach(() => vi.restoreAllMocks())

describe("cancelar la revisión de reparado", () => {
  it("registra el motivo limpio como historial sin cambiar el estado ni los contadores", async () => {
    const cliente = clienteFalso()

    const resultado = await resolverEvidenciaReparacionWorkflow(cliente.supabase, "evidencia-1", "admin-1", "rechazar", "  La foto no corresponde  ")

    expect(resultado).toEqual(RESULTADO)
    expect(cliente.rpc).toHaveBeenCalledWith("resolver_evidencia_reparacion_admin", {
      p_evidencia_id: "evidencia-1", p_administrador_id: "admin-1", p_accion: "rechazar", p_motivo: "La foto no corresponde",
    })
    expect(cliente.insertar).toHaveBeenCalledExactlyOnceWith({
      reporte_id: 9, estado_anterior_id: 1, estado_nuevo_id: 1,
      usuario_id: "admin-1", comentario: "La foto no corresponde",
    })
  })

  it("registra un texto administrativo por defecto si no hay motivo", async () => {
    const cliente = clienteFalso()

    expect(await resolverEvidenciaReparacionWorkflow(cliente.supabase, "evidencia-1", "admin-1", "rechazar", "  ")).toEqual(RESULTADO)
    expect(cliente.rpc).toHaveBeenCalledWith("resolver_evidencia_reparacion_admin", expect.objectContaining({ p_motivo: null }))
    expect(cliente.insertar).toHaveBeenCalledExactlyOnceWith({
      reporte_id: 9, estado_anterior_id: 1, estado_nuevo_id: 1,
      usuario_id: "admin-1", comentario: "Administración canceló la revisión de reparado.",
    })
    expect(mocks.avisoCancelacion).toHaveBeenCalledWith(expect.objectContaining({ motivo: null }))
  })

  it("avisa al autor de la evidencia y no a la dueña del reporte", async () => {
    const cliente = clienteFalso()

    expect(await resolverEvidenciaReparacionWorkflow(cliente.supabase, "evidencia-1", "admin-1", "rechazar", " Foto incorrecta ")).toEqual(RESULTADO)
    expect(cliente.filtros).toContainEqual({ tabla: "profiles", columna: "id", valor: "autor-evidencia" })
    expect(mocks.avisoCancelacion).toHaveBeenCalledExactlyOnceWith({
      autorEmail: "vecino@example.invalid",
      autorUsername: "Vecino",
      reporteId: 9,
      reporteTitulo: "Bache en Av. Uruguay",
      motivo: "Foto incorrecta",
    })
    expect(mocks.avisoEstado).not.toHaveBeenCalled()
  })

  it.each([null, "", "   "])("no envía correo si el autor no tiene dirección: %j", async (correoAutor) => {
    const cliente = clienteFalso({ correoAutor })

    expect(await resolverEvidenciaReparacionWorkflow(cliente.supabase, "evidencia-1", "admin-1", "rechazar")).toEqual(RESULTADO)
    expect(cliente.insertar).toHaveBeenCalledOnce()
    expect(mocks.avisoCancelacion).not.toHaveBeenCalled()
  })

  it("una cancelación repetida no duplica historial ni correo", async () => {
    const cliente = clienteFalso({ repetida: true })

    expect(await resolverEvidenciaReparacionWorkflow(cliente.supabase, "evidencia-1", "admin-1", "rechazar"))
      .toEqual({ ...RESULTADO, data: { ...RESULTADO.data, repetida: true } })
    expect(cliente.from).not.toHaveBeenCalled()
    expect(cliente.insertar).not.toHaveBeenCalled()
    expect(mocks.avisoCancelacion).not.toHaveBeenCalled()
  })

  it.each(["respuesta", "excepcion"] as const)("si falla el historial por %s, conserva el éxito e intenta el correo", async (errorHistorial) => {
    const cliente = clienteFalso({ errorHistorial })

    expect(await resolverEvidenciaReparacionWorkflow(cliente.supabase, "evidencia-1", "admin-1", "rechazar")).toEqual(RESULTADO)
    expect(cliente.insertar).toHaveBeenCalledOnce()
    expect(console.error).toHaveBeenCalled()
    expect(mocks.avisoCancelacion).toHaveBeenCalledOnce()
  })

  it("si falla el proveedor, conserva el éxito y el historial", async () => {
    const cliente = clienteFalso()
    mocks.avisoCancelacion.mockRejectedValue(new Error("correo no disponible"))

    expect(await resolverEvidenciaReparacionWorkflow(cliente.supabase, "evidencia-1", "admin-1", "rechazar")).toEqual(RESULTADO)
    expect(cliente.insertar).toHaveBeenCalledOnce()
    expect(console.error).toHaveBeenCalled()
  })

  it("mantiene la autorización previa: un ciudadano no llama a la RPC ni deja efectos", async () => {
    const cliente = clienteFalso()
    mocks.rol.mockResolvedValue({ data: { roleId: 2 }, error: null })

    expect(await resolverEvidenciaReparacionWorkflow(cliente.supabase, "evidencia-1", "vecino", "rechazar")).toEqual({
      success: false, error: "No tenés permisos de administrador para esta acción.",
    })
    expect(cliente.rpc).not.toHaveBeenCalled()
    expect(cliente.from).not.toHaveBeenCalled()
    expect(mocks.avisoCancelacion).not.toHaveBeenCalled()
  })
})
