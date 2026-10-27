import Link from "next/link"
import { ArrowRight, CheckCircle2, FileText, Images, ShieldCheck, Users } from "lucide-react"

import { AdminStatCard } from "@/components/admin/admin-stat-card"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { RecentAdminReports } from "@/components/admin/reportes/recent-admin-reports"
import { getEstadisticasInteresado } from "@/database/queries/interesado"
import { getAdminReportFilters, getAdminReportes } from "@/database/queries/admin/admin-reportes"
import { getUserRoleContext } from "@/lib/authz/roles"
import { ROLE_IDS } from "@/lib/authz/catalog"
import { redirect } from "next/navigation"
import { createClient } from "@/utils/supabase/server"

const quickActions = [
  { href: "/admin/moderacion", label: "Revisar fotografías", detail: "Cola de moderación privada", icon: Images },
  { href: "/admin/reportes", label: "Ver reportes", detail: "Operaciones administrativas", icon: FileText },
  { href: "/admin/usuarios", label: "Gestionar usuarios", detail: "Política segura en preparación", icon: Users }
]

export default async function AdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth?next=/admin")

  const { data: roleContext } = await getUserRoleContext(supabase, user.id)
  if (roleContext?.roleId === ROLE_IDS.INTERESADO) redirect("/admin/metricas")
  if (roleContext?.roleId === ROLE_IDS.OPERADOR) redirect("/admin/operaciones")

  const [stats, reportesResult, filters] = await Promise.all([
    getEstadisticasInteresado(supabase),
    getAdminReportes(supabase, user.id, { pageSize: 5 }),
    getAdminReportFilters(supabase, user.id),
  ])
  const reportes = reportesResult.data
  const estados = filters.estados

  return (
    <div className="space-y-8 md:space-y-10">
      <header className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Buen día, equipo.</h1>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">Una vista rápida de lo que necesita atención en Reporty.</p>
        </div>
        <div className="inline-flex items-center gap-2 text-sm text-muted-foreground"><ShieldCheck className="size-4 text-[var(--semantic-admin)]" aria-hidden="true" /> Espacio protegido</div>
      </header>

      <section aria-labelledby="admin-stats-title" className="space-y-3">
        <h2 id="admin-stats-title" className="sr-only">Indicadores administrativos</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <AdminStatCard label="Reportes activos" value={String(stats.totalReportes)} note={`${stats.reportesPendientes} pendientes`} icon={<FileText className="size-4" />} />
          <AdminStatCard label="Pendientes de revisión" value={String(stats.reportesPendientes)} note="Reportes que requieren atención" icon={<Images className="size-4" />} />
          <AdminStatCard label="Resueltos" value={`${stats.tasaResolucion}%`} note={`${stats.reportesResueltos} reportes reparados`} icon={<CheckCircle2 className="size-4" />} />
          <AdminStatCard label="En progreso" value={String(stats.reportesEnProgreso)} note="Seguimiento operativo" icon={<Users className="size-4" />} />
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-3"><div><CardTitle className="text-lg">Últimos reportes</CardTitle><p className="text-sm text-muted-foreground">Los cinco casos publicados más recientes.</p></div><Link href="/admin/reportes" className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-primary underline-offset-4 hover:underline">Ver todos <ArrowRight className="size-4" /></Link></CardHeader>
          <CardContent>
            <RecentAdminReports reports={reportes} estados={estados} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-lg">Acciones rápidas</CardTitle><p className="text-sm text-muted-foreground">Entrá directo a las tareas del día.</p></CardHeader>
          <CardContent className="grid gap-2">
            {quickActions.map(({ href, label, detail, icon: Icon }) => (
              <Link key={href} href={href} className="group flex min-h-14 items-center gap-3 rounded-xl bg-muted px-3 py-3 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-card text-[var(--semantic-admin)]"><Icon className="size-4" aria-hidden="true" /></span>
                <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{label}</span><span className="block truncate text-xs text-muted-foreground">{detail}</span></span>
                <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </Link>
            ))}
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
