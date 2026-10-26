/** Cola administrativa privada; independiente de los permisos generales del dashboard. */
import Link from "next/link"
import { redirect } from "next/navigation"
import { listarImagenesAdministrativas } from "@/lib/moderation/administracion.server"
import { ColaModeracion } from "./cola-moderacion"
export const dynamic = "force-dynamic"
export const revalidate = 0
export const fetchCache = "force-no-store"
export const metadata = { title: "Moderación de fotografías", robots: { index: false, follow: false } }

/** Autoriza Admin DB antes de listar; deniega invitados, operadores y usuarios normales. */
export default async function PaginaModeracion({ searchParams }: { searchParams: Promise<{ pagina?: string; terminales?: string }> }) {
  const parametros = await searchParams
  const numero = Number(parametros.pagina ?? 0)
  const pagina = Number.isSafeInteger(numero) ? Math.max(0, Math.min(numero, 500)) : 0
  const terminales = parametros.terminales === "1"
  const sufijo = terminales ? "&terminales=1" : ""
  let imagenes
  try { imagenes = await listarImagenesAdministrativas(pagina, terminales) }
  catch (error) {
    const estado = (error as { estado?: number })?.estado
    if (estado === 401) redirect("/auth")
    if (estado === 403) redirect("/dashboard")
    throw new Error("No se pudo consultar la cola de moderación. Intentá nuevamente.")
  }
  return <main className="page-shell"><div className="page-container flex flex-col gap-6">
    <header className="flex flex-col gap-2">
      <Link href="/dashboard" className="text-sm underline">Volver al dashboard</Link>
      <p className="text-sm text-muted-foreground">Administración · Evidencia privada</p>
      <h1 className="text-3xl font-semibold tracking-tight">Moderación de fotografías</h1>
      <p className="text-muted-foreground">Revisá el contexto antes de publicar. Rechazar retira el reporte, revierte su premio de creación registrado y genera una advertencia privada al autor.</p>
    </header>
    <nav aria-label="Vistas de moderación" className="flex flex-wrap gap-4">
      <Link className="underline" aria-current={!terminales ? "page" : undefined} href="/dashboard/moderacion">Revisión y publicación pendientes</Link>
      <Link className="underline" aria-current={terminales ? "page" : undefined} href="?terminales=1">Auditoría y limpieza de terminales</Link>
    </nav>
    {!imagenes.length ? <p role="status">No hay fotografías en esta página de la cola.</p> : <ColaModeracion imagenes={imagenes} />}
    <nav aria-label="Páginas de moderación" className="flex items-center gap-4">
      {pagina > 0 ? <Link className="underline" href={`?pagina=${pagina - 1}${sufijo}`}>Anterior</Link> : null}
      <span>Página {pagina + 1}</span>
      {imagenes.length === 20 && pagina < 500 ? <Link className="underline" href={`?pagina=${pagina + 1}${sufijo}`}>Siguiente</Link> : null}
    </nav>
  </div></main>
}
