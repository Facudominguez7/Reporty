"use server"

import { redirect } from "next/navigation"

import { verificarEsAdmin } from "@/database/queries/admin/verificar-admin"
import { crearDependenciasArchivado } from "@/lib/auditoria-archivo/datos-archivado"
import { ejecutarArchivado } from "@/lib/auditoria-archivo/servicio-archivado"
import { createClient } from "@/utils/supabase/server"

/**
 * Simulación manual del archivado desde el panel de auditoría.
 *
 * Solo Admin, y solo `dry-run`: reclama, sube y borra nada. La corrida real se
 * dispara por el endpoint programado (`POST /api/cron/auditoria-archivo`), porque
 * puede exceder el tiempo de una server action.
 *
 * El resultado viaja como parámetro de la URL (`simulacion`) para que la página
 * muestre el resumen sin estado en memoria del servidor.
 */
export async function simularArchivadoAction(): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth?next=/admin/auditoria")

  const { isAdmin } = await verificarEsAdmin(supabase, user.id)
  if (!isAdmin) redirect("/mapa")

  // El destino se calcula afuera del `try`: `redirect` corta el flujo lanzando,
  // así que nunca debe quedar dentro del bloque que captura errores.
  let destino: string
  try {
    const resumen = await ejecutarArchivado(
      { modo: "dry-run", ejecutor: `admin:${user.id}`, actorId: user.id },
      crearDependenciasArchivado(),
    )
    destino = `/admin/auditoria?simulacion=${resumen.elegibles}`
  } catch {
    // Sin configuración de R2 la simulación no puede leer la base de control.
    destino = "/admin/auditoria?simulacion=error"
  }

  redirect(destino)
}
