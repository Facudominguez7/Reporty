"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { cambiarEstadoAdminWorkflow, eliminarReporteAdminWorkflow } from "@/lib/use-cases/reportes"
import { createAdminClient } from "@/utils/supabase/admin"
import { createClient } from "@/utils/supabase/server"

const reportIdSchema = z.coerce.number().int().positive()
const stateIdSchema = z.coerce.number().int().positive()

async function currentAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user ? { supabase, user } : null
}

export async function cambiarEstadoReporteAction(reporteId: number, nuevoEstadoId: number) {
  try {
    const actor = await currentAdmin()
    if (!actor) return { success: false, error: "Tenés que iniciar sesión para administrar reportes." }
    return await cambiarEstadoAdminWorkflow(
      createAdminClient(),
      reportIdSchema.parse(reporteId),
      stateIdSchema.parse(nuevoEstadoId),
      actor.user.id,
      "Cambio de estado realizado desde la administración",
    ).then((result) => {
      if (result.success) {
        revalidatePath("/admin/reportes")
        revalidatePath("/admin")
      }
      return result
    })
  } catch {
    return { success: false, error: "No se pudo actualizar el estado del reporte." }
  }
}

export async function eliminarReporteAction(reporteId: number) {
  try {
    const actor = await currentAdmin()
    if (!actor) return { success: false, error: "Tenés que iniciar sesión para administrar reportes." }
    const result = await eliminarReporteAdminWorkflow(createAdminClient(), reportIdSchema.parse(reporteId), actor.user.id)
    if (result.success) {
      revalidatePath("/admin/reportes")
      revalidatePath("/admin")
    }
    return result
  } catch {
    return { success: false, error: "No se pudo eliminar el reporte." }
  }
}
