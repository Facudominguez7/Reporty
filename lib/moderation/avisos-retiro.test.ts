/** Outbox privado: proveedor simulado, sin red ni cambios en reporte/puntos. */
import { beforeEach, expect, it, vi } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
const dobles = vi.hoisted(() => ({ enviar: vi.fn() }))
vi.mock("@/lib/notifications/report-notifications", () => ({ sendReportWithdrawalEmail: dobles.enviar }))
import { enviarAvisoRetiro } from "./avisos-retiro.server"
let fila: Record<string, unknown>
let rpc: ReturnType<typeof vi.fn>
let servicio: SupabaseClient
let tablas: string[]
beforeEach(() => {
  vi.clearAllMocks()
  fila = { reporte_id: 7, destinatario: "autor@ejemplo.invalid", estado: "pendiente", token: null, primer_intento_at: null }
  tablas = []
  rpc = vi.fn(async (nombre: string, p: Record<string, unknown>) => {
    if (nombre === "reclamar_aviso_retiro") {
      if (fila.estado !== "pendiente" && !(fila.estado === "reclamado" && Date.parse(String(fila.reclamado_hasta)) < Date.now())) return { data: null, error: null }
      Object.assign(fila, { estado: "reclamado", token: "lease", primer_intento_at: fila.primer_intento_at ?? new Date().toISOString(), reclamado_hasta: new Date(Date.now() + 300000).toISOString() })
      return { data: "lease", error: null }
    }
    if (p.p_token !== fila.token) return { data: false, error: null }
    fila.estado = "enviado"
    return { data: true, error: null }
  })
  const consulta = { select: () => consulta, eq: () => consulta, single: async () => ({ data: fila, error: null }) }
  servicio = { rpc, from: (tabla: string) => { tablas.push(tabla); return consulta } } as unknown as SupabaseClient
  dobles.enviar.mockResolvedValue({ data: { id: "proveedor" }, error: null })
})
it("usa destinatario persistido y clave estable; confirmado no vuelve a enviar", async () => {
  expect(await enviarAvisoRetiro(servicio, 7)).toBe("enviado")
  expect(dobles.enviar).toHaveBeenCalledExactlyOnceWith({ destinatario: "autor@ejemplo.invalid", reporteId: 7 })
  expect(rpc).toHaveBeenCalledWith("confirmar_aviso_retiro", { p_reporte_id: 7, p_token: "lease" })
  expect(await enviarAvisoRetiro(servicio, 7)).toBe("pendiente")
  expect(dobles.enviar).toHaveBeenCalledTimes(1)
  expect(tablas.every((t) => t === "avisos_retiro_reporte")).toBe(true)
})
it.each(["devuelto", "excepcion", "sin_id"])("fallo %s no confirma ni restaura ni vuelve a acreditar", async (modo) => {
  if (modo === "excepcion") dobles.enviar.mockRejectedValue(new Error("datos sensibles"))
  else dobles.enviar.mockResolvedValue({ data: null, error: modo === "devuelto" ? { message: "datos sensibles" } : null })
  expect(await enviarAvisoRetiro(servicio, 7)).toBe("pendiente")
  expect(fila.estado).toBe("reclamado")
  expect(rpc.mock.calls.map(([n]) => n)).toEqual(["reclamar_aviso_retiro"])
  expect(tablas).toEqual(["avisos_retiro_reporte"])
})
it("aceptación incierta reintenta con igual identidad sin duplicar aceptación exitosa", async () => {
  vi.useFakeTimers()
  try {
    let aceptaciones = 0
    dobles.enviar.mockImplementationOnce(async () => { aceptaciones++; throw new Error("respuesta perdida") })
      .mockResolvedValue({ data: { id: "misma-aceptacion" }, error: null })
    expect(await enviarAvisoRetiro(servicio, 7)).toBe("pendiente")
    const inicio = fila.primer_intento_at
    await vi.advanceTimersByTimeAsync(300001)
    expect(await enviarAvisoRetiro(servicio, 7)).toBe("enviado")
    expect(fila.primer_intento_at).toBe(inicio)
    expect(dobles.enviar.mock.calls[0]).toEqual(dobles.enviar.mock.calls[1])
    expect(aceptaciones).toBe(1)
    await enviarAvisoRetiro(servicio, 7)
    expect(dobles.enviar).toHaveBeenCalledTimes(2)
    expect(fila.estado).toBe("enviado")
  } finally { vi.useRealTimers() }
})
it.each(["omitido", "reclamado", "enviado"])("%s sin lease no envía", async (estado) => {
  fila.estado = estado
  await enviarAvisoRetiro(servicio, 7)
  expect(dobles.enviar).not.toHaveBeenCalled()
})
it("aunque se demore el worker no envía fuera de la ventana conservadora", async () => {
  rpc.mockResolvedValue({ data: "lease", error: null })
  Object.assign(fila, { estado: "reclamado", token: "lease", primer_intento_at: new Date(Date.now() - (24 * 60 - 5) * 60000).toISOString(), reclamado_hasta: new Date(Date.now() + 300000).toISOString() })
  expect(await enviarAvisoRetiro(servicio, 7)).toBe("conciliacion")
  expect(dobles.enviar).not.toHaveBeenCalled()
  expect(rpc).toHaveBeenCalledTimes(1)
})
it("lease vencido después de reclamar no envía", async () => {
  rpc.mockResolvedValue({ data: "lease", error: null })
  Object.assign(fila, { estado: "reclamado", token: "lease", reclamado_hasta: new Date(Date.now() - 1).toISOString() })
  expect(await enviarAvisoRetiro(servicio, 7)).toBe("pendiente")
  expect(dobles.enviar).not.toHaveBeenCalled()
})
it("token perdido entre reclamo y lectura nunca envía", async () => {
  rpc.mockResolvedValue({ data: "anterior", error: null })
  fila.token = "otro"
  expect(await enviarAvisoRetiro(servicio, 7)).toBe("pendiente")
  expect(dobles.enviar).not.toHaveBeenCalled()
})
it("aceptación seguida de CAS perdido no afirma éxito", async () => {
  rpc.mockImplementation(async (nombre) => {
    if (nombre === "reclamar_aviso_retiro") {
      Object.assign(fila, { estado: "reclamado", token: "lease", primer_intento_at: new Date().toISOString(), reclamado_hasta: new Date(Date.now() + 300000).toISOString() })
      return { data: "lease", error: null }
    }
    return { data: false, error: null }
  })
  expect(await enviarAvisoRetiro(servicio, 7)).toBe("pendiente")
  expect(fila.estado).toBe("reclamado")
})
