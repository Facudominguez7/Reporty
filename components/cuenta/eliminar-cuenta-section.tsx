"use client"

import { useId, useState, useTransition, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { Trash2 } from "lucide-react"
import { toast } from "sonner"

import { eliminarCuentaAction } from "@/app/cuenta/actions"
import { AvisoEliminacionCuenta } from "@/components/cuenta/aviso-eliminacion-cuenta"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { CONFIRMACION_ELIMINAR_CUENTA, confirmaEliminacion } from "@/lib/cuenta/eliminacion"

/**
 * Acción para eliminar la cuenta propia (requisito de Google Play).
 *
 * El diálogo avisa qué se borra y exige escribir «ELIMINAR» antes de habilitar el botón.
 * Mientras se elimina, el diálogo no se puede cerrar para que el estado pendiente quede visible.
 *
 * @param props.invitado - La sesión es de invitado: ajusta el texto de la advertencia.
 * @returns La sección con el botón y su diálogo de confirmación.
 */
export function EliminarCuentaSection({ invitado = false }: { invitado?: boolean }) {
  const router = useRouter()
  const idCampo = useId()
  const [abierto, setAbierto] = useState(false)
  const [confirmacion, setConfirmacion] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pendiente, startTransition] = useTransition()
  const confirmado = confirmaEliminacion(confirmacion)

  /** Cierra o abre el diálogo, salvo mientras se está eliminando; al cerrar limpia el campo. */
  const cambiarApertura = (siguiente: boolean) => {
    if (pendiente) return
    setAbierto(siguiente)
    if (!siguiente) {
      setConfirmacion("")
      setError(null)
    }
  }

  /** Envía la confirmación y, si sale bien, lleva al inicio sin sesión. */
  const eliminar = (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault()
    if (!confirmado) return

    startTransition(async () => {
      try {
        const resultado = await eliminarCuentaAction(confirmacion)
        if (!resultado.success) {
          setError(resultado.error)
          return
        }
        setAbierto(false)
        toast.success("Tu cuenta fue eliminada")
        router.replace("/")
        router.refresh()
      } catch {
        setError("No pudimos eliminar tu cuenta. Probá de nuevo en unos minutos.")
      }
    })
  }

  return (
    <section aria-label="Eliminar cuenta" className="flex justify-end">
      <AlertDialog open={abierto} onOpenChange={cambiarApertura}>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive sm:w-auto">
            <Trash2 className="size-4" aria-hidden="true" />
            Eliminar cuenta
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent className="max-h-[90dvh] overflow-y-auto">
          <form onSubmit={eliminar} className="grid gap-4">
            <AlertDialogHeader>
              <AlertDialogTitle>¿Eliminar tu cuenta?</AlertDialogTitle>
              <AlertDialogDescription>
                {invitado
                  ? "Vas a eliminar tu sesión de invitado y todo lo que publicaste con ella."
                  : "Vas a eliminar tu cuenta de Reporty y todo lo que publicaste con ella."}
              </AlertDialogDescription>
            </AlertDialogHeader>

            <AvisoEliminacionCuenta />

            <div className="grid gap-2">
              <Label htmlFor={idCampo}>
                Escribí <span className="font-semibold">{CONFIRMACION_ELIMINAR_CUENTA}</span> para confirmar
              </Label>
              <Input
                id={idCampo}
                value={confirmacion}
                onChange={(evento) => setConfirmacion(evento.target.value)}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                disabled={pendiente}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `${idCampo}-error` : undefined}
              />
              {error && (
                <p id={`${idCampo}-error`} role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
            </div>

            <AlertDialogFooter>
              <AlertDialogCancel type="button" disabled={pendiente}>
                Cancelar
              </AlertDialogCancel>
              <Button type="submit" variant="destructive" disabled={!confirmado || pendiente}>
                {pendiente ? (
                  <>
                    <span
                      className="mr-2 size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                      aria-hidden="true"
                    />
                    Eliminando...
                  </>
                ) : (
                  <>
                    <Trash2 className="mr-2 size-4" aria-hidden="true" />
                    Eliminar mi cuenta
                  </>
                )}
              </Button>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
