"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

const incidentSteps = [
  ["Detectá", "un problema urbano."],
  ["Reportá", "con ubicación y, si podés, una foto."],
  ["Compartí", "para que la comunidad lo vea."],
  ["Seguí", "el estado hasta que se resuelva."],
] as const

const petSteps = [
  ["Explorá", "las mascotas perdidas y encontradas en el mapa."],
  ["Elegí", "un marcador para ver la foto y los datos de la publicación."],
  ["Contactá", "a quien publicó la mascota con el teléfono disponible."],
  ["Publicá", "una mascota perdida desde el botón +."],
] as const

const ONBOARDING_STORAGE_KEY = "reporty_onboarding_completed"

function OnboardingGuide({
  open,
  title,
  description,
  steps,
  buttonLabel,
  onStart,
}: {
  open: boolean
  title: string
  description: string
  steps: ReadonlyArray<readonly [string, string]>
  buttonLabel: string
  onStart: () => void
}) {
  return (
    <Dialog open={open}>
      <DialogContent
        showClose={false}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        className="max-w-xl"
      >
        <DialogHeader className="pr-2">
          <DialogTitle className="text-xl sm:text-2xl">{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <ol className="grid gap-3 sm:grid-cols-2" aria-label="Cómo funciona Reporty">
          {steps.map(([stepTitle, stepDescription], index) => (
            <li key={stepTitle} className="flex gap-3 rounded-xl border border-border/70 bg-muted/40 p-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                {index + 1}
              </span>
              <p className="text-sm leading-5 text-foreground">
                <strong>{stepTitle}</strong> {stepDescription}
              </p>
            </li>
          ))}
        </ol>

        <DialogFooter>
          <Button type="button" size="lg" className="w-full sm:w-auto" onClick={onStart}>
            {buttonLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function OnboardingModal() {
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      if (!window.localStorage.getItem(ONBOARDING_STORAGE_KEY)) {
        setIsOpen(true)
      }
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [])

  const handleStart = () => {
    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, "true")
    setIsOpen(false)
  }

  return (
    <OnboardingGuide
      open={isOpen}
      title="Bienvenido a Reporty"
      description="Reporty conecta tus observaciones con la comunidad de Posadas."
      steps={incidentSteps}
      buttonLabel="Comenzá"
      onStart={handleStart}
    />
  )
}

export function MascotasOnboardingModal({ open, onComplete }: { open: boolean; onComplete: () => void }) {
  return (
    <OnboardingGuide
      open={open}
      title="Explorá las mascotas de Posadas"
      description="Encontrá publicaciones de mascotas perdidas o encontradas y ayudá a que vuelvan a casa."
      steps={petSteps}
      buttonLabel="Entendido"
      onStart={onComplete}
    />
  )
}
