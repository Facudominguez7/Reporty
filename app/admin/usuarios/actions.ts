"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { getUserRoleContext, isAdminRole } from "@/lib/authz/roles"
import { createAdminClient } from "@/utils/supabase/admin"
import { createClient } from "@/utils/supabase/server"

const userIdSchema = z.string().uuid()

async function getAdminActor() {
  const sessionClient = await createClient()
  const { data: authData } = await sessionClient.auth.getUser()
  if (!authData.user) return null
  const { data: roleContext, error } = await getUserRoleContext(sessionClient, authData.user.id)
  if (error || !isAdminRole(roleContext?.roleId)) return null
  return authData.user
}

export async function updateUserAccessAction(userId: string, blocked: boolean) {
  try {
    const actor = await getAdminActor()
    if (!actor) return { success: false, error: "No tenés permisos para administrar usuarios." }

    const targetId = userIdSchema.parse(userId)
    if (targetId === actor.id) return { success: false, error: "No podés bloquear tu propia cuenta." }

    const { error } = await createAdminClient().auth.admin.updateUserById(targetId, {
      ban_duration: blocked ? "876000h" : "none",
    })
    if (error) return { success: false, error: "No se pudo actualizar el acceso del usuario." }

    revalidatePath("/admin/usuarios")
    return { success: true }
  } catch {
    return { success: false, error: "No se pudo actualizar el acceso del usuario." }
  }
}
