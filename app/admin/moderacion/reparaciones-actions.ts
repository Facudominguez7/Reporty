"use server"

/**
 * Acciones administrativas de la cola de reparaciones (S8).
 *
 * Cada acción valida la sesión y el rol Admin en el servidor, revalida que la fila
 * siga en el estado que la cola mostró (para no decidir sobre datos viejos) y
 * delega en los casos de uso, que vuelven a autorizar contra la base.
 */
import { revalidatePath } from "next/cache"
import { z } from "zod"

import { getUserRoleContext, isAdminRole } from "@/lib/authz/roles"
import {
  resolverEvidenciaReparacionWorkflow,
  resolverImpugnacionReparacionWorkflow,
  type AccionEvidenciaAdministrativa,
  type DecisionImpugnacionReparacion,
  type ResultadoReparacion,
  type ResultadoResolucionEvidencia,
  type ResultadoResolucionImpugnacion,
} from "@/lib/use-cases/reportes/evidencia-reparacion"
import { createAdminClient } from "@/utils/supabase/admin"
import { createClient } from "@/utils/supabase/server"

const idSchema = z.string().uuid()
const decisionSchema = z.enum(["aceptada", "descartada"])
const accionSchema = z.enum(["aprobar", "rechazar", "revertir"])

const MENSAJE_SOLICITUD_INVALIDA = "La solicitud no es válida."
const MENSAJE_SIN_SESION = "Tenés que iniciar sesión como administrador."
const MENSAJE_SIN_PERMISO = "No tenés permisos para resolver la cola de reparaciones."
const MENSAJE_IMPUGNACION_RESUELTA = "La impugnación ya fue resuelta. Actualizá la cola antes de decidir."
const MENSAJE_IMPUGNACION_INEXISTENTE = "La impugnación ya no existe. Actualizá la cola."
const MENSAJE_EVIDENCIA_CAMBIADA = "La evidencia ya cambió de estado. Recargá la cola antes de decidir."
const MENSAJE_EVIDENCIA_INEXISTENTE = "La evidencia ya no existe. Recargá la cola."
const MENSAJE_FALLA_INESPERADA = "No pudimos resolver la solicitud. Recargá la cola antes de reintentar."

type Relacion<T> = T | T[] | null

type SesionAdministradora = { success: true; usuarioId: string } | { success: false; error: string }

/**
 * Verifica en el servidor que quien decide sea una cuenta Admin no anónima.
 *
 * @returns Identidad verificada o el error en español para la persona.
 */
async function sesionAdministradora(): Promise<SesionAdministradora> {
  const sesion = await createClient()
  const { data: { user } } = await sesion.auth.getUser()
  if (!user || user.is_anonymous) return { success: false, error: MENSAJE_SIN_SESION }
  const { data: roleContext, error } = await getUserRoleContext(sesion, user.id)
  if (error || !isAdminRole(roleContext?.roleId)) return { success: false, error: MENSAJE_SIN_PERMISO }
  return { success: true, usuarioId: user.id }
}

/** Normaliza la relación embebida de PostgREST a un objeto único. */
function uno<T>(relacion: Relacion<T> | undefined): T | null {
  return Array.isArray(relacion) ? relacion[0] ?? null : relacion ?? null
}

/** Revalida la cola, el marco administrativo y la ficha del reporte afectado. */
function revalidarCola(reporteId: number) {
  revalidatePath("/admin/moderacion")
  revalidatePath("/admin", "layout")
  revalidatePath(`/reportes/${reporteId}`)
}

/**
 * Acepta o descarta una impugnación pendiente (S5, S8).
 *
 * Aceptarla rechaza la evidencia y el reporte sigue pendiente; descartarla
 * reevalúa el umbral de tres confirmaciones y puede cerrar el reporte como
 * Reparado en la misma transacción, con el administrador como actor del historial.
 *
 * @param verificacionId - Impugnación que la cola mostró como pendiente.
 * @param decision - «aceptada» o «descartada».
 * @param motivo - Motivo opcional que queda en la auditoría.
 * @returns Resultado durable de la impugnación o el error en español.
 */
