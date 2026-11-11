"use client"

import { useCallback, useEffect, useRef, useState, useTransition } from "react"
import { preconnect } from "react-dom"
import dynamic from "next/dynamic"
import Link from "next/link"
import { AlertCircle, CircleHelp, CircleX, FilePlus2, HeartHandshake, List, Plus, Search, SlidersHorizontal, X, PawPrint } from "lucide-react"
import { useSearchParams, useServerInsertedHTML } from "next/navigation"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button, buttonVariants } from "@/components/ui/button"
import { Drawer, DrawerContent, DrawerTrigger } from "@/components/ui/drawer"
import { ContactsDialog } from "@/components/contacts-dialog"
import { FiltrosReportes } from "@/components/filtros-reportes"
import { FiltrosMascotasMapa } from "@/components/filtros-mascotas-mapa"
import { filtrarMascotasMapa } from "./filtros-mascotas-mapa"
import { HowToUseDialog } from "@/components/how-to-use-dialog"
import { MapLoadingSkeleton } from "@/components/loading-skeletons"
import { MascotasOnboardingModal, OnboardingModal } from "@/components/onboarding-modal"
import type { ReportMapItem } from "@/database/queries/reportes/get-reportes"
import type { MascotaMapa } from "@/database/queries/mascotas/mapa"
import { getInitialMapTilePreloadScript, MAP_TILE_ORIGIN } from "@/lib/map/initial-view"

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
  petError: string | null
  mascotas: MascotaMapa[]
}

const MASCOTAS_ONBOARDING_STORAGE_KEY = "reporty_mascotas_onboarding_completed"

export const MAP_LAYER_OPTIONS = [["reportes", "Incidentes"], ["mascotas", "Mascotas"]] as const

export function shouldShowMascotasOnboarding(layer: "reportes" | "mascotas", completed: boolean) {
  return layer === "mascotas" && !completed
}

/**
 * Botón «Donar» del mapa: un círculo verde con el corazón, del mismo tamaño que los botones
 * de contactos y ayuda, junto a ellos en la fila de arriba.
 */
export function BotonDonarMapa() {
  return (
    <Link
      href="/donar"
      aria-label="Donar a Reporty"
      title="Donar a Reporty"
      className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <HeartHandshake className="size-4.5" aria-hidden="true" />
    </Link>
  )
}

const MAP_ACTIONS_HIDE_DELAY = 4200

function MapHeaderActions({ layer }: { layer: "reportes" | "mascotas" }) {
  const [expanded, setExpanded] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current)
  }, [])

  const toggleActions = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (expanded) {
      setExpanded(false)
      return
    }
    setExpanded(true)
    timerRef.current = setTimeout(() => setExpanded(false), MAP_ACTIONS_HIDE_DELAY)
  }

  return (
    <div className="relative flex min-w-9 items-center justify-end sm:hidden">
      <div
        className={`absolute right-0 top-[calc(100%+0.5rem)] flex origin-top-right flex-col items-end gap-2 transition-all duration-300 ease-out ${expanded ? "translate-y-0 scale-100 opacity-100" : "pointer-events-none -translate-y-2 scale-90 opacity-0"}`}
        aria-hidden={!expanded}
        inert={!expanded}
      >
        <BotonDonarMapa />
        <ContactsDialog />
        <HowToUseDialog layer={layer} />
      </div>
      <Button
        type="button"
        variant="liquid-glass"
        size="icon-sm"
        className="relative transition-transform duration-300"
        aria-label={expanded ? "Cerrar acciones del mapa" : "Mostrar acciones del mapa"}
        aria-expanded={expanded}
        onClick={toggleActions}
      >
        {expanded ? <CircleX className="size-4" aria-hidden="true" /> : <CircleHelp className="size-4" aria-hidden="true" />}
      </Button>
    </div>
  )
}

export function PetLayerError({ error }: { error: string | null }) {
  if (!error) return null
  return <div role="alert" className="absolute left-1/2 top-20 z-30 w-[min(92vw,32rem)] -translate-x-1/2 rounded-lg border border-destructive/30 bg-card/95 p-3 text-sm text-destructive shadow-lg">No se pudieron cargar las mascotas: {error}</div>
}

