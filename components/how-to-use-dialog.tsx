"use client"

import { CircleHelp } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

const generalSteps = [
  ["Explorá", "incidentes urbanos y mascotas perdidas en el mapa."],
  ["Reportá", "un problema o publicá una mascota perdida con ubicación y foto."],
  ["Compartí", "la publicación para que más personas puedan ayudar."],
  ["Seguí", "el estado del incidente o las novedades de la mascota."],
] as const

const petSteps = [
  ["Buscá", "mascotas perdidas o encontradas en el mapa."],
  ["Abrí", "un marcador para ver la foto y los datos de la publicación."],
  ["Contactá", "a quien publicó la mascota con el teléfono disponible."],
  ["Publicá", "una mascota perdida desde el botón +."],
] as const

export function HowToUseDialog({ layer }: { layer?: "reportes" | "mascotas" }) {
  const isPetLayer = layer === "mascotas"
  const steps = isPetLayer ? petSteps : generalSteps
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="liquid-glass"
          size="sm"
          className="size-9 p-0 gap-1.5 sm:size-auto sm:px-3.5"
        >
          <CircleHelp className="size-4" aria-hidden="true" />
          <span className="hidden sm:inline">Cómo usar</span>
          <span className="sr-only sm:hidden">{isPetLayer ? "Cómo usar el mapa de mascotas" : "Cómo usar Reporty"}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader className="pr-2">
          <DialogTitle className="text-xl sm:text-2xl">{isPetLayer ? "¿Cómo usar el mapa de mascotas?" : "¿Cómo usar Reporty?"}</DialogTitle>
          <DialogDescription>
            {isPetLayer
              ? "Encontrá publicaciones de mascotas perdidas o encontradas y ayudá a que vuelvan a casa."
              : "Reportá problemas urbanos, publicá mascotas perdidas y ayudá a la comunidad de Posadas."}
          </DialogDescription>
        </DialogHeader>

        <ol className="grid gap-3 sm:grid-cols-2" aria-label="Cómo funciona Reporty">
          {steps.map(([title, description], index) => (
            <li key={title} className="flex gap-3 rounded-xl border border-border/70 bg-muted/40 p-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                {index + 1}
              </span>
              <p className="text-sm leading-5 text-foreground">
                <strong>{title}</strong> {description}
              </p>
            </li>
          ))}
        </ol>

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" size="lg" className="w-full sm:w-auto">
              Entendido
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
