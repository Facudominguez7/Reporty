import Link from "next/link"
import { Heart } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Botón «Donar» del encabezado: píldora blanca con borde verde que lleva a `/donar`.
 * `actual` lo marca como página activa cuando el visitante ya está donando.
 */
export function BotonDonarEncabezado({ actual = false, className }: { actual?: boolean; className?: string }) {
  return (
    <Link
      href="/donar"
      aria-current={actual ? "page" : undefined}
      className={cn(
        "inline-flex min-h-9 items-center gap-1.5 rounded-full border border-primary/35 bg-card px-3 text-xs font-semibold text-primary shadow-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:min-h-10 sm:px-4 sm:text-sm",
        className,
      )}
    >
      <Heart className="size-3.5 sm:size-4" aria-hidden="true" />
      Donar
    </Link>
  )
}

/**
 * Invitación a donar dentro del diálogo que aparece después de publicar un reporte o una mascota.
 */
export function InvitacionDonar() {
  return (
    <div className="space-y-2.5 rounded-xl border border-primary/25 bg-primary/[0.08] p-3.5">
      <p className="text-sm font-medium leading-5">Reporty es gratis. Si te sirvió, podés ayudarnos a mantenerlo.</p>
      <Link
        href="/donar"
        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-primary/35 bg-card text-sm font-semibold text-primary transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <Heart className="size-4" aria-hidden="true" />
        Donar a Reporty
      </Link>
    </div>
  )
}
