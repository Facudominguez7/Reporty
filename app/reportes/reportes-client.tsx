"use client"

import { useCallback, useState, useTransition } from "react"
import { SlidersHorizontal, X } from "lucide-react"
import { useSearchParams } from "next/navigation"

import { FiltrosReportes } from "@/components/filtros-reportes"
import { Button } from "@/components/ui/button"
import { Drawer, DrawerContent, DrawerTrigger } from "@/components/ui/drawer"

type ReportesClientWrapperProps = {
  categorias: { id: number; nombre: string }[]
  estados: { id: number; nombre: string }[]
  prioridades: { id: number; nombre: string }[]
}

/**
 * Componente cliente que muestra la interfaz de filtros para reportes y el estado de carga durante una transición pendiente.
 *
 * @param categorias - Array de categorías, cada elemento con `id` (número) y `nombre` (cadena).
 * @param estados - Array de estados, cada elemento con `id` (número) y `nombre` (cadena).
 * @param prioridades - Array de prioridades, cada elemento con `id` (número) y `nombre` (cadena).
 * @returns Elemento JSX que renderiza el componente de filtros y muestra el estado de carga durante la transición.
 */
export function ReportesClientWrapper({ categorias, estados, prioridades }: ReportesClientWrapperProps) {
  const searchParams = useSearchParams()
  const [showFilters, setShowFilters] = useState(false)
  const [isPending, startTransition] = useTransition()

  const activeFilters = [
    searchParams.get("search"),
    searchParams.get("categoria"),
    searchParams.get("estado"),
    searchParams.get("prioridad"),
  ].filter(Boolean).length

  const activeFiltersLabel = activeFilters > 0 ? `Filtros (${activeFilters})` : "Filtros"

  const handleDrawerOpenChange = useCallback((open: boolean) => {
    setShowFilters(open)

  }, [])

  return (
    <>
      <Drawer open={showFilters} onOpenChange={handleDrawerOpenChange}>
        <DrawerTrigger asChild>
          <Button
            type="button"
            variant="secondary"
            size="xs"
            aria-label={showFilters ? "Cerrar filtros" : `Abrir filtros${activeFilters > 0 ? `, ${activeFilters} activos` : ""}`}
            aria-expanded={showFilters}
          >
            {showFilters ? <X className="size-4" aria-hidden="true" /> : <SlidersHorizontal className="size-4" aria-hidden="true" />}
            <span>{showFilters ? "Cerrar" : activeFiltersLabel}</span>
          </Button>
        </DrawerTrigger>
        <DrawerContent className="max-h-[85dvh] bg-card md:inset-x-[15%]">
          <div className="flex-1 min-h-0 overflow-y-auto">
            <FiltrosReportes
              categorias={categorias}
              estados={estados}
              prioridades={prioridades}
              externalIsPending={isPending}
              externalStartTransition={startTransition}
              variant="sheet"
              onApply={() => setShowFilters(false)}
            />
          </div>
        </DrawerContent>
      </Drawer>
    </>
  )
}
