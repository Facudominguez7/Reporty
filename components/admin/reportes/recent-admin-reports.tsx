"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { Trash2 } from "lucide-react"
import { toast } from "sonner"

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { getCategoryIcon, getPriorityIcon, getPriorityVariant } from "@/components/report-card"
import type { AdminReport } from "@/database/queries/admin/admin-reportes"
import { cambiarEstadoReporteAction, eliminarReporteAction } from "@/app/admin/reportes/actions"

type Option = { id: number; nombre: string }

type Props = {
  reports: AdminReport[]
  estados: Option[]
}

function statusVariant(name: string | undefined) {
  const value = name?.toLowerCase()
  return value === "reparado" ? "reparado" : value === "rechazado" ? "rechazado" : "pendiente"
}


export function RecentAdminReports({ reports, estados }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<number | null>(null)
  const [statusChange, setStatusChange] = useState<{ reportId: number; stateId: number; reportTitle: string; stateName: string } | null>(null)

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

  if (reports.length === 0) {
    return <p className="rounded-xl border border-dashed border-border bg-muted/40 px-4 py-8 text-center text-sm text-muted-foreground">Todavía no hay reportes publicados.</p>
  }

  return (
    <>
      <div className="space-y-2">
      {reports.map((report) => (
        <Card
          key={report.id}
          className="cursor-pointer border-border/80 shadow-none transition-colors hover:border-primary/40"
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
          <div className="flex flex-col gap-2 p-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:p-3">
            <div className="relative min-w-0 space-y-0.5 sm:space-y-1">
              <div className="flex flex-nowrap items-center gap-1">
                <span className="shrink-0 text-xs font-semibold text-muted-foreground">#{report.id}</span>
                <Badge variant={statusVariant(report.estado?.nombre)}>{report.estado?.nombre ?? "Sin estado"}</Badge>
                {report.prioridad?.nombre && <Badge variant={getPriorityVariant(report.prioridad.nombre)} className="max-w-20 gap-1 px-1 text-[0.5rem]"><span className="shrink-0">{getPriorityIcon(report.prioridad.nombre)}</span><span className="truncate">{report.prioridad.nombre}</span></Badge>}
                {report.categoria?.nombre && <Badge variant="category" className="max-w-28 gap-1 px-1 text-[0.5rem]"><span className="shrink-0">{getCategoryIcon(report.categoria.nombre, "size-3")}</span><span className="truncate">{report.categoria.nombre}</span></Badge>}
              </div>
              <p className="truncate text-sm font-semibold">{report.titulo}</p>
              <p className="truncate text-[0.7rem] text-muted-foreground">Creado por: <span className="font-medium text-foreground">{report.autor?.username || "Usuario sin nombre"}</span></p>
              <time className="block text-right text-[0.7rem] text-muted-foreground" dateTime={report.created_at}>{new Date(report.created_at).toLocaleDateString("es-AR")}</time>
            </div>
            <div className="flex shrink-0 items-center gap-2 sm:justify-end" onClick={(event) => event.stopPropagation()}>
              <Select disabled={isPending && busyId === report.id} value={String(report.estado_id)} onValueChange={(value) => requestStatusChange(report.id, value, report.titulo)}>
                <SelectTrigger aria-label={`Cambiar estado de ${report.titulo}`} className="h-8 min-w-0 flex-1 text-xs sm:h-9 sm:w-36 sm:flex-none sm:text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{estados.map((estado) => <SelectItem key={estado.id} value={String(estado.id)}>{estado.nombre}</SelectItem>)}</SelectContent>
              </Select>
              <Button type="button" variant="destructive" size="icon-sm" aria-label={`Eliminar reporte ${report.id}`} disabled={isPending && busyId === report.id} onClick={() => removeReport(report.id)}><Trash2 /></Button>
            </div>
          </div>
        </Card>
      ))}
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
    </>
  )
}
