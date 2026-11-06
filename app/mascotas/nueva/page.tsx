import { redirect } from "next/navigation"
import { FormularioMascota } from "./formulario-mascota"
import { createClient } from "@/utils/supabase/server"

export default async function NuevaMascotaPage() {
  let user = null
  let authFailed = false

  try {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.getUser()
    user = data.user
    authFailed = Boolean(error)
  } catch {
    authFailed = true
  }

  if (authFailed || !user || user.is_anonymous) {
    redirect("/auth?next=/mascotas/nueva")
  }

  return <FormularioMascota />
}
