import "server-only"

const API_MERCADO_PAGO = "https://api.mercadopago.com"

/** Marca que el servidor pone en la preferencia para reconocer pagos de donaciones. */
export const ORIGEN_DONACION = "reporty-donacion"

export type EstadoDonacion = "aprobada" | "pendiente" | "rechazada"

/** Pago tal como lo devuelve `GET /v1/payments/{id}`, solo con los campos que usamos. */
export type PagoMercadoPago = {
  id: number | string
  status: string
  transaction_amount: number
  currency_id: string
  external_reference: string | null
  date_approved: string | null
  metadata?: Record<string, unknown> | null
}

/** Datos del pago ya interpretados como donación de Reporty. */
export type PagoDonacion = {
  pagoId: string
  referencia: string
  monto: number
  moneda: string
  estado: EstadoDonacion
  estadoMp: string
  nombre: string | null
  mensaje: string | null
  usuarioId: string | null
  aprobadaAt: string | null
}

const PATRON_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Lee el access token de Mercado Pago. Lanza si falta, para no crear pagos sin configurar.
 */
function obtenerAccessToken(): string {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN?.trim()
  if (!token) throw new Error("MERCADOPAGO_ACCESS_TOKEN no está configurado")
  return token
}

/**
 * Traduce el estado de Mercado Pago a los tres estados del panel. Los reembolsos y
 * contracargos cuentan como rechazados: esa plata no quedó en la cuenta.
 */
export function traducirEstado(estadoMp: string): EstadoDonacion {
  if (estadoMp === "approved") return "aprobada"
  if (estadoMp === "pending" || estadoMp === "in_process" || estadoMp === "authorized") return "pendiente"
  return "rechazada"
}

/**
 * Devuelve el texto de un campo de metadata, o `null` si no es un texto con contenido.
 */
function textoDeMetadata(metadata: Record<string, unknown>, clave: string, maximo: number): string | null {
  const valor = metadata[clave]
  if (typeof valor !== "string") return null
  const limpio = valor.trim().slice(0, maximo)
  return limpio.length ? limpio : null
}

/**
 * Interpreta un pago de Mercado Pago como donación. Devuelve `null` si el pago no salió
 * de una preferencia de donaciones de Reporty (otra venta de la misma cuenta, por ejemplo).
 */
export function interpretarPago(pago: PagoMercadoPago): PagoDonacion | null {
  const metadata = pago.metadata ?? {}
  if (metadata.origen !== ORIGEN_DONACION) return null
  if (!pago.external_reference || !PATRON_UUID.test(pago.external_reference)) return null
  if (!Number.isFinite(pago.transaction_amount) || pago.transaction_amount <= 0) return null

  const usuarioId = textoDeMetadata(metadata, "usuario_id", 36)

  return {
    pagoId: String(pago.id),
    referencia: pago.external_reference,
    monto: pago.transaction_amount,
    moneda: pago.currency_id || "ARS",
    estado: traducirEstado(pago.status),
    estadoMp: pago.status,
    nombre: textoDeMetadata(metadata, "nombre", 80),
    mensaje: textoDeMetadata(metadata, "mensaje", 280),
    usuarioId: usuarioId && PATRON_UUID.test(usuarioId) ? usuarioId : null,
    aprobadaAt: pago.status === "approved" ? pago.date_approved : null,
  }
}

type ParametrosPreferencia = {
  monto: number
  nombre: string | null
  mensaje: string | null
  usuarioId: string | null
  /** Origen público del sitio, por ejemplo `https://reporty.com.ar`. */
  origen: string
  fetcher?: typeof fetch
}

/**
 * Crea una preferencia de Checkout Pro para una donación y devuelve la URL de pago.
 * Nombre, mensaje y usuario viajan en `metadata` y vuelven en el pago, así la fila se
 * crea recién cuando existe un pago real.
 */
