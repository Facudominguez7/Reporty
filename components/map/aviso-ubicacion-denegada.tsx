/**
 * Aviso de ubicación negada en el mapa (#297): chico, descartable y una sola vez. Explica cómo
 * activar la ubicación para ver lo que hay cerca; el mapa funciona igual sin ella.
 */
import { LocateOff, X } from "lucide-react"

import { Button } from "@/components/ui/button"

type AvisoUbicacionDenegadaProps = {
  onCerrar: () => void
}

/**
 * Muestra cómo activar la ubicación.
 *
 * @param onCerrar - Descarta el aviso.
 * @returns El aviso.
 */
export function AvisoUbicacionDenegada({ onCerrar }: AvisoUbicacionDenegadaProps) {
  return (
    <div
      role="status"
      className="mapa-vidrio-superficie pointer-events-auto flex w-[min(92vw,22rem)] items-start gap-2 rounded-2xl border p-3 text-sm shadow-md"
    >
      <LocateOff className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <p className="flex-1">
        <span className="font-semibold">Activá la ubicación</span> para ver los reportes cerca tuyo: permitila en
        los permisos del sitio (el candado junto a la dirección) o en los ajustes de la app.
      </p>
      <Button type="button" variant="ghost" size="icon-sm" className="-m-1 shrink-0" aria-label="Cerrar aviso de ubicación" onClick={onCerrar}>
        <X className="size-4" aria-hidden="true" />
      </Button>
    </div>
  )
}
