import { beforeEach, describe, expect, it, vi } from "vitest"

const effects = vi.hoisted(() => ({
  sumarPuntos: vi.fn(),
  actualizarPuntos: vi.fn(),
  updateReport: vi.fn(),
  notificar: vi.fn(),
  notificarRevisionAdmin: vi.fn(),
}))

vi.mock("server-only", () => ({}))
vi.mock("@/lib/notifications/report-notifications", () => ({ sendStatusNotificationEmail: effects.notificar, sendCommentNotificationEmail: vi.fn(), sendAdminReviewNotificationEmail: effects.notificarRevisionAdmin }))
vi.mock("@/database/queries/puntos", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/database/queries/puntos")>()),
  sumarPuntos: effects.sumarPuntos,
  actualizarPuntos: effects.actualizarPuntos,
}))

import { votarNoExisteWorkflow, votarReparadoWorkflow } from "@/lib/use-cases/reportes/detail-mutations"

function reportClient({ voteCount, ownerId = "report-owner", email = false, estado = 1 }: { voteCount: number; ownerId?: string; email?: boolean; estado?: number }) {
  const report = { id: 9, usuario_id: ownerId, titulo: "Bache", estado_id: estado, deleted_at: null, ownerProfile: email ? { email: "autor@example.invalid", username: "Autor" } : null }
  return {
    rpc: vi.fn(async (_nombre: string, args: { p_tipo: string }) => ({
      data: { primero: true, cambio: false, estado_cambiado: args.p_tipo === "reparado" && voteCount >= 5,
        votos_no_existe: args.p_tipo === "no_existe" ? voteCount : 0,
        votos_reparado: args.p_tipo === "reparado" ? voteCount : 0 }, error: null,
    })),
    from(table: string) {
      if (table === "reportes") {
        const query = {
          eq: () => query,
          is: () => query,
          neq: () => query,
          select: () => query,
          single: async () => ({ data: report, error: null }),
          maybeSingle: async () => ({ data: { id: 9 }, error: null }),
        }
        return {
          select: () => query,
          update: (...args: unknown[]) => { effects.updateReport(...args); return query },
        }
      }
      if (table === "votos_no_existe" || table === "votos_reparado") {
        return {
          insert: async () => ({ error: null }),
          select: () => ({ eq: async () => ({ count: voteCount, error: null }) }),
        }
      }
      if (table === "historial_estados") return { insert: async () => ({ error: null }) }
      throw new Error(`Unexpected table ${table}`)
    },
  } as never
}

beforeEach(() => {
  vi.clearAllMocks()
  effects.sumarPuntos.mockResolvedValue({ success: true, error: null })
  effects.actualizarPuntos.mockResolvedValue({ success: true, error: null })
})

