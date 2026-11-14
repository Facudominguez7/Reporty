"use client"

import { useId, useState, useTransition, type FormEvent } from "react"
import { AtSign } from "lucide-react"
import { toast } from "sonner"

import { actualizarNombreUsuarioAction } from "@/app/cuenta/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LARGO_MAXIMO_NOMBRE_USUARIO } from "@/lib/cuenta/nombre-usuario"

/**
 * Muestra el nombre de usuario público y permite cambiarlo desde «Mi cuenta».
 *
 * El servidor valida formato, nombres reservados, lenguaje ofensivo y unicidad; este formulario
 * solo muestra el resultado. Mientras se guarda, los botones quedan deshabilitados.
 *
 * @param props.nombreActual - Nombre de usuario vigente, o `null` si todavía no tiene uno.
 * @returns La sección con el nombre y su formulario de edición.
 */
export function NombreUsuarioSection({ nombreActual }: { nombreActual: string | null }) {
  const idCampo = useId()
  const idAyuda = useId()
  const [nombre, setNombre] = useState(nombreActual)
  const [editando, setEditando] = useState(false)
  const [valor, setValor] = useState(nombreActual ?? "")
  const [error, setError] = useState<string | null>(null)
  const [pendiente, startTransition] = useTransition()

  /** Abre el formulario con el nombre vigente. */
  const empezarEdicion = () => {
    setValor(nombre ?? "")
    setError(null)
    setEditando(true)
  }

  /** Cierra el formulario sin guardar, salvo mientras se está guardando. */
  const cancelar = () => {
    if (pendiente) return
    setEditando(false)
    setError(null)
  }

  /** Envía el nombre al servidor y, si se guardó, muestra el nombre normalizado. */
  const guardar = (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault()
    startTransition(async () => {
      try {
        const resultado = await actualizarNombreUsuarioAction(valor)
        if (!resultado.success) {
          setError(resultado.error)
          return
        }
        setNombre(resultado.nombre)
        setEditando(false)
        setError(null)
        toast.success("Tu nombre de usuario se actualizó.")
      } catch {
        setError("No pudimos guardar tu nombre de usuario. Probá de nuevo.")
      }
    })
  }

  return (
    <section aria-labelledby={`${idCampo}-titulo`} className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-start gap-3">
        <AtSign className="mt-0.5 size-4 shrink-0 text-secondary" aria-hidden="true" />
        <div className="min-w-0 flex-1 space-y-1">
          <h2 id={`${idCampo}-titulo`} className="text-sm font-semibold">
            Nombre de usuario
          </h2>
          <p className="text-xs text-muted-foreground">
            Es público: aparece en tus reportes, tus comentarios y el ranking.
          </p>
          {!editando && <p className="break-all text-base font-medium">{nombre ? `@${nombre}` : "Sin nombre de usuario"}</p>}
        </div>
        {!editando && (
          <Button type="button" variant="outline" size="sm" onClick={empezarEdicion}>
            Cambiar
          </Button>
        )}
      </div>

      {editando && (
        <form onSubmit={guardar} className="mt-4 space-y-3" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor={idCampo}>Nuevo nombre de usuario</Label>
            <Input
              id={idCampo}
              value={valor}
              onChange={(evento) => setValor(evento.target.value)}
              maxLength={LARGO_MAXIMO_NOMBRE_USUARIO}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              disabled={pendiente}
              aria-invalid={error ? true : undefined}
              aria-describedby={idAyuda}
            />
            <p id={idAyuda} className={error ? "text-xs text-destructive" : "text-xs text-muted-foreground"} role={error ? "alert" : undefined}>
              {error ?? "Entre 3 y 30 caracteres: letras sin tildes, números o guion bajo."}
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={cancelar} disabled={pendiente}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pendiente}>
              {pendiente ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        </form>
      )}
    </section>
  )
}
