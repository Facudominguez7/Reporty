import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { claveIdempotencia, enviarRecordatoriosPendientes, type RecordatorioPendiente } from "./recordatorios.server"

const AHORA = new Date("2026-11-13T13:00:00.000Z")

const reporte: RecordatorioPendiente = {
  tipo: "reporte", entidad_id: 482, titulo: "Bache", estado: "Pendiente",
  email: "rosa@example.com", username: "rosa", publicada_at: "2026-10-29T10:00:00.000Z",
}
const mascota: RecordatorioPendiente = {
  tipo: "mascota", entidad_id: 37, titulo: "gato", estado: "perdida",
  email: "juan@example.com", username: null, publicada_at: "2026-10-01T10:00:00.000Z",
}

/** Cliente Supabase falso: la RPC devuelve las filas dadas y el upsert se registra. */
function supabaseFalso(filas: RecordatorioPendiente[], opciones: { errorRpc?: string; errorUpsert?: string } = {}) {
  const upsert = vi.fn(async () => ({ error: opciones.errorUpsert ? { message: opciones.errorUpsert } : null }))
  const rpc = vi.fn(async () => (opciones.errorRpc ? { data: null, error: { message: opciones.errorRpc } } : { data: filas, error: null }))
  const from = vi.fn(() => ({ upsert }))
  return { cliente: { rpc, from } as never, rpc, from, upsert }
}

describe("enviarRecordatoriosPendientes", () => {
  it("envía cada recordatorio con su plantilla y registra la fecha después del envío", async () => {
    const db = supabaseFalso([reporte, mascota])
    const enviar = vi.fn(async () => ({ error: null }))

    const resumen = await enviarRecordatoriosPendientes({ supabase: db.cliente, enviar, urlApp: "https://reporty.com.ar", ahora: AHORA, limite: 50 })

    expect(resumen).toEqual({ candidatos: 2, enviados: 2, fallidos: 0 })
    expect(db.rpc).toHaveBeenCalledWith("recordatorios_pendientes", { p_limite: 50 })
    const [mensajeReporte, opcionesReporte] = enviar.mock.calls[0] as unknown as [Record<string, unknown>, { idempotencyKey: string }]
    expect(mensajeReporte).toMatchObject({ to: ["rosa@example.com"], subject: '¿Cómo sigue tu reporte "Bache"?' })
    expect(String(mensajeReporte.html)).toContain("hace 2 semanas")
    expect(opcionesReporte.idempotencyKey).toBe(claveIdempotencia(reporte, AHORA))
    expect((enviar.mock.calls[1] as unknown as [Record<string, unknown>])[0]).toMatchObject({ subject: "¿Hay novedades de tu gato?" })
    expect(db.from).toHaveBeenCalledWith("recordatorios_publicacion")
    expect(db.upsert).toHaveBeenCalledWith({ tipo: "reporte", entidad_id: 482, ultimo_envio_at: AHORA.toISOString() })
    expect(db.upsert).toHaveBeenCalledWith({ tipo: "mascota", entidad_id: 37, ultimo_envio_at: AHORA.toISOString() })
  })

  it("no registra un envío rechazado y sigue con los demás", async () => {
    const db = supabaseFalso([reporte, mascota])
    const enviar = vi.fn()
      .mockResolvedValueOnce({ error: { message: "rate limit" } })
      .mockResolvedValueOnce({ error: null })
    vi.spyOn(console, "error").mockImplementation(() => {})

    const resumen = await enviarRecordatoriosPendientes({ supabase: db.cliente, enviar, urlApp: "https://reporty.com.ar", ahora: AHORA })

    expect(resumen).toEqual({ candidatos: 2, enviados: 1, fallidos: 1 })
    expect(db.upsert).toHaveBeenCalledTimes(1)
    expect(db.upsert).toHaveBeenCalledWith(expect.objectContaining({ tipo: "mascota", entidad_id: 37 }))
  })

  it("nunca escribe el correo del destinatario en los logs", async () => {
    const db = supabaseFalso([reporte])
    const errores = vi.spyOn(console, "error").mockImplementation(() => {})

    await enviarRecordatoriosPendientes({ supabase: db.cliente, enviar: vi.fn(async () => { throw new Error("caída") }), urlApp: "https://reporty.com.ar", ahora: AHORA })

    expect(JSON.stringify(errores.mock.calls)).not.toContain("rosa@example.com")
  })

  it("falla la corrida si no puede leer los pendientes, sin enviar nada", async () => {
    const db = supabaseFalso([], { errorRpc: "boom" })
    const enviar = vi.fn()

    await expect(enviarRecordatoriosPendientes({ supabase: db.cliente, enviar, urlApp: "https://reporty.com.ar", ahora: AHORA })).rejects.toThrow("boom")
    expect(enviar).not.toHaveBeenCalled()
  })
})

describe("claveIdempotencia", () => {
  it("es estable dentro del período de 14 días y cambia en el siguiente", () => {
    const otroDiaMismoPeriodo = new Date(AHORA.getTime() + 60_000)
    const siguientePeriodo = new Date(AHORA.getTime() + 14 * 86_400_000)
    expect(claveIdempotencia(reporte, otroDiaMismoPeriodo)).toBe(claveIdempotencia(reporte, AHORA))
    expect(claveIdempotencia(reporte, siguientePeriodo)).not.toBe(claveIdempotencia(reporte, AHORA))
    expect(claveIdempotencia(reporte, AHORA)).toMatch(/^recordatorio\/reporte\/482\/\d+$/)
  })
})
