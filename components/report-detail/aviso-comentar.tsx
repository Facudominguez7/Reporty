"use client"

/**
 * Aviso de la ficha del reporte: la primera vez que la acción de reparación está
 * disponible, explica el botón check flotante. La vista se recuerda en el navegador.
 */

import { useCallback, useState, useSyncExternalStore } from "react"
import { Check } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { ClaveAccionFlotante } from "./acciones-flotantes"

/** Clave del navegador que recuerda que la persona ya vio el aviso. */
export const CLAVE_AVISO_COMENTAR = "reporty_aviso_comentar_visto"

/**
 * Decide si corresponde mostrar el aviso.
 *
 * @param acciones - Acciones flotantes disponibles para esta persona y este reporte.
 * @param yaVisto - Si el navegador ya recuerda el aviso.
 * @returns `true` sólo cuando está disponible la reparación y el aviso no se vio antes.
 */
export function debeMostrarAvisoComentar(acciones: ClaveAccionFlotante[], yaVisto: boolean): boolean {
  return acciones.includes("reparacion") && !yaVisto
}

/** Lee la marca del navegador sin romper la ficha si el almacenamiento está bloqueado. */
function avisoYaVisto(): boolean {
  try {
    return window.localStorage.getItem(CLAVE_AVISO_COMENTAR) !== null
  } catch {
    return true
  }
}

/** Guarda la marca del navegador; si falla, el aviso sólo vuelve en la próxima visita. */
function marcarAvisoVisto(): void {
  try {
    window.localStorage.setItem(CLAVE_AVISO_COMENTAR, "true")
  } catch {
    // Almacenamiento bloqueado (modo privado): no hay nada más que hacer.
  }
}

/** El aviso no escucha cambios externos: la marca sólo cambia desde esta misma ficha. */
function suscribirseSinCambios(): () => void {
  return () => {}
}

/**
 * Estado del aviso para la ficha. En el servidor (y en la hidratación) cuenta como
 * visto, así nunca aparece antes de saber qué recuerda el navegador.
 *
 * @param puedeInformarReparacion - Si el control flotante ofrece la acción de reparación.
 * @returns Si se muestra y la función que lo descarta para siempre.
 */
export function useAvisoComentar(puedeInformarReparacion: boolean) {
  const yaVisto = useSyncExternalStore(suscribirseSinCambios, avisoYaVisto, () => true)
  const [descartado, setDescartado] = useState(false)

  const descartar = useCallback(() => {
    marcarAvisoVisto()
    setDescartado(true)
  }, [])

  const visible = debeMostrarAvisoComentar(puedeInformarReparacion ? ["reparacion"] : [], yaVisto || descartado)
  return { visible, descartar }
}

/**
 * Globo del aviso. Se pinta sobre el botón flotante, con una flecha que lo señala.
 *
 * @param onCerrar - Descarta el aviso para siempre.
 */
export function AvisoComentar({ onCerrar }: { onCerrar: () => void }) {
  return (
    <aside
      aria-label="Cómo informar una reparación"
      className="pointer-events-auto relative mr-1 w-[min(17rem,calc(100vw-2rem))] rounded-2xl border border-border/70 bg-card p-3 text-card-foreground shadow-[var(--elevation-soft)] motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2"
    >
      <p className="text-sm font-semibold">¿Ya lo arreglaron?</p>
      <p className="mt-1 text-sm leading-5 text-muted-foreground">
        Tocá el botón <Check aria-hidden="true" className="inline size-3.5 align-[-2px]" /> para informar una reparación o consultar su evidencia.
      </p>
      <div className="mt-2 flex justify-end">
        <Button type="button" size="sm" onClick={onCerrar}>
          Entendido
        </Button>
      </div>
      <span
        aria-hidden="true"
        className="absolute -bottom-1.5 right-5 size-3 rotate-45 border-b border-r border-border/70 bg-card"
      />
    </aside>
  )
}
