"use server"

import { revalidatePath } from "next/cache"
import { limpiarFotoMascotaRetirada } from "@/lib/moderation/mascotas-withdrawal.server"
import { createAdminClient } from "@/utils/supabase/admin"
import { createClient } from "@/utils/supabase/server"

export async function retirarMascotaAdminAction(id: number) {
  if (!Number.isSafeInteger(id) || id <= 0) return { success: false as const, error: "La publicación no está disponible." }
  try {
    const session = await createClient()
    const { data: { user }, error: authError } = await session.auth.getUser()
    if (authError || !user || user.is_anonymous) return { success: false as const, error: "No se pudo retirar la publicación." }
    const { data, error } = await session.rpc("retirar_mascota_moderacion", { p_mascota_id: id })
    if (error || data !== true) return { success: false as const, error: "La publicación no está disponible o ya fue retirada." }
    let cleanup
    try { cleanup = await limpiarFotoMascotaRetirada(createAdminClient(), id) }
    catch { cleanup = { pending: true, publiclyAccessible: true } }
    for (const path of [`/mascotas/${id}`, "/admin/mascotas", "/mapa", "/reportes", "/sitemap.xml"]) revalidatePath(path)
    return { success: true as const, message: cleanup.publiclyAccessible
      ? "La publicación fue retirada, pero su foto todavía puede verse mediante su URL pública. La limpieza quedó pendiente."
      : "La publicación fue retirada." }
  } catch {
    return { success: false as const, error: "No se pudo retirar la publicación. Verificá tus permisos y reintentá." }
  }
}
