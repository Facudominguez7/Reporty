import { ATRIBUCION_BARRIOS } from "@/lib/territorio/barrios"
import { cn } from "@/lib/utils"

/**
 * Atribución de los límites de barrios que exige la licencia ODbL (#299). Va donde se muestre un
 * barrio.
 *
 * @param className - Clases extra para ubicarla en cada pantalla.
 */
export function AtribucionBarrios({ className }: { className?: string }) {
  return <p className={cn("text-[0.7rem] leading-snug text-muted-foreground", className)}>Límites de barrios: {ATRIBUCION_BARRIOS}</p>
}
