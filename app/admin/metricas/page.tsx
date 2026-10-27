import { BarChart3, CheckCircle2, Clock3, FileText, Timer, TrendingUp } from "lucide-react"

import { AdminStatCard } from "@/components/admin/admin-stat-card"
import { GraficoReportesPorCategoriaDiferido, GraficoZonasCalientesDiferido } from "@/components/dashboard/graficos-diferidos"
import { MapaCalorZonas } from "@/components/dashboard/mapa-calor-zonas"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getEstadisticasInteresado, getReportesPorCategoria, getTiempoPromedioResolucion, getZonasConMasReportes } from "@/database/queries/interesado"
import { esRolOperador, getUserRoleContext } from "@/lib/authz/roles"
import { redirect } from "next/navigation"
import { createClient } from "@/utils/supabase/server"

export const metadata = { title: "Métricas · Administración", robots: { index: false, follow: false } }

export default async function AdminMetricasPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth?next=/admin/metricas")
  const { data: roleContext } = await getUserRoleContext(supabase, user.id)
  if (esRolOperador(roleContext?.roleId)) redirect("/admin/operaciones")

  const [stats, reportesPorCategoria, tiempoResolucion, zonasCalientes] = await Promise.all([
    getEstadisticasInteresado(supabase),
    getReportesPorCategoria(supabase),
    getTiempoPromedioResolucion(supabase),
    getZonasConMasReportes(supabase, 10),
  ])

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Métricas</h1>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">Indicadores actuales de reportes. Los reportes en progreso representan un eje operativo distinto del estado administrativo.</p>
      </header>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Métricas de reportes">
        <AdminStatCard label="Reportes totales" value={String(stats.totalReportes)} note="No eliminados" icon={<FileText className="size-4" />} />
        <AdminStatCard label="Pendientes" value={String(stats.reportesPendientes)} note="Requieren atención" icon={<Clock3 className="size-4" />} />
        <AdminStatCard label="En progreso" value={String(stats.reportesEnProgreso)} note="Con seguimiento operativo" icon={<TrendingUp className="size-4" />} />
        <AdminStatCard label="Tasa de resolución" value={`${stats.tasaResolucion}%`} note={`${stats.reportesResueltos} reportes reparados`} icon={<CheckCircle2 className="size-4" />} />
      </section>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="border-[var(--semantic-admin)]/25 bg-[var(--semantic-admin)]/10">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl border border-[var(--semantic-admin)]/25 bg-card text-[var(--semantic-admin)]">
              <Timer className="size-4" />
            </div>
            <div>
              <p className="page-meta-label">Tiempo promedio de resolución</p>
              <p className="mt-1 text-xl font-semibold tracking-tight">{tiempoResolucion.diasPromedio} días</p>
              <p className="text-xs text-muted-foreground">≈ {tiempoResolucion.horasPromedio} horas entre apertura y cierre.</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><BarChart3 className="size-4 text-[var(--semantic-admin)]" /> Lectura de estados</CardTitle></CardHeader>
          <CardContent className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-2">
            <p><strong className="text-foreground">Pendiente</strong> indica el estado administrativo del reporte.</p>
            <p><strong className="text-foreground">En progreso</strong> indica que una cuadrilla tiene una intervención activa.</p>
          </CardContent>
        </Card>
      </div>
      <section className="grid gap-4 xl:grid-cols-2" aria-label="Distribución de reportes">
        <GraficoReportesPorCategoriaDiferido data={reportesPorCategoria} />
        <GraficoZonasCalientesDiferido zonas={zonasCalientes} />
      </section>
      <section aria-label="Mapa de zonas con más reportes">
        <MapaCalorZonas zonas={zonasCalientes} height="500px" />
      </section>
    </div>
  )
}