export function MapaClient({ reportes, mascotas, categorias, estados, prioridades, error, petError }: MapaClientProps) {
  // The map tiles are the largest paint of this page. Rendering this hint during SSR
  // puts it in the document head, so the tile connection opens while the map code downloads.
  preconnect(MAP_TILE_ORIGIN)

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
  const [layer, setLayer] = useState<"reportes" | "mascotas">("reportes")
  const [showPetOnboarding, setShowPetOnboarding] = useState(false)
  const [isPending, startTransition] = useTransition()

  const activeFilters = layer === "mascotas"
    ? [searchParams.get("searchMascota"), searchParams.get("tipoMascota"), searchParams.get("estadoMascota")].filter(Boolean).length
    : [searchParams.get("search"), searchParams.get("categoria"), searchParams.get("estado"), searchParams.get("prioridad")].filter(Boolean).length
  const mascotasFiltradas = filtrarMascotasMapa(mascotas, {
    tipo: searchParams.get("tipoMascota") ?? "all",
    estado: searchParams.get("estadoMascota") ?? "all",
    search: searchParams.get("searchMascota") ?? "",
  })

  const activeFiltersLabel = `${activeFilters} filtro${activeFilters === 1 ? "" : "s"} activo${activeFilters === 1 ? "" : "s"}`

  const handleLayerChange = (nextLayer: "reportes" | "mascotas") => {
    setLayer(nextLayer)
    if (shouldShowMascotasOnboarding(nextLayer, Boolean(window.localStorage.getItem(MASCOTAS_ONBOARDING_STORAGE_KEY)))) {
      setShowPetOnboarding(true)
    }
  }

  const handlePetOnboardingComplete = () => {
    window.localStorage.setItem(MASCOTAS_ONBOARDING_STORAGE_KEY, "true")
    setShowPetOnboarding(false)
  }

  const handleFilterApplied = useCallback(() => {
    setShowFilters(false)
  }, [])

  const handleDrawerOpenChange = useCallback((open: boolean) => {
    setShowFilters(open)
  }, [])

  const mapActionLinkClassName = buttonVariants({ size: "sm", variant: "floating" })

  return (
    <Drawer open={showFilters} onOpenChange={handleDrawerOpenChange}>
      <div className="relative h-[100dvh] min-h-[32rem] overflow-hidden bg-background">
      <OnboardingModal />
      <MascotasOnboardingModal open={showPetOnboarding} onComplete={handlePetOnboardingComplete} />
      <div className="pointer-events-none fixed inset-x-0 top-0 z-40 flex min-h-[4.75rem] items-center justify-end px-2 pt-[env(safe-area-inset-top)] sm:px-6">
        <div className="pointer-events-auto hidden items-center gap-1 sm:flex sm:gap-2">
          <BotonDonarMapa />
          <ContactsDialog />
          <HowToUseDialog layer={layer} />
        </div>
        <div className="pointer-events-auto sm:hidden">
          <MapHeaderActions layer={layer} />
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
          <MapContainer reports={reportes} mascotas={mascotasFiltradas} layer={layer} showLegend />
        )}
      </div>

      {layer === "mascotas" && !error && <PetLayerError error={petError} />}

      {/* En mobile queda centrado entre filtros y ayuda; en desktop vuelve al centro del mapa. */}
      <div className="pointer-events-none absolute left-1/2 top-3 z-30 -translate-x-1/2 pt-[max(env(safe-area-inset-top),0rem)] sm:left-[calc(50%-6.5rem)] lg:left-1/2">
        <div className="pointer-events-auto flex rounded-full border border-white/70 bg-white/45 p-1 shadow-[0_8px_24px_rgb(15_23_42_/_0.16)] backdrop-blur-xl backdrop-saturate-150" role="group" aria-label="Capa del mapa">
          {MAP_LAYER_OPTIONS.map(([value, label]) => <Button key={value} type="button" size="sm" className="px-2.5 sm:px-3.5" variant={layer === value ? "default" : "ghost"} aria-pressed={layer === value} onClick={() => handleLayerChange(value)}>{label}</Button>)}
        </div>
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
            {layer === "mascotas" ? <FiltrosMascotasMapa onApply={() => setShowFilters(false)} /> : <FiltrosReportes
              categorias={categorias}
              estados={estados}
              prioridades={prioridades}
              onFilterApplied={handleFilterApplied}
              externalIsPending={isPending}
              externalStartTransition={startTransition}
              variant="sheet"
              onApply={() => setShowFilters(false)}
            />}
          </div>
        </DrawerContent>

      {isPending && (
        <div className="absolute left-1/2 top-32 z-40 -translate-x-1/2 rounded-full border border-border bg-card/95 px-4 py-2 text-sm font-semibold text-foreground shadow-lg backdrop-blur">
          Aplicando filtros...
        </div>
      )}

      {/* Reporty no tiene footer: el enlace a los términos queda visible sobre la navegación inferior. */}
      <Link
        href="/terminos"
        className="absolute bottom-[calc(var(--bottom-nav-space)+0.25rem)] left-3 z-10 rounded-full bg-card/85 px-2 py-0.5 text-[0.7rem] font-medium text-muted-foreground shadow-sm backdrop-blur underline-offset-4 hover:text-foreground hover:underline sm:left-5"
      >
        Términos y condiciones
      </Link>

      <div className="absolute bottom-[calc(5.75rem+env(safe-area-inset-bottom))] right-4 z-30 flex flex-col items-end gap-2 sm:right-6">
        {showActions && (
          <div className="flex flex-col items-end gap-1.5">
            <Link href="/reportes/nuevo" className={mapActionLinkClassName}>
              <FilePlus2 className="size-4" aria-hidden="true" />
              Crear reporte
            </Link>
            <Link href="/mascotas/nueva" className={mapActionLinkClassName}>
              <PawPrint className="size-4" aria-hidden="true" />
              Cargar mascota perdida
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
          aria-label={showActions ? "Cerrar acciones" : "Abrir acciones"}
          aria-expanded={showActions}
        >
          {showActions ? <X className="size-6" aria-hidden="true" /> : <Plus className="size-6" aria-hidden="true" />}
        </Button>
      </div>
      </div>
    </Drawer>
  )
}
