import Link from "next/link"
import { redirect } from "next/navigation"

import { listarImagenesAdministrativas } from "@/lib/moderation/administracion.server"
import { ColaModeracion } from "@/app/dashboard/moderacion/cola-moderacion"
import { listarRevisionesRechazoReportes } from "@/lib/moderation/report-status-reviews.server"
import {
  TAMANO_PAGINA_REPARACIONES,
  listarEvidenciasEnVerificacion,
  listarEvidenciasValidadas,
} from "@/lib/moderation/evidencia-reparacion-admin.server"
import { UMBRAL_CONFIRMACIONES_REPARACION } from "@/lib/use-cases/reportes/evidencia-reparacion"
import { ColaRevisionesReportes } from "./cola-reportes"
import { ColaEvidenciasEnVerificacion, ColaEvidenciasValidadas } from "./cola-reparaciones"
import { Card, CardContent } from "@/components/ui/card"

export const dynamic = "force-dynamic"
export const revalidate = 0
export const fetchCache = "force-no-store"
export const metadata = { title: "Revisiones · Administración", robots: { index: false, follow: false } }

type SearchParams = Promise<{ pagina?: string; terminales?: string; tipo?: string; vista?: string }>

/** Colas administrativas; las reparaciones se suman sin cambiar las dos anteriores. */
type TipoCola = "fotos" | "reportes" | "reparaciones"

/** Sub-vistas de la cola de reparaciones, separadas por tipo de decisión. */
type VistaReparaciones = "evidencias" | "validadas"

const TAMANO_PAGINA_ANTERIOR = 20

function pageNumber(value?: string) {
  const parsed = Number(value ?? 0)
  return Number.isSafeInteger(parsed) ? Math.max(0, Math.min(parsed, 500)) : 0
}

/** Cola activa pedida por la URL; cualquier valor desconocido cae en fotos. */
function tipoDeCola(valor?: string): TipoCola {
  if (valor === "reportes") return "reportes"
  if (valor === "reparaciones") return "reparaciones"
  return "fotos"
}

/** Sub-vista de reparaciones; por defecto, las evidencias en verificación. */
function vistaDeReparaciones(valor?: string): VistaReparaciones {
  if (valor === "validadas") return "validadas"
  return "evidencias"
}

/** Texto de error de cada cola, sin filtrar detalles de la base. */
function mensajeDeFalla(tipo: TipoCola) {
  if (tipo === "reportes") return "No se pudieron consultar las revisiones de reportes. Intentá nuevamente."
  if (tipo === "reparaciones") return "No se pudo consultar la cola de reparaciones. Intentá nuevamente."
  return "No se pudo consultar la cola de moderación. Intentá nuevamente."
}

