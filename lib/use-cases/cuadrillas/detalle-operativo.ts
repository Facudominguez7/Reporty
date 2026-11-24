import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import {
  obtenerAsignacionAbierta,
  obtenerEstadoOperativoPublicoPorReporte,
} from "@/database/queries/cuadrillas"
import type { EstadoOperativo } from "@/lib/authz/catalog"
import { getUserRoleContext, puedeOperarCuadrillas } from "@/lib/authz/roles"
import { createAdminClient } from "@/utils/supabase/admin"

import { obtenerLineaTiempoWorkflow, type EventoLineaTiempo } from "./linea-tiempo"

/**
 * Datos de seguimiento de cuadrilla (solo lectura) que el detalle de un reporte necesita
 * renderizar. La gestión operativa (asignar, reasignar, cerrar, etc.) vive exclusivamente en
 * `/dashboard/cuadrillas`; esta página nunca recibe campos internos como `asignacionAbierta`.
 */
export type GestionOperativaDetalle = {
  puedeOperar: boolean
  estadoOperativo: EstadoOperativo | null
  cuadrillaNombre: string | null
  eventos: EventoLineaTiempo[]
}

/**
 * Carga los datos de seguimiento de cuadrilla (solo lectura) de un reporte para el detalle:
 * estado operativo actual y línea de tiempo combinada.
 *
 * `usuarioId` tiene que venir de la sesión verificada en el servidor (`auth.getUser()` del
 * cliente con cookies), nunca de un parámetro que mande el navegador: el rol que se lee con
 * él decide qué fuente de datos se usa. Por eso este módulo es `server-only` y no es una
 * server action.
 *
 * Defensa en profundidad: para quien NO puede operar cuadrillas, el resumen
 * (`estadoOperativo`/`cuadrillaNombre`) sale siempre de la vista pública
 * `reportes_estado_operativo_publico`, nunca de la tabla base — así el componente nunca puede
 * filtrar por accidente `asignadaPor` u observaciones internas a un ciudadano, aunque tenga un
 * bug. Para quien sí puede operar, el mismo resumen sale de la asignación abierta (tabla base),
 * pero esa asignación completa nunca se envía al cliente.
 */
export async function obtenerGestionOperativaDetalle(
  supabase: SupabaseClient,
  usuarioId: string | null,
  reporteId: number,
  rolIdPrecargado?: number | null,
): Promise<GestionOperativaDetalle> {
  // La ficha ya leyó el rol de la sesión del servidor: si lo pasa, no se vuelve a leer.
  let roleId: number | null = rolIdPrecargado ?? null
  if (usuarioId && rolIdPrecargado === undefined) {
    const { data: roleContext } = await getUserRoleContext(supabase, usuarioId)
    roleId = roleContext?.roleId ?? null
  }

  const puedeOperar = puedeOperarCuadrillas(roleId)
  const admin = createAdminClient()

  if (puedeOperar) {
    const [{ data: asignacionAbierta }, eventos] = await Promise.all([
      obtenerAsignacionAbierta(admin, reporteId),
      obtenerLineaTiempoWorkflow(admin, reporteId, roleId),
    ])

    return {
      puedeOperar,
      estadoOperativo: asignacionAbierta?.estadoOperativo ?? null,
      cuadrillaNombre: asignacionAbierta?.cuadrillaNombre ?? null,
      eventos,
    }
  }

  const [estadoOperativoPorReporte, eventos] = await Promise.all([
    obtenerEstadoOperativoPublicoPorReporte(admin, [reporteId]),
    obtenerLineaTiempoWorkflow(admin, reporteId, roleId),
  ])
  const resumenPublico = estadoOperativoPorReporte.get(reporteId) ?? null

  return {
    puedeOperar,
    estadoOperativo: (resumenPublico?.estadoOperativo as EstadoOperativo | undefined) ?? null,
    cuadrillaNombre: resumenPublico?.cuadrillaNombre ?? null,
    eventos,
  }
}
