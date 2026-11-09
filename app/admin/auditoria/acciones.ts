"use server"

import { redirect } from "next/navigation"

import { verificarEsAdmin } from "@/database/queries/admin/verificar-admin"
import { crearDependenciasArchivado } from "@/lib/auditoria-archivo/datos-archivado"
import { ejecutarArchivado } from "@/lib/auditoria-archivo/servicio-archivado"
import { createClient } from "@/utils/supabase/server"

/**
 * Ancla de la sección «Historial archivado»: tras cada acción la página vuelve
 * a esa sección en lugar de saltar al principio.
 */
const ANCLA_HISTORIAL = "#historial-archivado"

/**
 * Autoriza la acción: sesión con rol Admin, verificada contra la base.
 *
 * @returns el usuario autenticado y autorizado.
 */
async function autorizarAdministracion(): Promise<{ id: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth?next=/admin/auditoria")

  const { isAdmin } = await verificarEsAdmin(supabase, user.id)
  if (!isAdmin) redirect("/mapa")

  return { id: user.id }
}

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
  const usuario = await autorizarAdministracion()

  // El destino se calcula afuera del `try`: `redirect` corta el flujo lanzando,
  // así que nunca debe quedar dentro del bloque que captura errores.
  let destino: string
  try {
    const resumen = await ejecutarArchivado(
      { modo: "dry-run", ejecutor: `admin:${usuario.id}`, actorId: usuario.id },
      crearDependenciasArchivado(),
    )
    destino = `/admin/auditoria?simulacion=${resumen.elegibles}${ANCLA_HISTORIAL}`
  } catch {
    // Sin configuración de R2 la simulación no puede leer la base de control.
    destino = `/admin/auditoria?simulacion=error${ANCLA_HISTORIAL}`
  }

  redirect(destino)
}
