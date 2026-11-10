import { NextRequest, NextResponse } from "next/server"

import { verificarFirmaWebhook } from "@/lib/donaciones/mercado-pago.server"
import { registrarDonacion } from "@/lib/donaciones/registro.server"
import { createAdminClient } from "@/utils/supabase/admin"

/**
 * Recibe los avisos de pagos de Mercado Pago. Verifica la firma `x-signature` y vuelve a
 * consultar el pago en la API antes de guardar nada: el cuerpo del aviso solo aporta el id.
 * Responde 200 a los avisos que no son de pagos para que Mercado Pago no los reintente.
 */
export async function POST(request: NextRequest) {
  const secreto = process.env.MERCADOPAGO_WEBHOOK_SECRET?.trim()
  if (!secreto) {
    console.error("Webhook de donaciones sin MERCADOPAGO_WEBHOOK_SECRET configurado")
    return NextResponse.json({ error: "Webhook sin configurar" }, { status: 503 })
  }

  const parametros = request.nextUrl.searchParams
  const dataId = parametros.get("data.id")
  const valida = await verificarFirmaWebhook({
    firma: request.headers.get("x-signature"),
    requestId: request.headers.get("x-request-id"),
    dataId,
    secreto,
  })
  if (!valida) return NextResponse.json({ error: "Firma inválida" }, { status: 401 })

  const cuerpo = (await request.json().catch(() => null)) as { type?: string; data?: { id?: string | number } } | null
  const tipo = parametros.get("type") ?? cuerpo?.type
  // El id firmado es el de la URL; el del cuerpo solo se usa si coincide.
  if (tipo !== "payment" || !dataId) return NextResponse.json({ ok: true })
  if (cuerpo?.data?.id !== undefined && String(cuerpo.data.id) !== dataId) {
    return NextResponse.json({ error: "Aviso inconsistente" }, { status: 400 })
  }

  try {
    await registrarDonacion(createAdminClient(), dataId)
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("Error al registrar la donación", dataId, error)
    return NextResponse.json({ error: "No se pudo registrar la donación" }, { status: 500 })
  }
}
