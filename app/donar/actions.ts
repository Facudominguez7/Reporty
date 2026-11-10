"use server"

import { headers } from "next/headers"

import { esquemaDonacion } from "@/lib/donaciones/montos"
import { crearPreferenciaDonacion } from "@/lib/donaciones/mercado-pago.server"
import { SITE_URL } from "@/lib/seo/site"
import { createClient } from "@/utils/supabase/server"

export type ResultadoIniciarDonacion = { ok: true; urlPago: string } | { ok: false; error: string }

/**
 * Devuelve el origen desde el que se envió el formulario, para que Mercado Pago vuelva al
 * mismo sitio (producción o el servidor de desarrollo). Si no es http(s), usa el sitio público.
 */
async function origenDelSitio(): Promise<string> {
  const origen = (await headers()).get("origin")
  try {
    const url = new URL(origen ?? "")
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : SITE_URL
  } catch {
    return SITE_URL
  }
}

/**
 * Valida el monto, el nombre y el mensaje, y crea la preferencia de Checkout Pro. Si hay
 * sesión, la donación queda asociada al usuario; si no, se dona igual.
 */
export async function iniciarDonacionAction(entrada: { monto: number; nombre?: string; mensaje?: string }): Promise<ResultadoIniciarDonacion> {
  const datos = esquemaDonacion.safeParse(entrada)
  if (!datos.success) return { ok: false, error: datos.error.issues[0]?.message ?? "Revisá los datos de la donación." }

  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()

  try {
    const { urlPago } = await crearPreferenciaDonacion({
      ...datos.data,
      usuarioId: data.user?.id ?? null,
      origen: await origenDelSitio(),
    })
    return { ok: true, urlPago }
  } catch (error) {
    console.error("No se pudo iniciar la donación", error)
    return { ok: false, error: "No pudimos conectar con Mercado Pago. Probá de nuevo en unos minutos." }
  }
}
