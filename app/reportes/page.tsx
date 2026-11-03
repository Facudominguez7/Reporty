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
  }>
}

export default async function ReportesPage({ searchParams }: ReportesPageProps) {
  const params = await searchParams
  const { search, categoria, estado, prioridad } = params

  // Reports and filter options don't depend on each other, so they load at the same time.
  const [
    { data: reports, error, hasMore },
    { data: categorias },
    { data: estados },
    { data: prioridades },
    statusCounts,
  ] = await Promise.all([
    getReportCardData({
      search,
      categoria,
      estado,
      prioridad,
      limite: 12,
      offset: 0,
    }, { includeAuthors: false }),
    getCategorias(),
    getEstados(),
    getPrioridades(),
    getReportStatusCounts({ search, categoria, prioridad }),
  ])

  return (
    <div className="page-shell">
      <div className="page-container page-stack">
        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="size-4" />
            <AlertTitle>No se pudieron cargar los reportes</AlertTitle>
            <AlertDescription>Intenta nuevamente en unos minutos.</AlertDescription>
          </Alert>
        )}

        <section className="incident-shell space-y-4 sm:space-y-5">
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
        </section>
      </div>
    </div>
  )
}
