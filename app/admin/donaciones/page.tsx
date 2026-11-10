import { CalendarDays, Download, HandHeart, Wallet } from "lucide-react"
import { redirect } from "next/navigation"

import { AdminStatCard } from "@/components/admin/admin-stat-card"
import { Card, CardContent } from "@/components/ui/card"
import { LIMITE_DONACIONES, obtenerPanelDonaciones } from "@/database/queries/admin/donaciones"
import { formatearMonto } from "@/lib/donaciones/montos"
import { ESTADOS_DONACION, ETIQUETAS_ESTADO_DONACION, formatearFecha, leerFiltros, type DonacionPanel } from "@/lib/donaciones/panel"
import type { EstadoDonacion } from "@/lib/donaciones/mercado-pago.server"
import { cn } from "@/lib/utils"

export const metadata = { title: "Donaciones · Administración", robots: { index: false, follow: false } }
export const dynamic = "force-dynamic"

type SearchParams = Promise<{ estado?: string; mes?: string }>

const CLASE_ESTADO: Record<EstadoDonacion, string> = {
  aprobada: "bg-primary/10 text-primary",
  pendiente: "bg-[var(--semantic-warning)]/15 text-foreground",
  rechazada: "bg-destructive/10 text-destructive",
}

/**
 * Etiqueta suave con el estado de la donación.
 */
function ChipEstado({ estado }: { estado: EstadoDonacion }) {
  return <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-semibold", CLASE_ESTADO[estado])}>{ETIQUETAS_ESTADO_DONACION[estado]}</span>
}

/**
 * Fila de la tabla en pantallas anchas y tarjeta en el celular.
 */
function FilaDonacion({ donacion }: { donacion: DonacionPanel }) {
  return (
    <li className="grid gap-2 border-b border-border/70 p-4 last:border-b-0 md:grid-cols-[9rem_7rem_7rem_minmax(0,10rem)_minmax(0,1fr)_8rem] md:items-start md:gap-4">
      <span className="text-xs text-muted-foreground md:text-sm">{formatearFecha(donacion.fecha)}</span>
      <span className="text-base font-semibold md:text-sm">{formatearMonto(donacion.monto)}</span>
      <span><ChipEstado estado={donacion.estado} /></span>
      <span className="min-w-0 truncate text-sm">{donacion.nombre ?? <span className="text-muted-foreground">Sin nombre</span>}</span>
      <span className="min-w-0 whitespace-pre-line break-words text-sm text-muted-foreground">{donacion.mensaje ?? "—"}</span>
      <span className="min-w-0 truncate text-sm">{donacion.usuario ? `@${donacion.usuario}` : <span className="text-muted-foreground">Sin sesión</span>}</span>
    </li>
  )
}

/**
 * Panel admin de donaciones: totales, filtros por estado y mes, tabla y exportación CSV.
 */
export default async function AdminDonacionesPage({ searchParams }: { searchParams: SearchParams }) {
  const filtros = leerFiltros(await searchParams)
  const panel = await obtenerPanelDonaciones(filtros)
  if (!panel.autorizado) redirect("/mapa")

  const consulta = new URLSearchParams()
  if (filtros.estado) consulta.set("estado", filtros.estado)
  if (filtros.mes) consulta.set("mes", filtros.mes)
  const urlCsv = `/admin/donaciones/csv${consulta.size ? `?${consulta}` : ""}`

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Donaciones</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Pagos recibidos por Mercado Pago. Nombre y mensaje son privados: solo los ve administración.</p>
        </div>
        <a href={urlCsv} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-medium hover:bg-muted" download>
          <Download className="size-4" aria-hidden="true" /> Exportar CSV
        </a>
      </header>

      <section aria-label="Totales" className="grid gap-3 sm:grid-cols-3">
        <AdminStatCard label="Este mes" value={formatearMonto(panel.totales.delMes)} note="Donaciones aprobadas en el mes en curso" icon={<CalendarDays className="size-4" />} />
        <AdminStatCard label="Total histórico" value={formatearMonto(panel.totales.total)} note="Todas las donaciones aprobadas" icon={<Wallet className="size-4" />} />
        <AdminStatCard label="Donaciones aprobadas" value={String(panel.totales.cantidad)} note="Cantidad de pagos aprobados" icon={<HandHeart className="size-4" />} />
      </section>

      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end sm:justify-between">
          <p className="text-sm font-semibold">Filtrar donaciones</p>
          <form method="get" className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <select name="estado" defaultValue={filtros.estado ?? ""} className="min-h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm sm:w-44" aria-label="Filtrar por estado">
              <option value="">Todos los estados</option>
              {ESTADOS_DONACION.map((estado) => <option key={estado} value={estado}>{ETIQUETAS_ESTADO_DONACION[estado]}</option>)}
            </select>
            <input type="month" name="mes" defaultValue={filtros.mes ?? ""} className="min-h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm sm:w-44" aria-label="Filtrar por mes" />
            <button type="submit" className="min-h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">Aplicar</button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="hidden grid-cols-[9rem_7rem_7rem_minmax(0,10rem)_minmax(0,1fr)_8rem] gap-4 border-b border-border/70 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:grid">
            <span>Fecha</span><span>Monto</span><span>Estado</span><span>Nombre</span><span>Mensaje</span><span>Usuario</span>
          </div>
          {panel.donaciones.length ? (
            <ul aria-label="Donaciones">{panel.donaciones.map((donacion) => <FilaDonacion key={donacion.id} donacion={donacion} />)}</ul>
          ) : (
            <p className="p-6 text-center text-sm text-muted-foreground">No hay donaciones con estos filtros.</p>
          )}
        </CardContent>
      </Card>
      {panel.donaciones.length >= LIMITE_DONACIONES && (
        <p className="text-sm text-muted-foreground">Se muestran las {LIMITE_DONACIONES} más recientes. Filtrá por mes para ver las anteriores.</p>
      )}
    </div>
  )
}
