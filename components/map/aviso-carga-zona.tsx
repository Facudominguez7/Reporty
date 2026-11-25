/**
 * Aviso flotante del mapa por zona (#281): indica que se están pidiendo los reportes de la zona
 * visible o que no llegaron, para que una zona sin marcadores no parezca una zona sin reportes.
 */
import { Loader2, RotateCw, TriangleAlert } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { EstadoCargaZona } from "@/lib/map/cargador-zona"

type AvisoCargaZonaProps = {
  estado: EstadoCargaZona
  onReintentar: () => void
}

/**
 * Muestra el estado de la carga de la zona sobre el mapa. La posición la da la columna de avisos
 * del mapa (`MapaPorZona`), que lo apila con el panel de cercanos.
 *
 * @param estado - `cargando`, `listo` (no muestra nada) o `error`.
 * @param onReintentar - Vuelve a pedir la zona visible.
 * @returns El aviso, o nada si la zona ya cargó.
 */
export function AvisoCargaZona({ estado, onReintentar }: AvisoCargaZonaProps) {
  if (estado === "listo") return null

  const ubicacion = "flex justify-center"
  const superficie = "mapa-vidrio-superficie pointer-events-auto flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm shadow-md"

  if (estado === "cargando") {
    return (
      // Aparece con retraso: en las cargas rápidas no llega a verse y no titila.
      <div className={`${ubicacion} animate-in fade-in-0 [animation-delay:400ms] [animation-fill-mode:both]`}>
        <div role="status" className={superficie}>
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          <span>Cargando reportes de esta zona…</span>
        </div>
      </div>
    )
  }

  return (
    <div className={ubicacion}>
      <div role="alert" className={`${superficie} text-destructive`}>
        <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
        <span>No se pudieron cargar los reportes de esta zona.</span>
        <Button type="button" size="sm" variant="ghost" className="h-7 gap-1 px-2" onClick={onReintentar}>
          <RotateCw className="size-3.5" aria-hidden="true" />Reintentar</Button>
      </div>
    </div>
  )
}