export async function crearPreferenciaDonacion({ monto, nombre, mensaje, usuarioId, origen, fetcher = fetch }: ParametrosPreferencia) {
  const referencia = crypto.randomUUID()
  const vuelta = `${origen}/donar/gracias`
  const esSeguro = origen.startsWith("https://")

  const respuesta = await fetcher(`${API_MERCADO_PAGO}/checkout/preferences`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${obtenerAccessToken()}`,
      "Content-Type": "application/json",
      "X-Idempotency-Key": referencia,
    },
    body: JSON.stringify({
      items: [{ id: "donacion", title: "Donación a Reporty", quantity: 1, unit_price: monto, currency_id: "ARS" }],
      external_reference: referencia,
      metadata: { origen: ORIGEN_DONACION, nombre, mensaje, usuario_id: usuarioId },
      back_urls: { success: vuelta, pending: vuelta, failure: vuelta },
      // Mercado Pago solo vuelve automáticamente a una URL https.
      ...(esSeguro ? { auto_return: "approved" } : {}),
      statement_descriptor: "REPORTY",
    }),
  })

  if (!respuesta.ok) {
    throw new Error(`Mercado Pago rechazó la preferencia (${respuesta.status})`)
  }

  const preferencia = (await respuesta.json()) as { id?: string; init_point?: string }
  if (!preferencia.init_point) throw new Error("Mercado Pago no devolvió la URL de pago")

  return { referencia, urlPago: preferencia.init_point }
}

/**
 * Consulta un pago en Mercado Pago. Devuelve `null` si no existe; lanza ante otros errores
 * para que el webhook responda con error y Mercado Pago reintente.
 */
export async function obtenerPago(pagoId: string, fetcher: typeof fetch = fetch): Promise<PagoMercadoPago | null> {
  if (!/^\d{1,20}$/.test(pagoId)) return null

  const respuesta = await fetcher(`${API_MERCADO_PAGO}/v1/payments/${pagoId}`, {
    headers: { Authorization: `Bearer ${obtenerAccessToken()}` },
    cache: "no-store",
  })

  if (respuesta.status === 404) return null
  if (!respuesta.ok) throw new Error(`No se pudo consultar el pago ${pagoId} (${respuesta.status})`)

  return (await respuesta.json()) as PagoMercadoPago
}

/**
 * Pasa bytes a hexadecimal en minúsculas.
 */
function aHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("")
}

/**
 * Compara dos textos sin cortar en la primera diferencia, para no filtrar la firma por tiempos.
 */
function igualesEnTiempoConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diferencia = 0
  for (let indice = 0; indice < a.length; indice++) diferencia |= a.charCodeAt(indice) ^ b.charCodeAt(indice)
  return diferencia === 0
}

type ParametrosFirma = {
  firma: string | null
  requestId: string | null
  dataId: string | null
  secreto: string
}

/**
 * Verifica el encabezado `x-signature` de un webhook de Mercado Pago: HMAC-SHA256 en hex
 * del manifiesto `id:{data.id};request-id:{x-request-id};ts:{ts};` con la clave secreta.
 * Los valores ausentes se quitan del manifiesto, como indica la documentación.
 */
export async function verificarFirmaWebhook({ firma, requestId, dataId, secreto }: ParametrosFirma): Promise<boolean> {
  if (!firma || !secreto) return false

  let ts: string | undefined
  let hash: string | undefined
  for (const parte of firma.split(",")) {
    const separador = parte.indexOf("=")
    if (separador === -1) continue
    const clave = parte.slice(0, separador).trim()
    const valor = parte.slice(separador + 1).trim()
    if (clave === "ts") ts = valor
    if (clave === "v1") hash = valor
  }
  if (!ts || !hash) return false

  const partes: string[] = []
  if (dataId) partes.push(`id:${dataId.toLowerCase()}`)
  if (requestId) partes.push(`request-id:${requestId}`)
  partes.push(`ts:${ts}`)
  const manifiesto = `${partes.join(";")};`

  const clave = await crypto.subtle.importKey("raw", new TextEncoder().encode(secreto), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  const calculada = aHex(await crypto.subtle.sign("HMAC", clave, new TextEncoder().encode(manifiesto)))

  return igualesEnTiempoConstante(calculada, hash.toLowerCase())
}
