"use server"

import { redirect } from "next/navigation"

import { verificarEsAdmin } from "@/database/queries/admin/verificar-admin"
import { crearClienteR2 } from "@/lib/auditoria-archivo/cliente-r2"
import {
  LIMITE_CORRIDA_MANUAL,
  leerConfiguracionArchivo,
  pruebasDelPanelHabilitadas,
} from "@/lib/auditoria-archivo/configuracion"
import { crearDependenciasArchivado } from "@/lib/auditoria-archivo/datos-archivado"
import { diagnosticarR2 } from "@/lib/auditoria-archivo/diagnostico"
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

/**
 * Diagnóstico de la conexión con Cloudflare R2 desde el panel.
 *
 * Sube una sonda con prefijo propio, la lee, compara su hash y la borra: nunca
 * toca el archivo de auditoría ni imprime credenciales. Deshabilitada en producción.
 */
export async function diagnosticarConexionR2Action(): Promise<void> {
  await autorizarAdministracion()
  // Esconder el botón no alcanza: una server action se puede invocar igual.
  if (!pruebasDelPanelHabilitadas()) redirect("/admin/auditoria")
  const configuracion = leerConfiguracionArchivo()
  const resultado = await diagnosticarR2(crearClienteR2(configuracion), configuracion)

  redirect(`/admin/auditoria?r2=${resultado.ok ? "ok" : "error"}&detalle=${encodeURIComponent(resultado.detalle)}${ANCLA_HISTORIAL}`)
}

/**
 * Corrida real acotada disparada desde el panel.
 *
 * Sirve para validar el ciclo completo en local antes de producción y está
 * deshabilitada en producción. Respeta
 * `AUDIT_ARCHIVE_PURGE_ENABLED`: con la purga apagada archiva y verifica, pero no
 * borra nada de PostgreSQL.
 */
export async function ejecutarArchivadoManualAction(): Promise<void> {
  const usuario = await autorizarAdministracion()
  // En producción la corrida real la dispara solo el cron.
  if (!pruebasDelPanelHabilitadas()) redirect("/admin/auditoria")

  const resumen = await ejecutarArchivado(
    {
      modo: "real",
      ejecutor: `admin:${usuario.id}`,
      actorId: usuario.id,
      limite: LIMITE_CORRIDA_MANUAL,
    },
    crearDependenciasArchivado(),
  )

  const parametros = new URLSearchParams({
    archivado: resumen.ok ? "ok" : "error",
    eventos: String(resumen.lote?.cantidadRegistros ?? 0),
    purgado: String(resumen.purgado),
  })
  redirect(`/admin/auditoria?${parametros.toString()}${ANCLA_HISTORIAL}`)
}
