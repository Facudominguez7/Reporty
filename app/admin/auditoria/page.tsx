import Link from "next/link"
import { redirect } from "next/navigation"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { AuditFiltersForm } from "@/components/admin/auditoria/audit-filters"
import { Card, CardContent } from "@/components/ui/card"
import { getAdminAudit, type AuditEvent, type AuditFilters } from "@/database/queries/admin/admin-audit"
import { createClient } from "@/utils/supabase/server"

export const metadata = { title: "Auditoría · Administración", robots: { index: false, follow: false } }

const descriptions: Record<AuditEvent["action"], string> = {
  report_created: "creó un reporte",
  comment_created: "comentó un reporte",
  vote_repaired: "votó que un reporte está reparado",
  vote_not_exists: "votó que un reporte no existe",
}

export default async function AuditoriaPage({ searchParams }: { searchParams: Promise<{ page?: string; usuario?: string; accion?: string; periodo?: string }> }) {
  const params = await searchParams
  const parsed = Number(params.page)
  const page = Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1
  const action = Object.hasOwn(descriptions, params.accion ?? "") ? params.accion as AuditEvent["action"] : undefined
  const days = params.periodo === "7" || params.periodo === "30" ? Number(params.periodo) as 7 | 30 : undefined
  const filters: AuditFilters = { user: params.usuario?.trim().slice(0, 100) ?? "", action, days }
  const pagination = new URLSearchParams()
  if (filters.user) pagination.set("usuario", filters.user)
  if (action) pagination.set("accion", action)
  if (days) pagination.set("periodo", String(days))
  const pageHref = (number: number) => `/admin/auditoria?${new URLSearchParams([...pagination, ["page", String(number)]]).toString()}`
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth?next=/admin/auditoria")
  const { unauthorized, events, hasNext, error } = await getAdminAudit(supabase, user.id, page, filters)
  if (unauthorized) redirect("/mapa")

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Auditoría</h1>
        <p className="mt-2 text-sm text-muted-foreground">Actividad nueva de reportes, comentarios y votos, de más reciente a más antigua.</p>
      </header>
      <AuditFiltersForm {...filters} />
      {error ? (
        <p role="alert" className="text-sm text-destructive">No pudimos cargar la auditoría.</p>
      ) : (
        <>
          <ol className="space-y-2" aria-label="Actividad de usuarios">
            {events.map((event) => (
              <li key={event.id}>
                <Card><CardContent className="space-y-1 p-3 sm:p-4">
                  <p className="text-sm"><strong>{event.actor}</strong> {descriptions[event.action]}{event.report_id ? " en " : ""}{event.report_id && <Link className="font-medium text-primary underline-offset-4 hover:underline" href={`/reportes/${event.report_id}`}>#{event.report_id}{event.report_title ? ` · ${event.report_title}` : ""}</Link>}.</p>
                  <time dateTime={event.occurred_at} className="block text-xs text-muted-foreground">{new Date(event.occurred_at).toLocaleString("es-AR")}</time>
                </CardContent></Card>
              </li>
            ))}
          </ol>
          {!events.length && <p className="text-sm text-muted-foreground">Todavía no hay actividad registrada en esta página.</p>}
          {(page > 1 || hasNext) && <nav aria-label="Paginación de auditoría" className="flex justify-between gap-4 text-sm">
            {page > 1 ? <Link href={pageHref(page - 1)} className="inline-flex items-center gap-1 text-primary"><ChevronLeft className="size-4" /> Anteriores</Link> : <span />}
            <span className="text-muted-foreground">Página {page}</span>
            {hasNext ? <Link href={pageHref(page + 1)} className="inline-flex items-center gap-1 text-primary">Siguientes <ChevronRight className="size-4" /></Link> : <span />}
          </nav>}
        </>
      )}
    </div>
  )
}
