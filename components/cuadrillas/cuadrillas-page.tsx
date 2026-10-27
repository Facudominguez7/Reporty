import { redirect } from "next/navigation"
import { UsersRound } from "lucide-react"

import { PanelCuadrillas } from "@/components/cuadrillas/panel-cuadrillas"
import { BackButton } from "@/components/back-button"
import { PageTitleBar } from "@/components/page-title-bar"
import {
  listarAsignacionesAbiertasConReporte,
  listarCuadrillas,
  listarReportesAsignables,
} from "@/database/queries/cuadrillas"
import { getReportMapData } from "@/database/queries/reportes/get-reportes"
import { getUserRoleContext, puedeGestionarCuadrillas, puedeOperarCuadrillas } from "@/lib/authz/roles"
import { calcularAccionesDisponibles } from "@/lib/use-cases/cuadrillas"
import { createClient } from "@/utils/supabase/server"

/** Shared operational workspace rendered by both the public dashboard and admin shell. */
export async function CuadrillasPage({ adminShell = false }: { adminShell?: boolean } = {}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect("/auth")

  const { data: contextoRol } = await getUserRoleContext(supabase, user.id)
  const roleId = contextoRol?.roleId ?? null
  if (!puedeOperarCuadrillas(roleId)) redirect("/dashboard")

  const [cuadrillasResultado, asignacionesResultado, reportesResultado, mapaResultado] = await Promise.all([
    listarCuadrillas(supabase),
    listarAsignacionesAbiertasConReporte(supabase),
    listarReportesAsignables(supabase),
    getReportMapData({ estado: "Pendiente" }),
  ])

  const cuadrillas = cuadrillasResultado.data
  const asignaciones = asignacionesResultado.data
  const reportesAsignables = reportesResultado.data
  const reportesEnMapa = mapaResultado.data ?? []
  const cuadrillasOcupadas = Object.fromEntries(
    asignaciones.map((asignacion) => [
      asignacion.cuadrillaId,
      { reporteId: asignacion.reporteId, reporteTitulo: asignacion.reporteTitulo },
    ]),
  )
  const abiertasPorCuadrilla = new Map<number, number>()
  for (const asignacion of asignaciones) {
    abiertasPorCuadrilla.set(asignacion.cuadrillaId, (abiertasPorCuadrilla.get(asignacion.cuadrillaId) ?? 0) + 1)
  }
  const accionesPorAsignacion = Object.fromEntries(
    asignaciones.map((asignacion) => [
      asignacion.id,
      calcularAccionesDisponibles({
        roleId,
        estadoReporteId: asignacion.reporteEstadoId,
        reporteEliminado: asignacion.reporteEliminado,
        asignacionAbierta: asignacion,
      }),
    ]),
  )

  return (
    <div className={adminShell ? "space-y-6" : "page-shell"}>
      <div className={adminShell ? "space-y-6" : "page-container page-stack"}>
        <section className="space-y-6">
          {adminShell ? (
            <header className="space-y-2 border-b border-border pb-6">
              <h1 className="text-3xl font-semibold tracking-tight">Operaciones y cuadrillas</h1>
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground">Administrá los equipos de atención y el seguimiento operativo de los reportes.</p>
            </header>
          ) : (
            <PageTitleBar
              leading={<BackButton />}
              icon={<UsersRound className="size-4" />}
              title="Gestionar cuadrillas"
              description="Administrá los equipos de atención."
            />
          )}
          <PanelCuadrillas
            cuadrillas={cuadrillas}
            abiertasPorCuadrilla={Object.fromEntries(abiertasPorCuadrilla)}
            asignaciones={asignaciones}
            accionesPorAsignacion={accionesPorAsignacion}
            reportesAsignables={reportesAsignables}
            reportesEnMapa={reportesEnMapa}
            cuadrillasOcupadas={cuadrillasOcupadas}
            puedeGestionarCatalogo={puedeGestionarCuadrillas(roleId)}
          />
        </section>
      </div>
    </div>
  )
}
