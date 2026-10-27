import Link from "next/link"
import { ChevronLeft, ChevronRight, FileText } from "lucide-react"
import { redirect } from "next/navigation"

import { Button } from "@/components/ui/button"
import { getAdminReportFilters, getAdminReportes } from "@/database/queries/admin/admin-reportes"
import { verificarEsAdmin } from "@/database/queries/admin/verificar-admin"
import { createClient } from "@/utils/supabase/server"
import { ReportesAdminTable } from "@/components/admin/reportes/reportes-admin-table"

type SearchParams = Promise<{ search?: string; estado?: string; categoria?: string; page?: string }>

function pageNumber(value?: string) {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1
}

export default async function AdminReportesPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth?next=/admin/reportes")

  const { isAdmin } = await verificarEsAdmin(supabase, user.id)
  if (!isAdmin) redirect("/dashboard")

  const page = pageNumber(params.page)
  const [{ data: reports, count, pageSize }, { categorias, estados }] = await Promise.all([
    getAdminReportes(supabase, user.id, { search: params.search, estado: params.estado, categoria: params.categoria, page }),
    getAdminReportFilters(supabase, user.id),
  ])
  const totalPages = Math.max(1, Math.ceil(count / pageSize))
  const query = (nextPage: number) => {
    const next = new URLSearchParams()
    if (params.search) next.set("search", params.search)
    if (params.estado) next.set("estado", params.estado)
    if (params.categoria) next.set("categoria", params.categoria)
    if (nextPage > 1) next.set("page", String(nextPage))
    return `/admin/reportes${next.size ? `?${next}` : ""}`
  }

  return (
    <div className="space-y-6">
      <div className="space-y-6">
        <header className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Reportes</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Supervisá, filtrá y actualizá los reportes publicados.</p>
          </div>
          <span className="rounded-[var(--radius-pill)] bg-accent px-3 py-1.5 text-sm font-medium text-primary">{count} reportes activos</span>
        </header>

        <ReportesAdminTable reports={reports} categorias={categorias} estados={estados} search={params.search} estado={params.estado} categoria={params.categoria} />

        {totalPages > 1 && <nav aria-label="Paginación de reportes" className="flex items-center justify-between">
          <Button asChild variant="outline" size="sm" disabled={page <= 1}><Link href={query(Math.max(1, page - 1))}><ChevronLeft /> Anteriores</Link></Button>
          <span className="text-sm text-muted-foreground">Página {page} de {totalPages}</span>
          <Button asChild variant="outline" size="sm" disabled={page >= totalPages}><Link href={query(Math.min(totalPages, page + 1))}>Siguientes <ChevronRight /></Link></Button>
        </nav>}
      </div>
    </div>
  )
}