describe("contrato de voto exclusivo", () => {
  it("explica el conflicto histórico sin pedir reintentar", async () => {
    const cliente = reportClient({ voteCount: 1 }) as any
    cliente.rpc = vi.fn().mockResolvedValue({ data: null, error: { code: "PVA01", message: "Votos históricos ambiguos" } })
    expect(await votarReparadoWorkflow(cliente, 9, "voter")).toEqual({ success: false, error: "Tus votos históricos son contradictorios y requieren revisión. No se modificaron." })
  })
  it("notifica solo si la RPC confirmó el cierre y no deshace el voto si falla el correo", async () => {
    effects.notificar.mockRejectedValueOnce(new Error("correo no disponible"))
    const resultado = await votarReparadoWorkflow(reportClient({ voteCount: 5, email: true }), 9, "voter")
    expect(resultado).toMatchObject({ success: true, data: { stateChangedTo: 2 } })
    expect(effects.notificar).toHaveBeenCalledOnce()
    effects.notificar.mockClear()
    await votarReparadoWorkflow(reportClient({ voteCount: 4, email: true }), 9, "voter")
    expect(effects.notificar).not.toHaveBeenCalled()
  })

  it("bloquea un reporte cerrado antes de invocar la RPC", async () => {
    const cliente = reportClient({ voteCount: 5, estado: 2 }) as any
    expect(await votarReparadoWorkflow(cliente, 9, "voter")).toMatchObject({ success: false })
    expect(cliente.rpc).not.toHaveBeenCalled()
  })

  it("informa un error de la RPC sin aplicar efectos posteriores", async () => {
    const cliente = reportClient({ voteCount: 1 }) as any
    cliente.rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "falló" } })
    expect(await votarReparadoWorkflow(cliente, 9, "voter")).toMatchObject({ success: false })
    expect(effects.sumarPuntos).not.toHaveBeenCalled()
    expect(effects.updateReport).not.toHaveBeenCalled()
  })

  it("usa la operación atómica y devuelve ambos contadores sin sumar puntos otra vez", async () => {
    const cliente = reportClient({ voteCount: 1 }) as any
    cliente.rpc = vi.fn().mockResolvedValue({ data: { primero: false, cambio: true, votos_no_existe: 0, votos_reparado: 1, estado_cambiado: false }, error: null })
    const resultado = await votarReparadoWorkflow(cliente, 9, "voter")
    expect(cliente.rpc).toHaveBeenCalledWith("registrar_voto_exclusivo", { p_reporte_id: 9, p_usuario_id: "voter", p_tipo: "reparado" })
    expect(resultado).toMatchObject({ success: true, data: { count: 1, votosNoExiste: 0, votosReparado: 1, primero: false, cambio: true } })
    expect(effects.sumarPuntos).not.toHaveBeenCalled()
  })
})

describe("community report status votes", () => {
  it("notifies admins when the fifth 'No existe' vote opens review without rejecting the report", async () => {
    const result = await votarNoExisteWorkflow(reportClient({ voteCount: 5 }), 9, "voter")

    expect(result).toMatchObject({ success: true, data: { count: 5, stateChangedTo: null, needsAdminReview: true } })
    expect(effects.notificarRevisionAdmin).toHaveBeenCalledOnce()
    expect(effects.notificarRevisionAdmin).toHaveBeenCalledWith(expect.objectContaining({ tipo: "reporte", reporteId: 9 }))
    expect(effects.updateReport).not.toHaveBeenCalled()
  })

  it("does not resend the report review alert on later votes", async () => {
    await votarNoExisteWorkflow(reportClient({ voteCount: 6 }), 9, "voter")

    expect(effects.notificarRevisionAdmin).not.toHaveBeenCalled()
  })

  it("does not send four 'No existe' votes to admin review", async () => {
    const result = await votarNoExisteWorkflow(reportClient({ voteCount: 4 }), 9, "voter")

    expect(result).toMatchObject({ success: true, data: { count: 4, stateChangedTo: null, needsAdminReview: false } })
    expect(effects.updateReport).not.toHaveBeenCalled()
  })

  it("does not change report state before five repaired votes", async () => {
    const result = await votarReparadoWorkflow(reportClient({ voteCount: 4 }), 9, "voter")

    expect(result).toMatchObject({ success: true, data: { count: 4, stateChangedTo: null } })
    expect(effects.updateReport).not.toHaveBeenCalled()
  })

  it("marks the report repaired at five community votes", async () => {
    const result = await votarReparadoWorkflow(reportClient({ voteCount: 5 }), 9, "voter")

    expect(result).toMatchObject({ success: true, data: { count: 5, stateChangedTo: 2 } })
    expect(effects.updateReport).not.toHaveBeenCalled()
  })

  it("allows the report author to vote repaired", async () => {
    const result = await votarReparadoWorkflow(reportClient({ voteCount: 1 }), 9, "report-owner")

    expect(result).toMatchObject({ success: true, data: { count: 1, stateChangedTo: null } })
    expect(effects.sumarPuntos).not.toHaveBeenCalled()
  })

  it("prevents the report author from voting 'No existe'", async () => {
    const result = await votarNoExisteWorkflow(reportClient({ voteCount: 0 }), 9, "report-owner")

    expect(result).toMatchObject({ success: false, error: "No podés votar 'No Existe' sobre tu propio reporte." })
    expect(effects.sumarPuntos).not.toHaveBeenCalled()
  })
})
