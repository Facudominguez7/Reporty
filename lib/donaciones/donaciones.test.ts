import { createHmac } from "node:crypto"
import { afterEach, describe, expect, it, vi } from "vitest"

import { esquemaDonacion, formatearMonto, MONTOS_DONACION } from "@/lib/donaciones/montos"
import {
  crearPreferenciaDonacion,
  interpretarPago,
  obtenerPago,
  ORIGEN_DONACION,
  traducirEstado,
  verificarFirmaWebhook,
  type PagoMercadoPago,
} from "@/lib/donaciones/mercado-pago.server"

const REFERENCIA = "3f1c8a52-7d4e-4b8a-9c11-2b6f0e9d4a10"
const USUARIO = "9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d"

/** Arma un pago de prueba de Mercado Pago con valores por defecto de una donación aprobada. */
function pago(cambios: Partial<PagoMercadoPago> = {}): PagoMercadoPago {
  return {
    id: 123456789,
    status: "approved",
    transaction_amount: 5000,
    currency_id: "ARS",
    external_reference: REFERENCIA,
    date_approved: "2026-11-10T15:00:00.000-03:00",
    metadata: { origen: ORIGEN_DONACION, nombre: "Ana", mensaje: "¡Gracias!", usuario_id: USUARIO },
    ...cambios,
  }
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("montos de donación", () => {
  it("ofrece los montos sugeridos de $1.000 a $20.000", () => {
    expect(MONTOS_DONACION.map(formatearMonto)).toEqual(["$1.000", "$2.000", "$5.000", "$10.000", "$20.000"])
  })

  it("acepta «Otro» desde $500 y convierte textos vacíos en null", () => {
    expect(esquemaDonacion.parse({ monto: "500", nombre: "  ", mensaje: "" })).toEqual({ monto: 500, nombre: null, mensaje: null })
  })

  it("rechaza montos debajo del mínimo con el mensaje para el donante", () => {
    const resultado = esquemaDonacion.safeParse({ monto: 499 })
    expect(resultado.success).toBe(false)
    expect(resultado.error?.issues[0]?.message).toBe("El monto mínimo es $500.")
  })

  it("rechaza montos con centavos y nombres demasiado largos", () => {
    expect(esquemaDonacion.safeParse({ monto: 1500.5 }).success).toBe(false)
    expect(esquemaDonacion.safeParse({ monto: 1000, nombre: "a".repeat(81) }).success).toBe(false)
  })
})

describe("estado de la donación", () => {
  it("agrupa los estados de Mercado Pago en aprobada, pendiente y rechazada", () => {
    expect(traducirEstado("approved")).toBe("aprobada")
    expect(["pending", "in_process", "authorized"].map(traducirEstado)).toEqual(["pendiente", "pendiente", "pendiente"])
    expect(["rejected", "cancelled", "refunded", "charged_back"].map(traducirEstado)).toEqual(["rechazada", "rechazada", "rechazada", "rechazada"])
  })
})

describe("interpretarPago", () => {
  it("toma monto, estado, nombre, mensaje y usuario del pago", () => {
    expect(interpretarPago(pago())).toEqual({
      pagoId: "123456789",
      referencia: REFERENCIA,
      monto: 5000,
      moneda: "ARS",
      estado: "aprobada",
      estadoMp: "approved",
      nombre: "Ana",
      mensaje: "¡Gracias!",
      usuarioId: USUARIO,
      aprobadaAt: "2026-11-10T15:00:00.000-03:00",
    })
  })

  it("ignora pagos que no salieron de una donación de Reporty", () => {
    expect(interpretarPago(pago({ metadata: {} }))).toBeNull()
    expect(interpretarPago(pago({ external_reference: "venta-42" }))).toBeNull()
  })

  it("descarta un usuario que no es un id válido y no marca fecha si no está aprobada", () => {
    const resultado = interpretarPago(pago({ status: "pending", metadata: { origen: ORIGEN_DONACION, usuario_id: "x" } }))
    expect(resultado).toMatchObject({ estado: "pendiente", usuarioId: null, nombre: null, aprobadaAt: null })
  })
})

describe("verificarFirmaWebhook", () => {
  const secreto = "secreto-de-prueba"

  /** Firma un manifiesto como lo hace Mercado Pago. */
  function firmar(manifiesto: string) {
    return createHmac("sha256", secreto).update(manifiesto).digest("hex")
  }

  it("acepta la firma calculada con id, request-id y ts", async () => {
    const v1 = firmar("id:123456789;request-id:abc-1;ts:1742505638683;")
    await expect(verificarFirmaWebhook({ firma: `ts=1742505638683,v1=${v1}`, requestId: "abc-1", dataId: "123456789", secreto })).resolves.toBe(true)
  })

  it("pasa el id a minúsculas y lo saca del manifiesto si falta", async () => {
    const conId = firmar("id:ord01;request-id:abc-1;ts:1;")
    const sinId = firmar("request-id:abc-1;ts:1;")
    await expect(verificarFirmaWebhook({ firma: `ts=1,v1=${conId}`, requestId: "abc-1", dataId: "ORD01", secreto })).resolves.toBe(true)
    await expect(verificarFirmaWebhook({ firma: `ts=1,v1=${sinId}`, requestId: "abc-1", dataId: null, secreto })).resolves.toBe(true)
  })

  it("rechaza firmas alteradas, incompletas o sin secreto", async () => {
    const v1 = firmar("id:1;request-id:abc-1;ts:1;")
    await expect(verificarFirmaWebhook({ firma: `ts=1,v1=${v1}`, requestId: "abc-1", dataId: "2", secreto })).resolves.toBe(false)
    await expect(verificarFirmaWebhook({ firma: "ts=1", requestId: "abc-1", dataId: "1", secreto })).resolves.toBe(false)
    await expect(verificarFirmaWebhook({ firma: null, requestId: "abc-1", dataId: "1", secreto })).resolves.toBe(false)
    await expect(verificarFirmaWebhook({ firma: `ts=1,v1=${v1}`, requestId: "abc-1", dataId: "1", secreto: "" })).resolves.toBe(false)
  })
})

describe("API de Mercado Pago", () => {
  it("crea la preferencia con metadata, referencia y vuelta a /donar/gracias", async () => {
    vi.stubEnv("MERCADOPAGO_ACCESS_TOKEN", "TEST-token")
    const fetcher = vi.fn(async () => Response.json({ id: "pref-1", init_point: "https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=pref-1" }))

    const resultado = await crearPreferenciaDonacion({ monto: 2000, nombre: "Ana", mensaje: null, usuarioId: null, origen: "https://reporty.com.ar", fetcher })

    expect(resultado.urlPago).toContain("pref_id=pref-1")
    const [url, opciones] = fetcher.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe("https://api.mercadopago.com/checkout/preferences")
    expect((opciones.headers as Record<string, string>).Authorization).toBe("Bearer TEST-token")
    const cuerpo = JSON.parse(String(opciones.body))
    expect(cuerpo).toMatchObject({
      items: [{ title: "Donación a Reporty", quantity: 1, unit_price: 2000, currency_id: "ARS" }],
      external_reference: resultado.referencia,
      metadata: { origen: ORIGEN_DONACION, nombre: "Ana", mensaje: null, usuario_id: null },
      back_urls: { success: "https://reporty.com.ar/donar/gracias" },
      auto_return: "approved",
    })
  })

  it("no pide volver automáticamente cuando el sitio no es https", async () => {
    vi.stubEnv("MERCADOPAGO_ACCESS_TOKEN", "TEST-token")
    const fetcher = vi.fn(async () => Response.json({ init_point: "https://mp/pago" }))
    await crearPreferenciaDonacion({ monto: 1000, nombre: null, mensaje: null, usuarioId: null, origen: "http://localhost:3000", fetcher })
    const cuerpo = JSON.parse(String((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body))
    expect(cuerpo.auto_return).toBeUndefined()
  })

  it("falla si falta el access token", async () => {
    vi.stubEnv("MERCADOPAGO_ACCESS_TOKEN", "")
    await expect(crearPreferenciaDonacion({ monto: 1000, nombre: null, mensaje: null, usuarioId: null, origen: "https://reporty.com.ar", fetcher: vi.fn() })).rejects.toThrow("MERCADOPAGO_ACCESS_TOKEN")
  })

  it("consulta el pago y devuelve null si no existe o el id no es numérico", async () => {
    vi.stubEnv("MERCADOPAGO_ACCESS_TOKEN", "TEST-token")
    const fetcher = vi.fn(async () => new Response(null, { status: 404 }))
    await expect(obtenerPago("123", fetcher)).resolves.toBeNull()
    await expect(obtenerPago("../users/me", fetcher)).resolves.toBeNull()
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it("lanza ante errores del servidor para que Mercado Pago reintente", async () => {
    vi.stubEnv("MERCADOPAGO_ACCESS_TOKEN", "TEST-token")
    await expect(obtenerPago("123", vi.fn(async () => new Response(null, { status: 500 })))).rejects.toThrow("500")
  })
})
