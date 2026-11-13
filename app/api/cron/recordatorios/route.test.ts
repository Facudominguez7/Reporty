import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const enviarRecordatoriosPendientes = vi.hoisted(() => vi.fn())
vi.mock("@/lib/notifications/recordatorios.server", () => ({ enviarRecordatoriosPendientes }))
vi.mock("@/utils/supabase/admin", () => ({ createAdminClient: () => ({ admin: true }) }))

import { POST } from "./route"
import { SECRETO_CRON_FALSO } from "@/lib/auditoria-archivo/__pruebas__/credenciales-falsas"

/** Pedido del cron con el Bearer dado. */
function pedido(token?: string) {
  return new Request("https://reporty.com.ar/api/cron/recordatorios", {
    method: "POST",
    headers: token ? { authorization: `Bearer ${token}` } : {},
  })
}

beforeEach(() => {
  enviarRecordatoriosPendientes.mockReset()
  enviarRecordatoriosPendientes.mockResolvedValue({ candidatos: 3, enviados: 2, fallidos: 1 })
  vi.stubEnv("AUDIT_ARCHIVE_CRON_SECRET", SECRETO_CRON_FALSO)
  vi.stubEnv("RESEND_API_KEY", "re_prueba")
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("POST /api/cron/recordatorios", () => {
  it("con el secreto correcto corre los recordatorios y devuelve solo conteos", async () => {
    const respuesta = await POST(pedido(SECRETO_CRON_FALSO))

    expect(respuesta.status).toBe(200)
    expect(respuesta.headers.get("cache-control")).toBe("no-store")
    expect(await respuesta.json()).toEqual({ ok: true, candidatos: 3, enviados: 2, fallidos: 1 })
    expect(enviarRecordatoriosPendientes).toHaveBeenCalledWith(
      expect.objectContaining({ supabase: { admin: true }, limite: 100, urlApp: expect.stringMatching(/^https:\/\//) }),
    )
  })

  it("rechaza sin Bearer o con un secreto distinto, sin enviar nada", async () => {
    expect((await POST(pedido())).status).toBe(401)
    expect((await POST(pedido("x".repeat(SECRETO_CRON_FALSO.length)))).status).toBe(401)
    expect(enviarRecordatoriosPendientes).not.toHaveBeenCalled()
  })

  it("responde 503 sin secreto configurado", async () => {
    vi.stubEnv("AUDIT_ARCHIVE_CRON_SECRET", "")
    expect((await POST(pedido(SECRETO_CRON_FALSO))).status).toBe(503)
    expect(enviarRecordatoriosPendientes).not.toHaveBeenCalled()
  })

  it("responde 503 sin RESEND_API_KEY", async () => {
    vi.stubEnv("RESEND_API_KEY", "")
    expect((await POST(pedido(SECRETO_CRON_FALSO))).status).toBe(503)
    expect(enviarRecordatoriosPendientes).not.toHaveBeenCalled()
  })

  it("responde 500 cuando la corrida falla", async () => {
    enviarRecordatoriosPendientes.mockRejectedValue(new Error("boom"))
    vi.spyOn(console, "error").mockImplementation(() => {})
    const respuesta = await POST(pedido(SECRETO_CRON_FALSO))
    expect(respuesta.status).toBe(500)
    expect(await respuesta.json()).toEqual({ error: "La corrida de recordatorios no pudo ejecutarse." })
  })
})
