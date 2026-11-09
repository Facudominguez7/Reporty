/**
 * Password recovery: sends a link to choose a new password. It also lets accounts without
 * a password (converted guests) create one.
 */

import Link from "next/link"

import { RecoveryForm } from "./recovery-form"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

type RecuperarPageProps = {
  searchParams: Promise<{ error?: string }>
}

export default async function RecuperarPage({ searchParams }: RecuperarPageProps) {
  const { error } = await searchParams

  return (
    <div className="auth-shell px-4 py-6">
      <div className="mx-auto w-full max-w-md">
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-xl">Recuperar contraseña</CardTitle>
            <CardDescription>
              Ingresá tu correo y te enviamos un enlace para crear una nueva contraseña. Si guardaste tu cuenta de
              invitado y todavía no tenés contraseña, también podés crearla desde acá.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {error === "enlace" && (
              <Alert variant="destructive">
                <AlertTitle>El enlace no es válido</AlertTitle>
                <AlertDescription>
                  Puede haber expirado o ya haberse usado. Pedí uno nuevo y abrilo desde este mismo navegador.
                </AlertDescription>
              </Alert>
            )}

            <RecoveryForm />

            <p className="text-center text-sm text-muted-foreground">
              <Link href="/auth" prefetch={false} className="text-primary hover:underline">
                Volver a ingresar
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
