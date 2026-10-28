"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { REPORT_STATE_IDS } from "@/lib/authz/catalog"
import { getUserRoleContext, isAdminRole } from "@/lib/authz/roles"
import { cambiarEstadoAdminWorkflow } from "@/lib/use-cases/reportes"
import { createAdminClient } from "@/utils/supabase/admin"
import { createClient } from "@/utils/supabase/server"

const reportIdSchema = z.number().int().positive()
const decisionSchema = z.enum(["rechazar", "descartar"])

export async function resolverRevisionRechazoAction(reporteId: number, decision: "rechazar" | "descartar") {
  const parsedId = reportIdSchema.safeParse(reporteId)
  const parsedDecision = decisionSchema.safeParse(decision)
  if (!parsedId.success || !parsedDecision.success) {
    return { success: false as const, error: "La revisión solicitada no es válida." }
  }

  const session = await createClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user || user.is_anonymous) return { success: false as const, error: "Tenés que iniciar sesión como administrador." }
  const { data: roleContext, error: roleError } = await getUserRoleContext(session, user.id)
  if (roleError || !isAdminRole(roleContext?.roleId)) {
    return { success: false as const, error: "No tenés permisos para resolver revisiones de reportes." }
  }

  const admin = createAdminClient()
  const { data: pendiente, error: lookupError } = await admin.from("reportes_revision_rechazo")
    .select("reporte_id")
    .eq("reporte_id", parsedId.data)
    .eq("estado", "pendiente")
    .maybeSingle()

  if (lookupError) return { success: false as const, error: "No pudimos verificar la revisión pendiente." }
  if (!pendiente) return { success: false as const, error: "Otro proceso ya resolvió esta revisión." }

  if (parsedDecision.data === "rechazar") {
    const result = await cambiarEstadoAdminWorkflow(
      admin,
      parsedId.data,
      REPORT_STATE_IDS.RECHAZADO,
      user.id,
      "Rechazado tras revisar los votos comunitarios de 'No existe'.",
    )
    if (!result.success) return result
  }

  const { data, error } = await admin.from("reportes_revision_rechazo")
    .update({
      estado: parsedDecision.data === "rechazar" ? "rechazada" : "descartada",
      resuelto_at: new Date().toISOString(),
      resuelto_por: user.id,
    })
    .eq("reporte_id", parsedId.data)
    .eq("estado", "pendiente")
    .select("reporte_id")
    .maybeSingle()

  if (error || !data) return { success: false as const, error: "No pudimos guardar la resolución de la revisión." }

  revalidatePath("/admin/moderacion")
  revalidatePath("/admin", "layout")
  revalidatePath(`/reportes/${parsedId.data}`)
  return { success: true as const }
}
