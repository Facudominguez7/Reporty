import { CheckCircle2, Clock3, MapPin, Timer } from "lucide-react"
import { redirect } from "next/navigation"

import { AdminStatCard } from "@/components/admin/admin-stat-card"
import { EstadoPorCategoriaCard } from "@/components/admin/metricas/estado-por-categoria"
import { MapaBarrios } from "@/components/admin/metricas/mapa-barrios"
import { RankingBarrios } from "@/components/admin/metricas/ranking-barrios"
import { getEstadoPorCategoria, getReportesPorBarrio } from "@/database/queries/interesado"
import { esRolOperador, getUserRoleContext } from "@/lib/authz/roles"
import { resumirMetricas } from "@/lib/metricas/metricas-barrios"
import { createClient } from "@/utils/supabase/server"

export const metadata = { title: "Métricas · Administración", robots: { index: false, follow: false } }

/** Cuántos barrios muestra el ranking. */
const BARRIOS_EN_RANKING = 10

/**
 * Panel de métricas: dónde se acumulan los reportes (por barrio) y cuánto se resuelve de cada
 * categoría (#302). La base agrupa todo; la página solo arma los indicadores.
 */
export default async function AdminMetricasPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth?next=/admin/metricas")
  const { data: roleContext } = await getUserRoleContext(supabase, user.id)
  if (esRolOperador(roleContext?.roleId)) redirect("/admin/operaciones")

  const [{ barrios, sinBarrio }, categorias] = await Promise.all([
    getReportesPorBarrio(supabase),
    getEstadoPorCategoria(supabase),
  ])
  const resumen = resumirMetricas(categorias, barrios)
  const ranking = barrios.filter((barrio) => barrio.total > 0).slice(0, BARRIOS_EN_RANKING)
  const concentracion = resumen.concentracion.barrios.join(" y ")

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Métricas</h1>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          {resumen.total} reportes sin eliminar: dónde se acumulan y cuánto se resuelve de cada categoría.
        </p>
      </header>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Indicadores de reportes">
        <AdminStatCard
          label="Pendientes"
          value={String(resumen.pendientes)}
          note={`${resumen.porcentajePendientes} % del total sigue sin respuesta.`}
          icon={<Clock3 className="size-4" />}
        />
        <AdminStatCard
          label="Espera de un pendiente"
          value={resumen.esperaPromedioDias === null ? "—" : `${resumen.esperaPromedioDias} días`}
          note={`${resumen.pendientesMas90Dias} pendientes superan los 90 días.`}
          icon={<Timer className="size-4" />}
        />
        <AdminStatCard
          label="Reparados"
          value={String(resumen.reparados)}
          note={`${resumen.porcentajeReparados} % resuelto; ${resumen.defensoria} más en Defensoría.`}
          icon={<CheckCircle2 className="size-4" />}
        />
        <AdminStatCard
          label="Concentración"
          value={`${resumen.concentracion.porcentaje} %`}
          note={concentracion ? `${concentracion} suman ${resumen.concentracion.total} reportes.` : "Todavía no hay reportes en los barrios."}
          icon={<MapPin className="size-4" />}
        />
      </section>
      <section className="flex flex-wrap items-stretch gap-4" aria-label="Reportes por barrio">
        <RankingBarrios barrios={ranking} sinBarrio={sinBarrio} cantidadBarrios={barrios.length} totalReportes={resumen.total} />
        <MapaBarrios barrios={barrios} />
      </section>
      <EstadoPorCategoriaCard categorias={categorias} />
      <p className="text-xs text-muted-foreground">Un reporte cuenta en el barrio que contiene su punto.</p>
    </div>
  )
}
