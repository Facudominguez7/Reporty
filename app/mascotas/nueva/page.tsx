import { redirect } from "next/navigation"
import { FormularioMascota } from "./formulario-mascota"
import { createClient } from "@/utils/supabase/server"
import { obtenerUsuarioDeLectura } from "@/lib/auth/usuario-de-lectura"

/**
 * Formulario para publicar una mascota perdida. Exige una cuenta registrada: un visitante sin
 * sesión, un invitado o una sesión que no se puede verificar van a `/auth`.
 */
export default async function NuevaMascotaPage() {
  let user = null

  try {
    // Reads the verified token claims without a trip to Supabase Auth (#310); a token that does
    // not verify counts as no session. The publish action checks the session again with getUser.
    user = await obtenerUsuarioDeLectura(await createClient())
  } catch {
    user = null
  }

  if (!user || user.is_anonymous) {
    redirect("/auth?next=/mascotas/nueva")
  }

  return <FormularioMascota />
}
