import { createHmac } from "node:crypto"
import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { registrarDonacion } = vi.hoisted(() => ({ registrarDonacion: vi.fn() }))
vi.mock("@/lib/donaciones/registro.server", () => ({ registrarDonacion }))
vi.mock("@/utils/supabase/admin", () => ({ createAdminClient: () => ({ cliente: "admin" }) }))

import { POST } from "./route"

const SECRETO = "secreto-webhook"

/** Arma un aviso de Mercado Pago firmado (o con la firma que se pase). */
function aviso({ id = "123", tipo = "payment", firma, cuerpo }: { id?: string; tipo?: string; firma?: string; cuerpo?: unknown } = {}) {
  const ts = "1742505638683"
  const v1 = createHmac("sha256", SECRETO).update(`id:${id};request-id:req-1;ts:${ts};`).digest("hex")
  return new NextRequest(`https://reporty.com.ar/api/donaciones/webhook?data.id=${id}&type=${tipo}`, {
    method: "POST",
    headers: { "x-signature": firma ?? `ts=${ts},v1=${v1}`, "x-request-id": "req-1", "content-type": "application/json" },
    body: JSON.stringify(cuerpo ?? { type: tipo, action: "payment.updated", data: { id } }),
  })
}

beforeEach(() => {
  vi.stubEnv("MERCADOPAGO_WEBHOOK_SECRET", SECRETO)
  registrarDonacion.mockReset().mockResolvedValue({ tipo: "ignorada" })
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("POST /api/donaciones/webhook", () => {
  it("registra el pago avisado cuando la firma es válida", async () => {
    const respuesta = await POST(aviso())
    expect(respuesta.status).toBe(200)
    expect(registrarDonacion).toHaveBeenCalledWith({ cliente: "admin" }, "123")
  })

  it("rechaza avisos con firma inválida sin consultar el pago", async () => {
    const respuesta = await POST(aviso({ firma: "ts=1,v1=00" }))
    expect(respuesta.status).toBe(401)
    expect(registrarDonacion).not.toHaveBeenCalled()
  })

  it("responde 503 si falta el secreto, para que Mercado Pago reintente", async () => {
    vi.stubEnv("MERCADOPAGO_WEBHOOK_SECRET", "")
    expect((await POST(aviso())).status).toBe(503)
    expect(registrarDonacion).not.toHaveBeenCalled()
  })

  it("acepta y descarta avisos que no son de pagos", async () => {
    const respuesta = await POST(aviso({ tipo: "merchant_order" }))
    expect(respuesta.status).toBe(200)
    expect(registrarDonacion).not.toHaveBeenCalled()
  })

  it("rechaza un cuerpo con otro id que el firmado en la URL", async () => {
    const respuesta = await POST(aviso({ cuerpo: { type: "payment", data: { id: "999" } } }))
    expect(respuesta.status).toBe(400)
    expect(registrarDonacion).not.toHaveBeenCalled()
  })

  it("responde 500 si la donación se guardó pero faltan los emails, para que Mercado Pago reintente", async () => {
    registrarDonacion.mockResolvedValue({ tipo: "registrada", donacion: { pagoId: "123" }, avisoPendiente: true })
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    expect((await POST(aviso())).status).toBe(500)
  })

  it("responde 500 si no se pudo registrar, para que Mercado Pago reintente", async () => {
    registrarDonacion.mockRejectedValue(new Error("Supabase caído"))
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    expect((await POST(aviso())).status).toBe(500)
  })
})
