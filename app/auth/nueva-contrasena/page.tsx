/**
 * New password page, opened from the recovery email through `/auth/callback`. It needs the
 * recovery session the callback creates; without it the user is sent back to request a link.
 * Any permanent session can reach this page; the authorization for the change itself is
 * Supabase "Secure password change" (see `supabase/README.md`), because the browser can call
 * the Auth API directly with its own session and an app-side check would be bypassed.
 */

import Link from "next/link"

import { SetPasswordForm } from "@/components/guest-account/set-password-form"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { isAnonymousUser } from "@/lib/authz/roles"
import { createClient } from "@/utils/supabase/server"
import { RUTA_RECUPERAR_CONTRASENA } from "../rutas-seguras"

export default async function NuevaContrasenaPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const canSetPassword = Boolean(user?.email) && !isAnonymousUser(user)

  return (
    <div className="auth-shell px-4 py-6">
      <div className="mx-auto w-full max-w-md">
        <Card>
          {canSetPassword ? (
            <>
              <CardHeader className="pb-4">
                <CardTitle className="text-xl">Elegí tu nueva contraseña</CardTitle>
                <CardDescription>
                  Vas a ingresar con {user?.email} y esta contraseña desde cualquier dispositivo.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <SetPasswordForm />
              </CardContent>
            </>
          ) : (
            <>
              <CardHeader className="pb-4">
                <CardTitle className="text-xl">El enlace no es válido</CardTitle>
                <CardDescription>
                  Para crear una nueva contraseña, abrí el enlace que te enviamos por correo desde este mismo navegador.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild className="w-full">
                  <Link href={RUTA_RECUPERAR_CONTRASENA} prefetch={false}>Pedir un enlace nuevo</Link>
                </Button>
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </div>
  )
}
