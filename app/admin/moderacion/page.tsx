import Link from "next/link"
import { redirect } from "next/navigation"

import { listarImagenesAdministrativas } from "@/lib/moderation/administracion.server"
import { ColaModeracion } from "@/app/dashboard/moderacion/cola-moderacion"
import { listarRevisionesRechazoReportes } from "@/lib/moderation/report-status-reviews.server"
import { ColaRevisionesReportes } from "./cola-reportes"
import { Card, CardContent } from "@/components/ui/card"

export const dynamic = "force-dynamic"
export const revalidate = 0
export const fetchCache = "force-no-store"
export const metadata = { title: "Revisiones · Administración", robots: { index: false, follow: false } }

type SearchParams = Promise<{ pagina?: string; terminales?: string; tipo?: string }>

function pageNumber(value?: string) {
  const parsed = Number(value ?? 0)
  return Number.isSafeInteger(parsed) ? Math.max(0, Math.min(parsed, 500)) : 0
}

export default async function AdminModeracionPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const pagina = pageNumber(params.pagina)
  const tipo = params.tipo === "reportes" ? "reportes" : "fotos"
  const terminales = tipo === "fotos" && params.terminales === "1"
  let imagenes: Awaited<ReturnType<typeof listarImagenesAdministrativas>> = []
  let reportes: Awaited<ReturnType<typeof listarRevisionesRechazoReportes>> = []

  try {
    if (tipo === "reportes") reportes = await listarRevisionesRechazoReportes(pagina)
    else imagenes = await listarImagenesAdministrativas(pagina, terminales)
  } catch (error) {
    const estado = (error as { estado?: number })?.estado
    if (estado === 401) redirect("/auth")
    if (estado === 403) redirect("/mapa")
    throw new Error(tipo === "reportes"
      ? "No se pudieron consultar las revisiones de reportes. Intentá nuevamente."
      : "No se pudo consultar la cola de moderación. Intentá nuevamente.")
  }

  const query = (nextPage: number, includeTerminales = terminales) => {
    const next = new URLSearchParams()
    if (tipo === "reportes") next.set("tipo", "reportes")
    if (nextPage > 0) next.set("pagina", String(nextPage))
    if (tipo === "fotos" && includeTerminales) next.set("terminales", "1")
    return `/admin/moderacion${next.size ? `?${next}` : ""}`
  }

  const photosHref = terminales ? "/admin/moderacion?terminales=1" : "/admin/moderacion"
  const reportsHref = "/admin/moderacion?tipo=reportes"

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Revisiones</h1>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">Elegí una cola para revisar fotografías o reportes.</p>
      </header>

      <nav aria-label="Tipos de revisión" className="flex w-fit items-center gap-1 rounded-full border p-1">
        <Link href={photosHref} aria-current={tipo === "fotos" ? "page" : undefined} className={`rounded-full px-4 py-2 text-sm font-medium ${tipo === "fotos" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
          Fotos
        </Link>
        <Link href={reportsHref} aria-current={tipo === "reportes" ? "page" : undefined} className={`rounded-full px-4 py-2 text-sm font-medium ${tipo === "reportes" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
          Reportes
        </Link>
      </nav>

      {tipo === "reportes" ? (
        <section aria-labelledby="report-review-heading" className="space-y-4">
          <h2 id="report-review-heading" className="text-xl font-semibold">Revisión de reportes</h2>
          {reportes.length
            ? <ColaRevisionesReportes revisiones={reportes} />
            : <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">No hay reportes pendientes de revisión.</CardContent></Card>}
          <nav aria-label="Páginas de revisiones de reportes" className="flex items-center justify-between gap-4 text-sm">
            {pagina > 0 ? <Link className="font-medium text-primary underline-offset-4 hover:underline" href={query(pagina - 1)}>Anterior</Link> : <span />}
            <span className="text-muted-foreground">Página {pagina + 1}</span>
            {reportes.length === 20 ? <Link className="font-medium text-primary underline-offset-4 hover:underline" href={query(pagina + 1)}>Siguiente</Link> : <span />}
          </nav>
        </section>
      ) : (
        <section aria-labelledby="photo-review-heading" className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <h2 id="photo-review-heading" className="text-xl font-semibold">Revisión de fotografías</h2>
            <Link href={terminales ? "/admin/moderacion" : "/admin/moderacion?terminales=1"} className="text-sm font-medium text-primary underline-offset-4 hover:underline">
              {terminales ? "Ver pendientes" : "Ver auditoría"}
            </Link>
          </div>
          {!imagenes.length ? (
            <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">No hay fotografías en esta vista.</CardContent></Card>
          ) : <ColaModeracion imagenes={imagenes} />}
          <nav aria-label="Páginas de revisiones de fotos" className="flex items-center justify-between gap-4 text-sm">
            {pagina > 0 ? <Link className="font-medium text-primary underline-offset-4 hover:underline" href={query(pagina - 1)}>Anterior</Link> : <span />}
            <span className="text-muted-foreground">Página {pagina + 1}</span>
            {imagenes.length === 20 ? <Link className="font-medium text-primary underline-offset-4 hover:underline" href={query(pagina + 1)}>Siguiente</Link> : <span />}
          </nav>
        </section>
      )}
    </div>
  )
}
