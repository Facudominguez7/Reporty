"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { Filter, Search, Trash2, X } from "lucide-react"
import { toast } from "sonner"

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { getCategoryIcon, getPriorityIcon, getPriorityVariant } from "@/components/report-card"
import type { AdminReport } from "@/database/queries/admin/admin-reportes"
import { cambiarEstadoReporteAction, eliminarReporteAction } from "@/app/admin/reportes/actions"

type Option = { id: number; nombre: string }

type Props = {
  reports: AdminReport[]
  categorias: Option[]
  estados: Option[]
  search?: string
  estado?: string
  categoria?: string
}

function statusVariant(name: string | undefined) {
  const value = name?.toLowerCase()
  return value === "reparado" ? "reparado" : value === "rechazado" ? "rechazado" : "pendiente"
}


export function ReportesAdminTable({ reports, categorias, estados, search = "", estado = "all", categoria = "all" }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<number | null>(null)
  const [statusChange, setStatusChange] = useState<{ reportId: number; stateId: number; reportTitle: string; stateName: string } | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)

  const updateQuery = (key: string, value: string) => {
    const params = new URLSearchParams()
    if (key !== "search" && search) params.set("search", search)
    if (key !== "estado" && estado !== "all") params.set("estado", estado)
    if (key !== "categoria" && categoria !== "all") params.set("categoria", categoria)
    if (value && value !== "all") params.set(key, value)
    startTransition(() => router.push(`/admin/reportes${params.size ? `?${params}` : ""}`))
  }

  const requestStatusChange = (reportId: number, stateId: string, reportTitle: string) => {
    const nextStateId = Number(stateId)
    const stateName = estados.find((estado) => estado.id === nextStateId)?.nombre ?? "este estado"
    setStatusChange({ reportId, stateId: nextStateId, reportTitle, stateName })
  }

  const changeStatus = () => {
    if (!statusChange) return
    const { reportId, stateId } = statusChange
    setBusyId(reportId)
    startTransition(async () => {
      const result = await cambiarEstadoReporteAction(reportId, stateId)
      setBusyId(null)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success("Estado actualizado")
      setStatusChange(null)
      router.refresh()
    })
  }

  const removeReport = (reportId: number) => {
    if (!window.confirm("¿Eliminar este reporte? Se conservará como borrado suave.")) return
    setBusyId(reportId)
    startTransition(async () => {
      const result = await eliminarReporteAction(reportId)
      setBusyId(null)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success("Reporte eliminado")
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end md:hidden">
        <Button type="button" variant="filter" size="sm" className="w-full" onClick={() => setFiltersOpen((value) => !value)}>
          {filtersOpen ? <X /> : <Filter />}
          {filtersOpen ? "Ocultar filtros" : "Mostrar filtros"}
        </Button>
      </div>
      <Card className={filtersOpen ? "block" : "hidden md:block"}>
        <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-end">
          <label className="flex-1 space-y-1.5 text-sm font-medium">
            Buscar
            <div className="relative">
              <Search className="absolute left-3 top-3 size-4 text-muted-foreground" aria-hidden="true" />
              <Input defaultValue={search} className="pl-9" placeholder="Título o descripción" onKeyDown={(event) => {
                if (event.key === "Enter") updateQuery("search", event.currentTarget.value.trim())
              }} />
            </div>
          </label>
          <label className="space-y-1.5 text-sm font-medium">
            Estado
            <Select value={estado} onValueChange={(value) => updateQuery("estado", value)}>
              <SelectTrigger className="w-full md:w-44"><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent><SelectItem value="all">Todos</SelectItem>{estados.map((option) => <SelectItem key={option.id} value={String(option.id)}>{option.nombre}</SelectItem>)}</SelectContent>
            </Select>
          </label>
          <label className="space-y-1.5 text-sm font-medium">
            Categoría
            <Select value={categoria} onValueChange={(value) => updateQuery("categoria", value)}>
              <SelectTrigger className="w-full md:w-48"><SelectValue placeholder="Todas" /></SelectTrigger>
              <SelectContent><SelectItem value="all">Todas</SelectItem>{categorias.map((option) => <SelectItem key={option.id} value={String(option.id)}>{option.nombre}</SelectItem>)}</SelectContent>
            </Select>
          </label>
        </CardContent>
      </Card>

      <div className="grid gap-2 md:gap-3 md:grid-cols-2">
        {reports.map((report) => (
          <Card
            key={report.id}
            className="cursor-pointer overflow-hidden transition-colors hover:border-primary/40"
            role="link"
            tabIndex={0}
            aria-label={`Abrir reporte ${report.id}`}
            onClick={() => router.push(`/reportes/${report.id}`)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault()
                router.push(`/reportes/${report.id}`)
              }
            }}
          >
            <CardContent className="flex flex-col gap-2 p-3 md:flex-row md:items-center md:justify-between md:gap-4 md:p-4">
              <div className="relative min-w-0 space-y-1 md:space-y-2">
                <div className="flex flex-nowrap items-center gap-1">
                  <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">#{report.id}</span>
                  <Badge variant={statusVariant(report.estado?.nombre)}>{report.estado?.nombre ?? "Sin estado"}</Badge>
                  {report.prioridad?.nombre && <Badge variant={getPriorityVariant(report.prioridad.nombre)} className="max-w-20 gap-1 px-1 text-[0.5rem] md:max-w-none md:px-1.5 md:text-[0.55rem]"><span className="shrink-0">{getPriorityIcon(report.prioridad.nombre)}</span><span className="truncate">{report.prioridad.nombre}</span></Badge>}
                  {report.categoria?.nombre && <Badge variant="category" className="max-w-28 gap-1 px-1 text-[0.5rem] md:max-w-none md:px-1.5 md:text-[0.55rem]"><span className="shrink-0">{getCategoryIcon(report.categoria.nombre, "size-3")}</span><span className="truncate">{report.categoria.nombre}</span></Badge>}
                </div>
                <p className="block truncate text-base font-semibold md:text-lg">{report.titulo}</p>
                <p className="line-clamp-2 text-xs text-muted-foreground md:text-sm">{report.descripcion || "Sin descripción"}</p>
                <p className="text-[0.7rem] text-muted-foreground md:text-xs">Creado por: <span className="font-medium text-foreground">{report.autor?.username || "Usuario sin nombre"}</span></p>
                <time className="block text-right text-[0.7rem] text-muted-foreground md:text-xs" dateTime={report.created_at}>{new Date(report.created_at).toLocaleDateString("es-AR")}</time>
              </div>
              <div className="flex min-w-0 items-center gap-2 md:justify-end" onClick={(event) => event.stopPropagation()}>
                <Select disabled={isPending && busyId === report.id} value={String(report.estado_id)} onValueChange={(value) => requestStatusChange(report.id, value, report.titulo)}>
                  <SelectTrigger aria-label={`Cambiar estado de ${report.titulo}`} className="min-w-0 flex-1 md:w-44 md:flex-none"><SelectValue /></SelectTrigger>
                  <SelectContent>{estados.map((option) => <SelectItem key={option.id} value={String(option.id)}>{option.nombre}</SelectItem>)}</SelectContent>
                </Select>
                <Button type="button" variant="destructive" size="icon-sm" aria-label={`Eliminar reporte ${report.id}`} disabled={isPending && busyId === report.id} onClick={() => removeReport(report.id)}><Trash2 /></Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {reports.length === 0 && <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">No hay reportes con estos filtros.</CardContent></Card>}
      </div>
      <AlertDialog open={Boolean(statusChange)} onOpenChange={(open) => !open && setStatusChange(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cambiar estado del reporte?</AlertDialogTitle>
            <AlertDialogDescription>El reporte “{statusChange?.reportTitle}” pasará a <strong>{statusChange?.stateName}</strong>.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={isPending} onClick={changeStatus}>Confirmar cambio</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