export default async function AdminModeracionPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const pagina = pageNumber(params.pagina)
  const tipo = tipoDeCola(params.tipo)
  const vista = vistaDeReparaciones(params.vista)
  const terminales = tipo === "fotos" && params.terminales === "1"
  let imagenes: Awaited<ReturnType<typeof listarImagenesAdministrativas>> = []
  let reportes: Awaited<ReturnType<typeof listarRevisionesRechazoReportes>> = []
  let evidencias: Awaited<ReturnType<typeof listarEvidenciasEnVerificacion>> = []
  let validadas: Awaited<ReturnType<typeof listarEvidenciasValidadas>> = []

  try {
    if (tipo === "reparaciones") {
      if (vista === "evidencias") evidencias = await listarEvidenciasEnVerificacion(pagina)
      else validadas = await listarEvidenciasValidadas(pagina)
    } else if (tipo === "reportes") reportes = await listarRevisionesRechazoReportes(pagina)
    else imagenes = await listarImagenesAdministrativas(pagina, terminales)
  } catch (error) {
    const estado = (error as { estado?: number })?.estado
    if (estado === 401) redirect("/auth")
    if (estado === 403) redirect("/mapa")
    throw new Error(mensajeDeFalla(tipo))
  }

  const query = (nextPage: number, includeTerminales = terminales) => {
    const next = new URLSearchParams()
    if (tipo === "reportes") next.set("tipo", "reportes")
    if (tipo === "reparaciones") {
      next.set("tipo", "reparaciones")
      if (vista !== "evidencias") next.set("vista", vista)
    }
    if (nextPage > 0) next.set("pagina", String(nextPage))
    if (tipo === "fotos" && includeTerminales) next.set("terminales", "1")
    return `/admin/moderacion${next.size ? `?${next}` : ""}`
  }

  const photosHref = terminales ? "/admin/moderacion?terminales=1" : "/admin/moderacion"
  const reportsHref = "/admin/moderacion?tipo=reportes"
  const repairsHref = "/admin/moderacion?tipo=reparaciones"
  const repairViewHref = (valor: VistaReparaciones) =>
    valor === "evidencias" ? repairsHref : `/admin/moderacion?tipo=reparaciones&vista=${valor}`
  const reparacionesVisibles = vista === "evidencias" ? evidencias.length : validadas.length

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Revisiones</h1>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">Elegí una cola para revisar fotografías, reportes o reparaciones.</p>
      </header>

      <nav aria-label="Tipos de revisión" className="flex w-fit items-center gap-1 rounded-full border p-1">
        <Link href={photosHref} aria-current={tipo === "fotos" ? "page" : undefined} className={`rounded-full px-4 py-2 text-sm font-medium ${tipo === "fotos" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
          Fotos
        </Link>
        <Link href={reportsHref} aria-current={tipo === "reportes" ? "page" : undefined} className={`rounded-full px-4 py-2 text-sm font-medium ${tipo === "reportes" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
          Reportes
        </Link>
        <Link href={repairsHref} aria-current={tipo === "reparaciones" ? "page" : undefined} className={`rounded-full px-4 py-2 text-sm font-medium ${tipo === "reparaciones" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
          Reparaciones
        </Link>
      </nav>

      {tipo === "reparaciones" ? (
        <section aria-labelledby="repair-review-heading" className="space-y-4">
          <nav aria-label="Vistas de reparaciones" className="flex flex-wrap items-center gap-2">
            {([
              ["evidencias", "En verificación"],
              ["validadas", "Validadas"],
            ] as const).map(([valor, etiqueta]) => (
              <Link key={valor} href={repairViewHref(valor)} aria-current={vista === valor ? "page" : undefined} className={`rounded-full border px-3 py-1.5 text-sm font-medium ${vista === valor ? "border-primary bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
                {etiqueta}
              </Link>
            ))}
          </nav>

          <h2 id="repair-review-heading" className="text-xl font-semibold">
            {vista === "evidencias" ? "Evidencias en verificación" : "Reparaciones validadas"}
          </h2>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            {vista === "evidencias"
              ? "Aprobá o rechazá la reparación informada. Aprobar exige la foto publicada y cierra el reporte como Reparado; rechazar lo deja pendiente y conserva sus fotos originales."
              : "Revertí una reparación validada si la evidencia no corresponde. El reporte vuelve a Pendiente y se descuentan los cinco puntos del autor."}
          </p>

          {vista === "evidencias" ? (
            evidencias.length
              ? <ColaEvidenciasEnVerificacion evidencias={evidencias} umbral={UMBRAL_CONFIRMACIONES_REPARACION} />
              : <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">No hay evidencias en verificación.</CardContent></Card>
          ) : vista === "validadas" ? (
            validadas.length
              ? <ColaEvidenciasValidadas validadas={validadas} umbral={UMBRAL_CONFIRMACIONES_REPARACION} />
              : <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">No hay reparaciones validadas para revertir.</CardContent></Card>
          ) : null}

          <nav aria-label="Páginas de la cola de reparaciones" className="flex items-center justify-between gap-4 text-sm">
            {pagina > 0 ? <Link className="font-medium text-primary underline-offset-4 hover:underline" href={query(pagina - 1)}>Anterior</Link> : <span />}
            <span className="text-muted-foreground">Página {pagina + 1}</span>
            {reparacionesVisibles === TAMANO_PAGINA_REPARACIONES ? <Link className="font-medium text-primary underline-offset-4 hover:underline" href={query(pagina + 1)}>Siguiente</Link> : <span />}
          </nav>
        </section>
      ) : tipo === "reportes" ? (
        <section aria-labelledby="report-review-heading" className="space-y-4">
          <h2 id="report-review-heading" className="text-xl font-semibold">Revisión de reportes</h2>
          {reportes.length
            ? <ColaRevisionesReportes revisiones={reportes} />
            : <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">No hay reportes pendientes de revisión.</CardContent></Card>}
          <nav aria-label="Páginas de revisiones de reportes" className="flex items-center justify-between gap-4 text-sm">
            {pagina > 0 ? <Link className="font-medium text-primary underline-offset-4 hover:underline" href={query(pagina - 1)}>Anterior</Link> : <span />}
            <span className="text-muted-foreground">Página {pagina + 1}</span>
            {reportes.length === TAMANO_PAGINA_ANTERIOR ? <Link className="font-medium text-primary underline-offset-4 hover:underline" href={query(pagina + 1)}>Siguiente</Link> : <span />}
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
            {imagenes.length === TAMANO_PAGINA_ANTERIOR ? <Link className="font-medium text-primary underline-offset-4 hover:underline" href={query(pagina + 1)}>Siguiente</Link> : <span />}
          </nav>
        </section>
      )}
    </div>
  )
}
