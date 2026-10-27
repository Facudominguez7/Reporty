"use client"

import { useState, useTransition, type MouseEvent } from "react"
import { useRouter } from "next/navigation"
import { LogOut } from "lucide-react"
import { toast } from "sonner"

import { signout } from "@/app/auth/actions"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"

const SIGN_OUT_ERROR = "No pudimos cerrar la sesión"

const SIGN_OUT_ERROR_DESCRIPTIONS = {
  failed: "Por favor, intenta nuevamente",
} as const

/**
 * Sign-out action confirmed in a dialog. Guests receive an explicit irreversible-access warning.
 */
export function SignOutSection({ guest = false, fullWidth = false }: { guest?: boolean; fullWidth?: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const confirmSignOut = (event: MouseEvent<HTMLButtonElement>) => {
    // Keep the dialog open while the session closes so the pending state stays visible.
    event.preventDefault()

    startTransition(async () => {
      try {
        const result = await signout()

        if (!result.ok) {
          toast.error(SIGN_OUT_ERROR, { description: SIGN_OUT_ERROR_DESCRIPTIONS[result.reason] })
          return
        }

        setOpen(false)
        toast.success("Sesión cerrada")
        router.replace("/")
      } catch {
        toast.error(SIGN_OUT_ERROR, { description: SIGN_OUT_ERROR_DESCRIPTIONS.failed })
      }
    })
  }

  return (
    <section aria-label="Cerrar sesión" className="flex justify-end">
      <AlertDialog open={open} onOpenChange={(next) => !isPending && setOpen(next)}>
        <AlertDialogTrigger asChild>
          <Button
            variant="destructive"
            className={fullWidth ? "w-full" : "w-full sm:w-auto"}
          >
            <LogOut className="size-4" aria-hidden="true" />
            Cerrar sesión
          </Button>
        </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Cerrar sesión?</AlertDialogTitle>
                <AlertDialogDescription>
                  {guest
                    ? "Esta sesión anónima no se puede recuperar. Si cerrás sesión, perderás el acceso para administrar los reportes que creaste como invitado."
                    : "Vas a salir de tu cuenta en todos los dispositivos donde la tengas abierta. Para volver a entrar vas a necesitar tu email y tu contraseña."}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={confirmSignOut}
                  disabled={isPending}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {isPending ? (
                    <>
                      <span
                        className="mr-2 size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                        aria-hidden="true"
                      />
                      Cerrando sesión...
                    </>
                  ) : (
                    <>
                      <LogOut className="mr-2 size-4" aria-hidden="true" />
                      Cerrar sesión
                    </>
                  )}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    </section>
  )
}
