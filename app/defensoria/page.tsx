import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { ShieldCheck } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"
import { ChipReporte, tonoEstado, tonoPrioridad } from "@/components/report-detail/chip-reporte"
import { getCategoryIcon, getPriorityIcon } from "@/components/report-card"
import { getReportesDefensoria } from "@/database/queries/reportes/get-reportes"
import { getUserRoleContext } from "@/lib/authz/roles"
import { esDefensoria } from "@/lib/authz/roles"
import { createClient } from "@/utils/supabase/server"

export const metadata: Metadata = {
  title: "Defensoría del Pueblo — Reporty",
  description: "Bandeja de reportes pendientes y tomados por la Defensoría del Pueblo.",
  robots: { index: false },
}

/**
 * Bandeja de la Defensoría del Pueblo (S2, S10): lista de reportes Pendientes y Tomados,
 * con el número de reclamo visible. Solo accesible para el rol Defensoría.
 */
export default async function DefensoriaPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/auth?next=/defensoria")

  const { data: contextoRol } = await getUserRoleContext(supabase, user.id)
  if (!esDefensoria(contextoRol?.roleId)) redirect("/dashboard")

  const { data: reportesSinReclamo, error } = await getReportesDefensoria()
  const reportes = reportesSinReclamo.map((reporte) => ({
    id: reporte.id,
    titulo: reporte.title,
    descripcion: reporte.description,
    categoria: reporte.category,
    prioridad: reporte.priority,
    estado: reporte.status,
    autor: reporte.author,
    createdAt: reporte.createdAt,
    imageUrl: reporte.image,
    numeroReclamo: reporte.numeroReclamo,
  }))
  const pendientes = reportes.filter((reporte) => reporte.estado === "Pendiente").length

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-[var(--bottom-nav-space)] pt-6">
      <header className="mb-4 flex items-center gap-3">
        <div className="flex size-11 items-center justify-center rounded-[var(--radius)] bg-[var(--semantic-admin)] text-white">
          <ShieldCheck className="size-6" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Defensoría del Pueblo</h1>
          <p className="text-xs text-muted-foreground">Reportes pendientes de tomar</p>
        </div>
        <span className="ml-auto rounded-[var(--radius-pill)] border border-[var(--semantic-admin)]/30 bg-[var(--semantic-admin)]/10 px-3 py-1 text-xs font-semibold text-[var(--semantic-admin)]">
          {pendientes} pendientes
        </span>
      </header>

      <p className="mb-5 rounded-[var(--radius)] border border-[var(--semantic-admin)]/20 bg-[var(--semantic-admin)]/5 p-3 text-xs leading-relaxed text-muted-foreground">
        Tomá un reporte y asignale el <strong className="text-foreground">número de reclamo</strong> de nuestro sistema.
        El autor recibe una notificación al instante y el reporte queda visible como «Tomado por la Defensoría».
      </p>

      {error ? (
        <Card className="border-destructive/40">
          <CardContent className="p-4 text-sm text-muted-foreground">
            No pudimos cargar la bandeja. Intentá nuevamente en unos minutos.
          </CardContent>
        </Card>
      ) : reportes.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="space-y-1 p-6 text-center">
            <p className="font-semibold">No hay reportes pendientes ni tomados por ahora.</p>
            <p className="text-sm text-muted-foreground">Cuando la comunidad publique reportes con foto aprobada, van a aparecer acá.</p>
          </CardContent>
        </Card>
      ) : (
        <ul className="grid gap-3" aria-label="Reportes de la Defensoría">
          {reportes.map((reporte) => (
            <li key={reporte.id}>
              <Link
                href={`/reportes/${reporte.id}`}
                className="block rounded-[var(--radius)] border border-border/60 bg-card p-4 transition-colors hover:border-foreground/20"
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <ChipReporte etiqueta="Prioridad" tono={tonoPrioridad(reporte.prioridad)} icono={getPriorityIcon(reporte.prioridad)} valor={reporte.prioridad} />
                  <ChipReporte etiqueta="Estado" tono={tonoEstado(reporte.estado)} icono={null} valor={reporte.estado} />
                  {reporte.numeroReclamo && (
                    <ChipReporte etiqueta="Reclamo" tono="var(--semantic-admin)" icono={null} valor={`Nº ${reporte.numeroReclamo}`} />
                  )}
                </div>
                <h2 className="line-clamp-2 text-sm font-semibold tracking-tight">{reporte.titulo}</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {reporte.categoria}
                  {reporte.autor ? ` · ${reporte.autor}` : ""}
                  {` · ${new Date(reporte.createdAt).toLocaleDateString("es-AR", { day: "numeric", month: "short" })}`}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
