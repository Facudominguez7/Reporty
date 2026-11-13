import { timingSafeEqual } from "node:crypto"
import { NextResponse } from "next/server"
import { Resend } from "resend"

import { ErrorConfiguracionArchivo, leerSecretoCron } from "@/lib/auditoria-archivo/configuracion"
import { enviarRecordatoriosPendientes } from "@/lib/notifications/recordatorios.server"
import { resolveSiteUrl } from "@/lib/seo/site"
import { createAdminClient } from "@/utils/supabase/admin"

/**
 * Corrida diaria del recordatorio quincenal a dueños de reportes abiertos y mascotas perdidas.
 *
 * Solo acepta `POST` con `Authorization: Bearer <AUDIT_ARCHIVE_CRON_SECRET>`, el mismo secreto
 * del Worker que ya dispara el archivo de auditoría, comparado en tiempo constante. Sin secreto
 * configurado responde 503 y no envía nada.
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

/** Máximo de correos por corrida: acota la duración de la request y el ritmo de Resend. */
const LIMITE_POR_CORRIDA = 100

/** Respuesta JSON sin caché. */
function respuesta(cuerpo: Record<string, unknown>, estado = 200) {
  return NextResponse.json(cuerpo, { status: estado, headers: { "Cache-Control": "no-store" } })
}

/**
 * Compara el token del pedido con el secreto configurado en tiempo constante.
 *
 * @param peticion - Request entrante.
 * @param secreto - Secreto esperado, ya validado.
 * @returns `true` cuando el Bearer coincide.
 */
function autorizado(peticion: Request, secreto: string): boolean {
  const [esquema, token] = (peticion.headers.get("authorization") ?? "").split(" ")
  if (esquema?.toLowerCase() !== "bearer" || !token) return false
  const esperado = Buffer.from(secreto, "utf8")
  const recibido = Buffer.from(token, "utf8")
  return esperado.length === recibido.length && timingSafeEqual(esperado, recibido)
}

/**
 * Envía los recordatorios vencidos y devuelve solo conteos.
 *
 * @param peticion - Request del Cron Trigger.
 * @returns Resumen de la corrida, o el error de configuración o autorización.
 */
export async function POST(peticion: Request): Promise<NextResponse> {
  let secreto: string
  try {
    secreto = leerSecretoCron()
  } catch (error) {
    if (error instanceof ErrorConfiguracionArchivo) {
      return respuesta({ error: "Los recordatorios no están configurados." }, 503)
    }
    throw error
  }

  if (!autorizado(peticion, secreto)) return respuesta({ error: "No autorizado." }, 401)

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return respuesta({ error: "Los recordatorios no están configurados." }, 503)

  const resend = new Resend(apiKey)
  try {
    const resumen = await enviarRecordatoriosPendientes({
      supabase: createAdminClient(),
      enviar: (mensaje, opciones) => resend.emails.send(mensaje, opciones),
      urlApp: resolveSiteUrl(process.env.NEXT_PUBLIC_APP_URL),
      limite: LIMITE_POR_CORRIDA,
    })
    return respuesta({ ok: true, ...resumen })
  } catch (error) {
    console.error("Corrida de recordatorios fallida", error instanceof Error ? error.message : "error")
    return respuesta({ error: "La corrida de recordatorios no pudo ejecutarse." }, 500)
  }
}
