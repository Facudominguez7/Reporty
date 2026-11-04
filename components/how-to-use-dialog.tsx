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

const steps = [
  ["Detectá", "un problema urbano en tu barrio."],
  ["Reportá", "con ubicación y, si podés, una foto."],
  ["Compartí", "para que la comunidad pueda verlo."],
  ["Seguí", "el estado hasta que se resuelva."],
] as const

export function HowToUseDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="size-9 p-0 gap-1.5 rounded-full shadow-sm sm:size-auto sm:px-3.5"
        >
          <CircleHelp className="size-4" aria-hidden="true" />
          <span className="hidden sm:inline">Cómo usar</span>
          <span className="sr-only sm:hidden">Cómo usar Reporty</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader className="pr-2">
          <DialogTitle className="text-xl sm:text-2xl">¿Cómo usar Reporty?</DialogTitle>
          <DialogDescription>
            Reporty conecta tus observaciones con la comunidad para ayudar a mejorar Posadas.
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
