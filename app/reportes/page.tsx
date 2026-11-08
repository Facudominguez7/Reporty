import { AlertTriangle, MapPin } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Card, CardContent } from "@/components/ui/card"
import { ListaReportesClient } from "@/components/lista-reportes-client"
import { EstadoReportes } from "./estado-reportes"
import { ReportesClientWrapper } from "./reportes-client"
import { PageTitleBar } from "@/components/page-title-bar"
import { ReportesSearch } from "@/components/reportes-search"
import {
  getCategorias,
  getEstados,
  getPrioridades,
  getReportCardData,
  getReportStatusCounts,
} from "@/database/queries/reportes/get-reportes"
import type { Metadata } from "next"
import { pageMetadata } from "@/lib/seo/site"
import Link from "next/link"
import { FiltrosMascotas } from "@/components/filtros-mascotas"
import { EstadoMascotas } from "@/components/estado-mascotas"
import { ListaMascotasClient } from "@/components/lista-mascotas-client"
import { getMascotasListado, getMascotasStatusCounts } from "@/database/queries/mascotas/listado"
import { BuscadorMascotas } from "@/components/buscador-mascotas"

export const dynamic = "force-dynamic"

export const metadata: Metadata = pageMetadata({
  title: "Reportes ciudadanos de Posadas",
  description:
    "Baches, luminarias, basurales y otros problemas urbanos que vecinos de Posadas, Misiones, reportaron. Filtrá por categoría, estado y prioridad.",
  path: "/reportes",
})

type ReportesPageProps = {
  searchParams: Promise<{
    search?: string
    categoria?: string
    estado?: string
    prioridad?: string
    vista?: string
    tipo?: string
    estadoMascota?: string
    searchMascota?: string
  }>
}

export default async function ReportesPage({ searchParams }: ReportesPageProps) {
  const params = await searchParams
  const { search, categoria, estado, prioridad, vista, tipo, estadoMascota, searchMascota } = params
  const mascotas = vista === "mascotas"

  // Reports and filter options don't depend on each other, so they load at the same time.
  const [
    { data: reports, error, hasMore },
    { data: pets, hasMore: petsHasMore, error: petsError },
    { data: categorias },
    { data: estados },
    { data: prioridades },
    statusCounts,
    petStatusCounts,
  ] = await Promise.all([
    getReportCardData({
      search,
      categoria,
      estado,
      prioridad,
      limite: 12,
      offset: 0,
    }, { includeAuthors: false }),
    getMascotasListado({ tipo, estado: estadoMascota, search: searchMascota, limite: 12, offset: 0 }),
    getCategorias(),
    getEstados(),
    getPrioridades(),
    getReportStatusCounts({ search, categoria, prioridad }),
    mascotas ? getMascotasStatusCounts({ tipo, search: searchMascota }) : Promise.resolve({ all: 0, lost: 0, found: 0 }),
  ])

  return (
    <div className="page-shell">
      <div className="page-container page-stack">
        {!mascotas && error && (
          <Alert variant="destructive">
            <AlertTriangle className="size-4" />
            <AlertTitle>No se pudieron cargar los reportes</AlertTitle>
            <AlertDescription>Intenta nuevamente en unos minutos.</AlertDescription>
          </Alert>
        )}

        <section className="incident-shell space-y-4 sm:space-y-5">
          <nav aria-label="Tipo de publicaciones" className="card-shadow mx-auto flex w-fit max-w-full rounded-[var(--radius-pill)] bg-input p-1 !text-foreground">
            <Link href={{ pathname: "/reportes", query: { search, categoria, estado, prioridad } }} aria-current={!mascotas ? "page" : undefined} className={`inline-flex min-h-9 items-center justify-center rounded-[var(--radius-pill)] px-4 py-1.5 text-sm font-medium whitespace-nowrap focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${!mascotas ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-background"}`}>Incidentes</Link>
            <Link href={{ pathname: "/reportes", query: { ...params, vista: "mascotas" } }} aria-current={mascotas ? "page" : undefined} className={`inline-flex min-h-9 items-center justify-center rounded-[var(--radius-pill)] px-4 py-1.5 text-sm font-medium whitespace-nowrap focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${mascotas ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-background"}`}>Mascotas</Link>
          </nav>
          {mascotas ? <>
          <PageTitleBar
            icon={<MapPin className="size-4" />}
            title="Mascotas perdidas"
            description="Publicaciones aprobadas de mascotas perdidas y encontradas."
            actions={<FiltrosMascotas />}
          />
          <BuscadorMascotas key={searchMascota ?? ""} />
          <EstadoMascotas search={new URLSearchParams(Object.entries(params).filter((entry): entry is [string, string] => typeof entry[1] === "string")).toString()} counts={petStatusCounts} />
          {petsError ? <Alert variant="destructive"><AlertTriangle className="size-4" /><AlertTitle>No se pudieron cargar las mascotas</AlertTitle><AlertDescription>Intenta nuevamente en unos minutos.</AlertDescription></Alert> : pets.length ? <ListaMascotasClient key={`${tipo ?? ""}:${estadoMascota ?? ""}:${searchMascota ?? ""}`} initialPets={pets} initialHasMore={petsHasMore} /> : <Card className="border-dashed"><CardContent className="space-y-2 p-4 text-center"><p className="text-lg font-semibold tracking-tight">No hay mascotas publicadas con esos criterios.</p><p className="text-sm text-muted-foreground">Probá cambiar los filtros.</p></CardContent></Card>}
          </> : <>
          <PageTitleBar
            icon={<MapPin className="size-4" />}
            title="Incidentes reportados"
            description="Consultá los problemas informados en la ciudad."
            actions={
              <ReportesClientWrapper
                categorias={categorias ?? []}
                estados={estados ?? []}
                prioridades={prioridades ?? []}
              />
            }
          />
          <ReportesSearch key={params.search ?? ""} />
          <EstadoReportes searchParams={params} counts={statusCounts} />

          {reports.length > 0 ? (
            <ListaReportesClient initialReports={reports} initialHasMore={hasMore ?? false} variant="compact" />
          ) : !error ? (
            <Card className="border-dashed">
              <CardContent className="space-y-2 p-4 text-center">
                <p className="text-lg font-semibold tracking-tight">No hay reportes publicados con esos criterios.</p>
                <p className="mx-auto max-w-xl text-sm leading-6 text-muted-foreground">
                  Ajustá los filtros para volver a ver incidentes en el listado.
                </p>
              </CardContent>
            </Card>
          ) : null}
          </>}
        </section>
      </div>
    </div>
  )
}
