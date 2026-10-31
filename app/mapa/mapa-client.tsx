"use client"

import { useCallback, useRef, useState, useTransition } from "react"
import { preconnect } from "react-dom"
import dynamic from "next/dynamic"
import Link from "next/link"
import { AlertCircle, FilePlus2, List, Plus, Search, SlidersHorizontal, X } from "lucide-react"
import { useSearchParams, useServerInsertedHTML } from "next/navigation"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button, buttonVariants } from "@/components/ui/button"
import { Drawer, DrawerContent, DrawerTrigger } from "@/components/ui/drawer"
import { ContactsDialog } from "@/components/contacts-dialog"
import { FiltrosReportes } from "@/components/filtros-reportes"
import { HowToUseDialog } from "@/components/how-to-use-dialog"
import { MapLoadingSkeleton } from "@/components/loading-skeletons"
import { OnboardingModal } from "@/components/onboarding-modal"
import type { ReportMapItem } from "@/database/queries/reportes/get-reportes"
import { getInitialMapTilePreloadScript } from "@/lib/map/initial-view"

const loadMapContainer = () => import("@/components/map-container").then((m) => m.MapContainer)

// next/dynamic with ssr: false only requests the chunk once hydration renders it.
// Starting the download when this module runs in the browser overlaps it with hydration.
if (typeof window !== "undefined") {
  void loadMapContainer()
}

const MapContainer = dynamic(loadMapContainer, {
  ssr: false,
  loading: () => <MapLoadingSkeleton />,
})

// Matches `min-h-[32rem]` on the map wrapper below.
const MAP_MIN_HEIGHT_PX = 512

type MapaClientProps = {
  reportes: ReportMapItem[]
  categorias: { id: number; nombre: string }[]
  estados: { id: number; nombre: string }[]
  prioridades: { id: number; nombre: string }[]
  error: string | null
}

export function MapaClient({ reportes, categorias, estados, prioridades, error }: MapaClientProps) {
  // The map tiles are the largest paint of this page. Rendering this hint during SSR
  // puts it in the document head, so the tile connection opens while the map code downloads.
  preconnect("https://tile.openstreetmap.org")

  // The tile itself still waits for Leaflet. This script, sent only in the server HTML,
  // computes the first map view for the viewport and preloads its center tile meanwhile.
  const tilePreloadInsertedRef = useRef(false)
  useServerInsertedHTML(() => {
    if (error || tilePreloadInsertedRef.current) return null
    tilePreloadInsertedRef.current = true
    const script = getInitialMapTilePreloadScript(null, MAP_MIN_HEIGHT_PX)
    return <script dangerouslySetInnerHTML={{ __html: script }} />
  })

  const searchParams = useSearchParams()
  const [showFilters, setShowFilters] = useState(false)
  const [showActions, setShowActions] = useState(false)
  const [isPending, startTransition] = useTransition()

  const activeFilters = [
    searchParams.get("search"),
    searchParams.get("categoria"),
    searchParams.get("estado"),
    searchParams.get("prioridad"),
  ].filter(Boolean).length

  const activeFiltersLabel = `${activeFilters} filtro${activeFilters === 1 ? "" : "s"} activo${activeFilters === 1 ? "" : "s"}`

  const handleFilterApplied = useCallback(() => {
    setShowFilters(false)
  }, [])

  const handleDrawerOpenChange = useCallback((open: boolean) => {
    setShowFilters(open)
  }, [])

  const mapActionLinkClassName = buttonVariants({ size: "lg", variant: "floating" })

  return (
    <Drawer open={showFilters} onOpenChange={handleDrawerOpenChange}>
      <div className="relative h-[100dvh] min-h-[32rem] overflow-hidden bg-background">
      <OnboardingModal />
      <div className="fixed inset-x-0 top-0 z-40 flex min-h-[4.75rem] items-center justify-end px-2 pt-[env(safe-area-inset-top)] sm:px-6">
        <div className="flex items-center gap-1 sm:gap-2">
          <ContactsDialog />
          <HowToUseDialog />
        </div>
      </div>
      <div className="absolute inset-0 z-0">
        {error ? (
          <div className="flex h-full items-center justify-center p-5">
            <Alert variant="destructive" className="max-w-lg shadow-xl">
              <AlertCircle className="size-4" aria-hidden="true" />
              <AlertTitle>Error al cargar el mapa</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </div>
        ) : (
          <MapContainer reports={reportes} showLegend />
        )}
      </div>

      <div className="pointer-events-none absolute left-3 top-3 z-30 pt-[max(env(safe-area-inset-top),0rem)] sm:left-5 sm:top-5">
        <div className="flex items-start gap-2">
            <DrawerTrigger asChild>
              <Button
                type="button"
                variant="floating"
                size="icon-lg"
                className="pointer-events-auto"
                aria-label={showFilters ? "Cerrar filtros" : "Abrir filtros"}
                aria-expanded={showFilters}
              >
                {showFilters ? <X className="size-5" aria-hidden="true" /> : <SlidersHorizontal className="size-5" aria-hidden="true" />}
              </Button>
            </DrawerTrigger>
          {activeFilters > 0 && !showFilters && (
            <DrawerTrigger asChild>
              <Button
                type="button"
                variant="floating"
                size="sm"
                className="pointer-events-auto mt-1 max-w-[11rem] text-left"
                aria-label={`Abrir filtros, ${activeFiltersLabel}`}
              >
                <Search className="size-3.5" aria-hidden="true" />
                <span className="truncate">{activeFiltersLabel}</span>
              </Button>
            </DrawerTrigger>
          )}
        </div>
      </div>

        <DrawerContent className="max-h-[85dvh] bg-card md:inset-x-[15%]">
          <div className="flex-1 min-h-0 overflow-y-auto">
            <FiltrosReportes
              categorias={categorias}
              estados={estados}
              prioridades={prioridades}
              onFilterApplied={handleFilterApplied}
              externalIsPending={isPending}
              externalStartTransition={startTransition}
              variant="sheet"
              onApply={() => setShowFilters(false)}
            />
          </div>
        </DrawerContent>

      {isPending && (
        <div className="absolute left-1/2 top-32 z-40 -translate-x-1/2 rounded-full border border-border bg-card/95 px-4 py-2 text-sm font-semibold text-foreground shadow-lg backdrop-blur">
          Aplicando filtros...
        </div>
      )}

      <div className="absolute bottom-[calc(5.75rem+env(safe-area-inset-bottom))] right-4 z-30 flex flex-col items-end gap-3 sm:right-6">
        {showActions && (
          <div className="flex flex-col items-end gap-2">
            <Link href="/reportes/nuevo" className={mapActionLinkClassName}>
              <FilePlus2 className="size-4" aria-hidden="true" />
              Crear reporte
            </Link>
            <Link href="/reportes" className={mapActionLinkClassName}>
              <List className="size-4" aria-hidden="true" />
              Ver reportes
            </Link>
          </div>
        )}
        <Button
          type="button"
          variant="floating-primary"
          size="icon-xl"
          onClick={() => setShowActions((prev) => !prev)}
          aria-label={showActions ? "Cerrar acciones de reportes" : "Abrir acciones de reportes"}
          aria-expanded={showActions}
        >
          {showActions ? <X className="size-6" aria-hidden="true" /> : <Plus className="size-6" aria-hidden="true" />}
        </Button>
      </div>
      </div>
    </Drawer>
  )
}
