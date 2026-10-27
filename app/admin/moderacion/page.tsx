import Link from "next/link"
import { redirect } from "next/navigation"

import { listarImagenesAdministrativas } from "@/lib/moderation/administracion.server"
import { ColaModeracion } from "@/app/dashboard/moderacion/cola-moderacion"
import { Card, CardContent } from "@/components/ui/card"

export const dynamic = "force-dynamic"
export const revalidate = 0
export const fetchCache = "force-no-store"
export const metadata = { title: "Revisiones · Administración", robots: { index: false, follow: false } }

type SearchParams = Promise<{ pagina?: string; terminales?: string }>

function pageNumber(value?: string) {
  const parsed = Number(value ?? 0)
  return Number.isSafeInteger(parsed) ? Math.max(0, Math.min(parsed, 500)) : 0
}

export default async function AdminModeracionPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const pagina = pageNumber(params.pagina)
  const terminales = params.terminales === "1"
  let imagenes

  try {
    imagenes = await listarImagenesAdministrativas(pagina, terminales)
  } catch (error) {
    const estado = (error as { estado?: number })?.estado
    if (estado === 401) redirect("/auth")
    if (estado === 403) redirect("/mapa")
    throw new Error("No se pudo consultar la cola de moderación. Intentá nuevamente.")
  }

  const query = (nextPage: number, includeTerminales = terminales) => {
    const next = new URLSearchParams()
    if (nextPage > 0) next.set("pagina", String(nextPage))
    if (includeTerminales) next.set("terminales", "1")
    return `/admin/moderacion${next.size ? `?${next}` : ""}`
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Revisiones</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">Revisá el contexto antes de publicar fotografías. Cada decisión conserva su auditoría y vuelve a verificar tus permisos.</p>
          </div>
          <Link href={terminales ? "/admin/moderacion" : "/admin/moderacion?terminales=1"} className="text-sm font-medium text-primary underline-offset-4 hover:underline">
            {terminales ? "Ver pendientes" : "Ver auditoría"}
          </Link>
        </div>
      </header>

      {!imagenes.length ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">No hay fotografías en esta vista.</CardContent></Card>
      ) : <ColaModeracion imagenes={imagenes} />}

      <nav aria-label="Páginas de revisiones" className="flex items-center justify-between gap-4 text-sm">
        {pagina > 0 ? <Link className="font-medium text-primary underline-offset-4 hover:underline" href={query(pagina - 1)}>Anterior</Link> : <span />}
        <span className="text-muted-foreground">Página {pagina + 1}</span>
        {imagenes.length === 20 ? <Link className="font-medium text-primary underline-offset-4 hover:underline" href={query(pagina + 1)}>Siguiente</Link> : <span />}
      </nav>
    </div>
  )
}
