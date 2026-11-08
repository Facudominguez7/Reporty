import { beforeEach, describe, expect, it, vi } from "vitest"
const { send } = vi.hoisted(() => ({ send: vi.fn() }))
vi.mock("server-only", () => ({}))
vi.mock("@/lib/notifications/mascota-notifications", () => ({ enviarAvisoEstadoMascota: send }))
import { enviarAvisoMascotaPendiente, procesarAvisosMascota } from "./avisos-mascotas.server"

function servicio({ claim = "token-1", row = { id: 7, mascota_id: 12, destinatario: "a@example.test", evento: "encontrada", token: "token-1", primer_intento_at: new Date().toISOString(), reclamado_hasta: new Date(Date.now() + 60_000).toISOString() }, confirm = true }: { claim?: string | null; row?: { id: number; mascota_id?: number; destinatario?: string; evento?: string; token?: string; estado?: string; primer_intento_at?: string; reclamado_hasta?: string }; confirm?: boolean } = {}) {
  const rpc = vi.fn(async (name: string) => name === "reclamar_aviso_estado_mascota"
    ? { data: claim, error: null } : { data: confirm, error: null })
  const query: Record<string, any> = {}
  for (const method of ["select", "eq", "neq", "order"]) query[method] = vi.fn(() => query)
  query.single = vi.fn(async () => ({ data: row, error: null }))
  query.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [{ id: 7, estado: "pendiente" }], error: null }).then(resolve)
  const db = { rpc, from: vi.fn(() => query) }
  return { db, rpc, query }
}

beforeEach(() => { vi.resetAllMocks(); send.mockResolvedValue({ data: { id: "resend-1" }, error: null }) })
describe("outbox de avisos de mascotas", () => {
  it("no afirma envío cuando el proveedor pudo aceptar el correo", async () => {
    send.mockRejectedValueOnce(new Error("response lost after acceptance"))
    const { db } = servicio()
    await expect(enviarAvisoMascotaPendiente(db as never, 7)).resolves.toBe("pendiente")
  })
  it("confirma solo con el token del lease", async () => {
    const { db, rpc } = servicio({ confirm: false })
    await expect(enviarAvisoMascotaPendiente(db as never, 7)).resolves.toBe("pendiente")
    expect(rpc).toHaveBeenLastCalledWith("confirmar_aviso_estado_mascota", { p_id: 7, p_token: "token-1" })
  })
  it("confirma entrega aceptada únicamente después de confirmar el lease", async () => {
    const { db, rpc } = servicio()
    await expect(enviarAvisoMascotaPendiente(db as never, 7)).resolves.toBe("enviado")
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ eventoId: "7" }))
    expect(rpc).toHaveBeenLastCalledWith("confirmar_aviso_estado_mascota", { p_id: 7, p_token: "token-1" })
  })
  it("deja una reclamación activa pendiente sin reenviar", async () => {
    const { db, query } = servicio({ claim: null, row: { id: 7, estado: "reclamado" } })
    query.single.mockResolvedValue({ data: { id: 7, estado: "reclamado" }, error: null })
    await expect(enviarAvisoMascotaPendiente(db as never, 7)).resolves.toBe("pendiente")
    expect(send).not.toHaveBeenCalled()
  })
  it("no envía si la fila no corresponde al token reclamado", async () => {
    const { db } = servicio({ row: { id: 7, mascota_id: 12, destinatario: "a@example.test", evento: "encontrada", token: "stale", primer_intento_at: new Date().toISOString(), reclamado_hasta: new Date(Date.now() + 60_000).toISOString() } })
    await expect(enviarAvisoMascotaPendiente(db as never, 7)).resolves.toBe("pendiente")
    expect(send).not.toHaveBeenCalled()
  })
  it("informa conciliación sin volver a contactar al proveedor", async () => {
    const { db, query } = servicio({ claim: null, row: { id: 7, estado: "conciliacion" } })
    query.single.mockResolvedValue({ data: { id: 7, estado: "conciliacion" }, error: null })
    await expect(enviarAvisoMascotaPendiente(db as never, 7)).resolves.toBe("conciliacion")
    expect(send).not.toHaveBeenCalled()
  })
  it("conserva el estado pendiente ante error al enumerar el outbox", async () => {
    const query = { select() { return this }, eq() { return this }, neq() { return this }, order: async () => ({ data: null, error: new Error("db down") }) }
    const db = { from: () => query }
    await expect(procesarAvisosMascota(db as never, 12)).resolves.toBe("pendiente")
  })
})
