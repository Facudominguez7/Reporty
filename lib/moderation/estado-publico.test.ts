import { describe, expect, it, vi } from "vitest"
import { estadoFotografias, tieneRevisionRechazoPendiente } from "./estado-publico.server"

const { from, eq, enFiltro, select, maybeSingle } = vi.hoisted(() => ({
  from: vi.fn(), eq: vi.fn(), enFiltro: vi.fn(), select: vi.fn(), maybeSingle: vi.fn(),
}))
vi.mock("@/utils/supabase/admin", () => ({ createAdminClient: () => ({ from }) }))

describe("estado público de las fotografías", () => {
  /** Prepara la consulta única: select → eq(reporte_id) → in(decision) → filas. */
  function responder(respuesta: { data: unknown; error: unknown }) {
    from.mockReturnValue({ select }); select.mockReturnValue({ eq }); eq.mockReturnValue({ in: enFiltro })
    enFiltro.mockResolvedValue(respuesta)
  }

  it.each([
    [[{ decision: "REVIEW" }], { pendiente: true, aprobada: false }],
    [[{ decision: "APPROVED" }], { pendiente: false, aprobada: true }],
    [[{ decision: "REVIEW" }, { decision: "APPROVED" }], { pendiente: true, aprobada: true }],
    [[], { pendiente: false, aprobada: false }],
  ])("lee pendiente y aprobada en una sola consulta (%o)", async (filas, esperado) => {
    responder({ data: filas, error: null })
    expect(await estadoFotografias(42)).toEqual(esperado)
    expect(from).toHaveBeenCalledTimes(1)
    expect(from).toHaveBeenCalledWith("moderacion_imagenes")
    expect(select).toHaveBeenCalledWith("decision")
    expect(eq).toHaveBeenCalledWith("reporte_id", 42)
    expect(enFiltro).toHaveBeenCalledWith("decision", ["REVIEW", "APPROVED"])
    from.mockClear()
  })

  it("no afirma nada si la consulta falla", async () => {
    responder({ data: null, error: { message: "private detail" } })
    expect(await estadoFotografias(42)).toEqual({ pendiente: false, aprobada: false })
  })

  it("no afirma nada si la consulta lanza una excepción", async () => {
    from.mockImplementation(() => { throw new Error("red caída") })
    expect(await estadoFotografias(42)).toEqual({ pendiente: false, aprobada: false })
    from.mockReset()
  })
})

describe("public report rejection review status", () => {
  it.each([[{ estado: "pendiente" }, true], [{ estado: "descartada" }, false], [null, false]])(
    "exposes only whether review %o is pending", async (fila, esperado) => {
      from.mockReturnValue({ select }); select.mockReturnValue({ eq }); eq.mockReturnValue({ maybeSingle })
      maybeSingle.mockResolvedValue({ data: fila, error: null })
      expect(await tieneRevisionRechazoPendiente(42)).toBe(esperado)
      expect(from).toHaveBeenCalledWith("reportes_revision_rechazo")
      expect(select).toHaveBeenCalledWith("estado")
      expect(eq).toHaveBeenCalledWith("reporte_id", 42)
    })

  it("does not claim a pending review on query failure", async () => {
    from.mockReturnValue({ select }); select.mockReturnValue({ eq }); eq.mockReturnValue({ maybeSingle })
    maybeSingle.mockResolvedValue({ data: null, error: { message: "private detail" } })
    expect(await tieneRevisionRechazoPendiente(42)).toBe(false)
  })
})
