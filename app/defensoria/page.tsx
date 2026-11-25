import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { AdminDashboardShell } from "@/components/admin/dashboard-shell"
import { Card, CardContent } from "@/components/ui/card"
import { BandejaClient, type ReporteBandeja } from "@/app/defensoria/bandeja-client"
import { getReportesDefensoria } from "@/database/queries/reportes/get-reportes"
import { normalizarBusquedaDefensoria } from "@/database/queries/reportes/filtro-defensoria"
import { getUserRoleContext, esDefensoria } from "@/lib/authz/roles"
import { createClient } from "@/utils/supabase/server"

export const metadata: Metadata = {
  title: "Defensoría del Pueblo — Reporty",
  description: "Bandeja de reportes pendientes y tomados por la Defensoría del Pueblo.",
  robots: { index: false },
}

/**
 * Bandeja de la Defensoría del Pueblo (S2, S10, S11): lista de reportes Pendientes y
 * Tomados, con detalle y toma dentro del panel por medio de `BandejaClient`. La guarda
 * de rol queda acá en el servidor (S10); la ficha directa /reportes/[id] sigue siendo
 * la entrada desde el email (S2).
 */
export default async function DefensoriaPage({ searchParams }: { searchParams?: Promise<{ pagina?: string; vista?: string; busqueda?: string }> } = {}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/auth?next=/defensoria")

  const { data: contextoRol } = await getUserRoleContext(supabase, user.id)
  const rol = contextoRol?.roleId ?? null
  if (!esDefensoria(rol)) redirect("/dashboard")

  const parametros = await searchParams
  const numeroPagina = Number(parametros?.pagina)
  const pagina = Number.isSafeInteger(numeroPagina) && numeroPagina > 0 && numeroPagina <= 5000 ? numeroPagina : 1
  const vista = parametros?.vista === "tomados" ? "tomados" : "pendientes"
  const busqueda = normalizarBusquedaDefensoria(typeof parametros?.busqueda === "string" ? parametros.busqueda : "")
  const limite = 20
  const { data: reportesSinReclamo, error, hasMore } = await getReportesDefensoria(limite, (pagina - 1) * limite, { vista, busqueda })
  const reportes: ReporteBandeja[] = (reportesSinReclamo ?? []).map((reporte) => ({
    id: reporte.id,
    titulo: reporte.title,
    descripcion: reporte.description,
    categoria: reporte.category,
    prioridad: reporte.priority,
    estado: reporte.status,
    ubicacion: reporte.direccion?.trim() ? reporte.direccion : "Dirección no disponible",
    barrio: reporte.barrio,
    autor: reporte.author,
    createdAt: reporte.createdAt,
    imageUrl: reporte.image,
    numeroReclamo: reporte.numeroReclamo,
  }))

  return (
    <AdminDashboardShell email={user.email ?? "Cuenta de Defensoría"} roleId={rol} pendingReviews={null} variante="defensoria">
      <div className="flex min-w-0 flex-col gap-6 md:gap-8">
        <header className="grid gap-2">
          <p className="page-meta-label">Defensoría del Pueblo · Área de trabajo</p>
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Reportes</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">Revisá el contexto y asigná el reclamo sin salir de la bandeja.</p>
        </header>

        {error ? (
          <Card className="border-destructive/40">
            <CardContent className="p-4 text-sm text-muted-foreground">
              No pudimos cargar la bandeja. Intentá nuevamente en unos minutos.
            </CardContent>
          </Card>
        ) : (
          <BandejaClient key={`${vista}:${busqueda}:${pagina}`} reportes={reportes} vistaInicial={vista} busquedaInicial={busqueda} pagina={pagina} hayMas={hasMore && pagina < 5000} />
        )}
      </div>
    </AdminDashboardShell>
  )
}
