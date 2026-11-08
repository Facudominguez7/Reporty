"use client"

/**
 * Hoja inferior del detalle del reporte (S13, S18).
 *
 * Es el mismo `Drawer` de Vaul que usa el filtro del mapa, con el alto máximo y el
 * recorte de escritorio que pide el diseño. La hoja sólo aporta el marco: el título,
 * la descripción y el contenido los decide cada acción de la ficha.
 */

import type { ReactNode } from "react"
import { X } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "@/components/ui/drawer"

export type HojaReporteProps = {
  abierta: boolean
  cambiandoAbierta: (abierta: boolean) => void
  titulo: string
  descripcion: string
  /** Nombre accesible del cierre propio; el Drawer ya cierra con Escape y con el velo. */
  etiquetaCerrar: string
  /**
   * Elemento que abrió la hoja. Al cerrarla recupera el foco, porque el menú flotante
   * que pudo originarla ya no existe cuando el Drawer termina de cerrarse.
   */
  disparador?: HTMLElement | null
  children?: ReactNode
  /** Acción principal fija al pie de la hoja. */
  pie?: ReactNode
}

/**
 * Maneja el foco al cerrar la hoja: si el disparador que la abrió sigue en el
 * documento, recupera el foco y cancela la restauración automática de Vaul; si ya no
 * existe, no fuerza el foco a un elemento desconectado y deja decidir al Drawer.
 */
export function crearManejadorFocoAlCerrar(disparador?: HTMLElement | null) {
  return (evento: Event) => {
    if (!disparador || !disparador.isConnected) return
    evento.preventDefault()
    disparador.focus()
  }
}

/**
 * Hoja inferior reutilizable: cabecera con título y cierre, cuerpo desplazable y pie
 * opcional. Nunca define un título vacío, así el diálogo siempre tiene nombre accesible.
 */
export function HojaReporte({
  abierta,
  cambiandoAbierta,
  titulo,
  descripcion,
  etiquetaCerrar,
  disparador,
  children,
  pie,
}: HojaReporteProps) {
  return (
    <Drawer open={abierta} onOpenChange={cambiandoAbierta}>
      <DrawerContent
        className="max-h-[85dvh] bg-card md:inset-x-[15%] md:max-h-[92dvh]"
        onCloseAutoFocus={crearManejadorFocoAlCerrar(disparador)}
      >
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-start gap-3 border-b border-border px-3 pb-3">
            <div className="min-w-0 flex-1">
              <DrawerTitle className="text-sm font-semibold tracking-tight md:text-base">{titulo}</DrawerTitle>
              <DrawerDescription className="mt-0.5 text-xs text-muted-foreground md:text-sm">{descripcion}</DrawerDescription>
            </div>
            <DrawerClose asChild>
              <Button type="button" variant="secondary" size="icon-sm" aria-label={etiquetaCerrar}>
                <X className="size-4" aria-hidden="true" />
              </Button>
            </DrawerClose>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">{children}</div>
          {pie && (
            <div className="border-t border-border px-3 pb-[max(env(safe-area-inset-bottom),1rem)] pt-3">{pie}</div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  )
}
