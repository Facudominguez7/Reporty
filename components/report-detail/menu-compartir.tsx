"use client"

/**
 * Menú de «Compartir» de la ficha: compartir el link o una imagen para historias de
 * Instagram. Al abrirse avisa con `onAbrir` para que la ficha genere la imagen antes
 * del toque: Safari sólo acepta `navigator.share` pegado al gesto de la persona.
 */

import type { ReactNode } from "react"
import { Instagram, Link2 } from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

/**
 * @param children - Botón que abre el menú (se usa como disparador con `asChild`).
 * @param onAbrir - Se llama al abrir el menú, para preparar la imagen de la historia.
 * @param onCompartirEnlace - Comparte o copia el link, como antes.
 * @param onCompartirHistoria - Comparte la imagen vertical para historias.
 */
export function MenuCompartir({
  children,
  onAbrir,
  onCompartirEnlace,
  onCompartirHistoria,
}: {
  children: ReactNode
  onAbrir: () => void
  onCompartirEnlace: () => void
  onCompartirHistoria: () => void
}) {
  return (
    <DropdownMenu onOpenChange={(abierto) => abierto && onAbrir()}>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        <DropdownMenuItem onSelect={onCompartirHistoria} className="min-h-11 gap-2">
          <Instagram className="size-4" aria-hidden="true" />
          Historia de Instagram
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onCompartirEnlace} className="min-h-11 gap-2">
          <Link2 className="size-4" aria-hidden="true" />
          Compartir enlace
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
