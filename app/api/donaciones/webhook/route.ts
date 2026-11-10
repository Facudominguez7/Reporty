import { NextRequest, NextResponse } from "next/server"

import { verificarFirmaWebhook } from "@/lib/donaciones/mercado-pago.server"
import { registrarDonacion } from "@/lib/donaciones/registro.server"
import { createAdminClient } from "@/utils/supabase/admin"

/**
 * Recibe los avisos de pagos de Mercado Pago. Verifica la firma `x-signature` y vuelve a
 * consultar el pago en la API antes de guardar nada: el cuerpo del aviso solo aporta el id.
 * Responde 200 a los avisos que no son de pagos para que Mercado Pago no los reintente, y 400
 * a los que traen un id de pago que no es numérico.
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
  // Los ids de pago de Mercado Pago son numéricos: cualquier otra cosa no se consulta.
  if (!/^\d+$/.test(dataId)) return NextResponse.json({ error: "Aviso inválido" }, { status: 400 })

  try {
    const resultado = await registrarDonacion(createAdminClient(), dataId)
    if (resultado.tipo === "registrada" && resultado.avisoPendiente) {
      return NextResponse.json({ error: "Donación guardada; emails pendientes" }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    // El id de la URL no va al log: lo controla quien llama. El error ya trae el id del pago.
    console.error("Error al registrar la donación", error)
    return NextResponse.json({ error: "No se pudo registrar la donación" }, { status: 500 })
  }
}