export async function resolverImpugnacionColaAction(
  verificacionId: string,
  decision: DecisionImpugnacionReparacion,
  motivo?: string,
): Promise<ResultadoReparacion<ResultadoResolucionImpugnacion>> {
  const parsed = idSchema.safeParse(verificacionId)
  const decisionValida = decisionSchema.safeParse(decision)
  if (!parsed.success || !decisionValida.success) return { success: false, error: MENSAJE_SOLICITUD_INVALIDA }

  const sesion = await sesionAdministradora()
  if (!sesion.success) return sesion

  try {
    const admin = createAdminClient()
    const { data, error } = await admin.from("verificaciones_reparacion")
      .select("id,tipo,estado,evidencias_reparacion(reporte_id)")
      .eq("id", parsed.data)
      .maybeSingle()

    if (error) return { success: false, error: MENSAJE_FALLA_INESPERADA }
    const fila = data as {
      tipo?: string
      estado?: string
      evidencias_reparacion?: Relacion<{ reporte_id?: number }>
    } | null
    if (!fila) return { success: false, error: MENSAJE_IMPUGNACION_INEXISTENTE }
    if (fila.tipo !== "impugnacion") return { success: false, error: MENSAJE_IMPUGNACION_INEXISTENTE }
    if (fila.estado !== "pendiente") return { success: false, error: MENSAJE_IMPUGNACION_RESUELTA }
    const reporteId = Number(uno(fila.evidencias_reparacion)?.reporte_id)

    const resultado = await resolverImpugnacionReparacionWorkflow(
      admin,
      parsed.data,
      sesion.usuarioId,
      decisionValida.data,
      (motivo ?? "").trim() || undefined,
    )
    if (resultado.success && Number.isInteger(reporteId)) revalidarCola(reporteId)
    return resultado
  } catch {
    return { success: false, error: MENSAJE_FALLA_INESPERADA }
  }
}

/** Estados desde los que la base acepta cada decisión administrativa. */
const ESTADOS_QUE_ADMITE: Record<AccionEvidenciaAdministrativa, readonly string[]> = {
  aprobar: ["en_verificacion"],
  rechazar: ["informada", "en_verificacion"],
  revertir: ["validada"],
}

/**
 * Aprueba, rechaza o revierte una evidencia (S8).
 *
 * Aprobar exige la foto publicada y cierra el reporte como Reparado; rechazar
 * conserva el reporte y sus fotos originales; revertir solo aplica a una
 * reparación validada y devuelve el reporte a Pendiente.
 *
 * @param evidenciaId - Evidencia que la cola mostró como decidible.
 * @param accion - «aprobar», «rechazar» o «revertir».
 * @param motivo - Motivo opcional que queda en la auditoría y el historial.
 * @returns Resultado durable de la evidencia o el error en español.
 */
export async function resolverEvidenciaColaAction(
  evidenciaId: string,
  accion: AccionEvidenciaAdministrativa,
  motivo?: string,
): Promise<ResultadoReparacion<ResultadoResolucionEvidencia>> {
  const parsed = idSchema.safeParse(evidenciaId)
  const accionValida = accionSchema.safeParse(accion)
  if (!parsed.success || !accionValida.success) return { success: false, error: MENSAJE_SOLICITUD_INVALIDA }

  const sesion = await sesionAdministradora()
  if (!sesion.success) return sesion

  try {
    const admin = createAdminClient()
    const { data, error } = await admin.from("evidencias_reparacion")
      .select("id,estado,reporte_id")
      .eq("id", parsed.data)
      .maybeSingle()

    if (error) return { success: false, error: MENSAJE_FALLA_INESPERADA }
    const fila = data as { estado?: string; reporte_id?: number } | null
    if (!fila) return { success: false, error: MENSAJE_EVIDENCIA_INEXISTENTE }
    if (!ESTADOS_QUE_ADMITE[accionValida.data].includes(fila.estado ?? "")) {
      return { success: false, error: MENSAJE_EVIDENCIA_CAMBIADA }
    }
    const reporteId = Number(fila.reporte_id)

    const resultado = await resolverEvidenciaReparacionWorkflow(
      admin,
      parsed.data,
      sesion.usuarioId,
      accionValida.data,
      (motivo ?? "").trim() || undefined,
    )
    if (resultado.success && Number.isInteger(reporteId)) revalidarCola(reporteId)
    return resultado
  } catch {
    return { success: false, error: MENSAJE_FALLA_INESPERADA }
  }
}
