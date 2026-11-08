/** Cancelación de una revisión de reparado y avisos de mejor esfuerzo (S4, S7). */
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

import { resolverEvidenciaReparacionWorkflow, resolverImpugnacionReparacionWorkflow } from "./evidencia-reparacion"

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

const RESOLUCION_IMPUGNACION = {
  verificacion_id: "impugnacion-1",
  decision: "aceptada",
  repetida: false,
  evidencia_estado: "rechazada",
  reporte_estado_id: 1,
  cerrado: false,
  confirmaciones: 2,
  impugnaciones: 1,
  impugnaciones_pendientes: 0,
}

const RESULTADO_IMPUGNACION = {
  success: true,
  data: {
    accion: "aceptada",
    repetida: false,
    evidenciaEstado: "rechazada",
    reporteEstadoId: 1,
    cerrado: false,
    confirmaciones: 2,
    impugnaciones: 1,
    impugnacionesPendientes: 0,
  },
}

/** Cliente sintético: identifica el perfil consultado y detecta escrituras fuera de la RPC. */
function clienteFalso(opciones: {
  repetida?: boolean
  correoAutor?: string | null
  errorRpc?: boolean
  respuestaImpugnacion?: Partial<typeof RESOLUCION_IMPUGNACION>
} = {}) {
  const rpc = vi.fn(async (nombre: string) => opciones.errorRpc
    ? { data: null, error: { code: "XX000", message: "historial no disponible" } }
    : { data: nombre === "resolver_impugnacion_reparacion"
      ? { ...RESOLUCION_IMPUGNACION, repetida: opciones.repetida ?? false, ...opciones.respuestaImpugnacion }
      : { ...RESOLUCION, repetida: opciones.repetida ?? false }, error: null })
  const insertar = vi.fn(async () => ({ error: null }))
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
        data: tabla === "verificaciones_reparacion" && id === "impugnacion-1"
          ? { evidencia_id: "evidencia-1" }
          : tabla === "evidencias_reparacion" && id === "evidencia-1"
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
  it("envía el motivo limpio a la RPC sin insertar historial desde el caso de uso", async () => {
    const cliente = clienteFalso()

    const resultado = await resolverEvidenciaReparacionWorkflow(cliente.supabase, "evidencia-1", "admin-1", "rechazar", "  La foto no corresponde  ")

    expect(resultado).toEqual(RESULTADO)
    expect(cliente.rpc).toHaveBeenCalledWith("resolver_evidencia_reparacion_admin", {
      p_evidencia_id: "evidencia-1", p_administrador_id: "admin-1", p_accion: "rechazar", p_motivo: "La foto no corresponde",
    })
    expect(cliente.from).not.toHaveBeenCalledWith("historial_estados")
    expect(cliente.insertar).not.toHaveBeenCalled()
  })

  it("delega a la RPC el motivo por defecto y avisa sin motivo si está vacío", async () => {
    const cliente = clienteFalso()

    expect(await resolverEvidenciaReparacionWorkflow(cliente.supabase, "evidencia-1", "admin-1", "rechazar", "  ")).toEqual(RESULTADO)
    expect(cliente.rpc).toHaveBeenCalledWith("resolver_evidencia_reparacion_admin", expect.objectContaining({ p_motivo: null }))
    expect(cliente.from).not.toHaveBeenCalledWith("historial_estados")
    expect(cliente.insertar).not.toHaveBeenCalled()
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
    expect(cliente.from).not.toHaveBeenCalledWith("historial_estados")
    expect(cliente.insertar).not.toHaveBeenCalled()
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

  it("si falla la RPC, devuelve error sin insertar historial ni intentar el correo", async () => {
    const cliente = clienteFalso({ errorRpc: true })

    expect(await resolverEvidenciaReparacionWorkflow(cliente.supabase, "evidencia-1", "admin-1", "rechazar")).toEqual({
      success: false, error: "No pudimos resolver la evidencia. Recargá la revisión e intentá nuevamente.",
    })
    expect(cliente.from).not.toHaveBeenCalled()
    expect(cliente.insertar).not.toHaveBeenCalled()
    expect(mocks.avisoCancelacion).not.toHaveBeenCalled()
  })

  it.each(["respuesta", "excepción"] as const)("si falla el correo por %s, conserva el resultado de la RPC", async (tipoFalla) => {
    const cliente = clienteFalso()
    if (tipoFalla === "respuesta") {
      mocks.avisoCancelacion.mockResolvedValue({ data: null, error: { message: "correo no disponible" } })
    } else {
      mocks.avisoCancelacion.mockRejectedValue(new Error("correo no disponible"))
    }

    expect(await resolverEvidenciaReparacionWorkflow(cliente.supabase, "evidencia-1", "admin-1", "rechazar")).toEqual(RESULTADO)
    expect(cliente.from).not.toHaveBeenCalledWith("historial_estados")
    expect(cliente.insertar).not.toHaveBeenCalled()
    expect(mocks.avisoCancelacion).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      autorEmail: "vecino@example.invalid", motivo: null,
    }))
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

describe("aceptar una impugnación de reparación", () => {
  it("avisa al autor de la evidencia con el motivo limpio, no a la dueña del reporte", async () => {
    const cliente = clienteFalso()

    expect(await resolverImpugnacionReparacionWorkflow(cliente.supabase, "impugnacion-1", "admin-1", "aceptada", "  Foto incorrecta  "))
      .toEqual(RESULTADO_IMPUGNACION)
    expect(cliente.rpc).toHaveBeenCalledExactlyOnceWith("resolver_impugnacion_reparacion", {
      p_verificacion_id: "impugnacion-1", p_administrador_id: "admin-1", p_decision: "aceptada", p_motivo: "Foto incorrecta",
    })
    expect(cliente.filtros).toContainEqual({ tabla: "verificaciones_reparacion", columna: "id", valor: "impugnacion-1" })
    expect(cliente.filtros).toContainEqual({ tabla: "profiles", columna: "id", valor: "autor-evidencia" })
    expect(mocks.avisoCancelacion).toHaveBeenCalledExactlyOnceWith({
      autorEmail: "vecino@example.invalid", autorUsername: "Vecino", reporteId: 9,
      reporteTitulo: "Bache en Av. Uruguay", motivo: "Foto incorrecta",
    })
    expect(cliente.insertar).not.toHaveBeenCalled()
    expect(mocks.avisoEstado).not.toHaveBeenCalled()
  })

  it("avisa sin motivo cuando la resolución no tiene uno", async () => {
    const cliente = clienteFalso()

    expect(await resolverImpugnacionReparacionWorkflow(cliente.supabase, "impugnacion-1", "admin-1", "aceptada", "  "))
      .toEqual(RESULTADO_IMPUGNACION)
    expect(cliente.rpc).toHaveBeenCalledWith("resolver_impugnacion_reparacion", expect.objectContaining({ p_motivo: null }))
    expect(mocks.avisoCancelacion).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      autorEmail: "vecino@example.invalid", motivo: null,
    }))
  })

  it.each(["respuesta", "excepción"] as const)("si falla el correo por %s, conserva el resultado durable", async (tipoFalla) => {
    const cliente = clienteFalso()
    if (tipoFalla === "respuesta") {
      mocks.avisoCancelacion.mockResolvedValue({ data: null, error: { message: "correo no disponible" } })
    } else {
      mocks.avisoCancelacion.mockRejectedValue(new Error("correo no disponible"))
    }

    expect(await resolverImpugnacionReparacionWorkflow(cliente.supabase, "impugnacion-1", "admin-1", "aceptada"))
      .toEqual(RESULTADO_IMPUGNACION)
    expect(mocks.avisoCancelacion).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      autorEmail: "vecino@example.invalid", motivo: null,
    }))
    expect(console.error).toHaveBeenCalled()
  })

  it("una resolución repetida no vuelve a consultar ni enviar el aviso", async () => {
    const cliente = clienteFalso({ repetida: true })

    expect(await resolverImpugnacionReparacionWorkflow(cliente.supabase, "impugnacion-1", "admin-1", "aceptada", "Otro motivo"))
      .toEqual({ ...RESULTADO_IMPUGNACION, data: { ...RESULTADO_IMPUGNACION.data, repetida: true } })
    expect(cliente.from).not.toHaveBeenCalled()
    expect(cliente.insertar).not.toHaveBeenCalled()
    expect(mocks.avisoCancelacion).not.toHaveBeenCalled()
  })

  it("si falla la RPC no intenta avisar ni escribe historial", async () => {
    const cliente = clienteFalso({ errorRpc: true })

    expect(await resolverImpugnacionReparacionWorkflow(cliente.supabase, "impugnacion-1", "admin-1", "aceptada"))
      .toEqual({ success: false, error: "No pudimos resolver la impugnación." })
    expect(cliente.from).not.toHaveBeenCalled()
    expect(cliente.insertar).not.toHaveBeenCalled()
    expect(mocks.avisoCancelacion).not.toHaveBeenCalled()
  })

  it("descartar sin cerrar conserva el comportamiento anterior y no avisa cancelación", async () => {
    const cliente = clienteFalso({ respuestaImpugnacion: { decision: "descartada", evidencia_estado: "en_verificacion" } })

    expect(await resolverImpugnacionReparacionWorkflow(cliente.supabase, "impugnacion-1", "admin-1", "descartada"))
      .toEqual({ ...RESULTADO_IMPUGNACION, data: { ...RESULTADO_IMPUGNACION.data, accion: "descartada", evidenciaEstado: "en_verificacion" } })
    expect(cliente.from).not.toHaveBeenCalled()
    expect(mocks.avisoCancelacion).not.toHaveBeenCalled()
    expect(mocks.avisoEstado).not.toHaveBeenCalled()
  })
})
