"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { ReporteDetalle } from "@/database/queries/reportes/[id]/index"
import { REPORT_IMAGE_ACCEPT_ATTR } from "@/lib/media/report-images"
import { optimizeReportImage } from "@/lib/media/optimize-report-image"
import { toast } from "sonner"
import { actualizarReporteAdminAction, quitarFotoReporteAdminAction, reemplazarFotoReporteAdminAction } from "./actions"

type ReporteEditable = Pick<ReporteDetalle, "id" | "titulo" | "descripcion" | "categoria_id" | "prioridad_id" | "lat" | "lon" | "fotos_reporte">
type Lookup = Array<{ id: number; nombre: string }>

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  reporte: ReporteEditable
  categorias: Lookup
  prioridades: Lookup
}

function coordinateValue(value: string) {
  if (!value.trim()) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : Number.NaN
}

export function AdminReportEditor({ open, onOpenChange, reporte, categorias, prioridades }: Props) {
  const router = useRouter()
  const [titulo, setTitulo] = useState(reporte.titulo)
  const [descripcion, setDescripcion] = useState(reporte.descripcion ?? "")
  const [categoriaId, setCategoriaId] = useState(reporte.categoria_id?.toString() ?? "")
  const [prioridadId, setPrioridadId] = useState(reporte.prioridad_id?.toString() ?? "")
  const [lat, setLat] = useState(reporte.lat?.toString() ?? "")
  const [lon, setLon] = useState(reporte.lon?.toString() ?? "")
  const [saving, setSaving] = useState(false)
  const [busyPhotoId, setBusyPhotoId] = useState<number | null>(null)

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const latitude = coordinateValue(lat)
    const longitude = coordinateValue(lon)
    if (!categoriaId || !prioridadId) {
      toast.error("Elegí una categoría y una prioridad.")
      return
    }
    if (Number.isNaN(latitude) || Number.isNaN(longitude) || (latitude === null) !== (longitude === null)) {
      toast.error("Ingresá ambas coordenadas o dejá las dos vacías.")
      return
    }

    setSaving(true)
    const result = await actualizarReporteAdminAction(reporte.id, {
      titulo, descripcion, categoriaId: Number(categoriaId), prioridadId: Number(prioridadId), lat: latitude, lon: longitude,
    })
    setSaving(false)
    if (!result.success) {
      toast.error("No se pudieron guardar los cambios", { description: result.error })
      return
    }
    toast.success("Reporte actualizado")
    onOpenChange(false)
    router.refresh()
  }

  const replacePhoto = async (fotoId: number, selected: File | undefined, input: HTMLInputElement) => {
    if (!selected) return
    setBusyPhotoId(fotoId)
    try {
      const optimized = await optimizeReportImage(selected)
      const result = await reemplazarFotoReporteAdminAction(reporte.id, fotoId, optimized.file)
      if (!result.success) {
        toast.error("No se pudo enviar el reemplazo", { description: result.error })
        return
      }
      if (result.data.estado === "REJECTED" || result.data.estado === "ERROR_PRIVADO") {
        toast.error("La foto no pudo reemplazarse", { description: result.data.motivos[0] })
      } else if (result.data.publicada) {
        toast.success("Foto reemplazada")
      } else {
        toast.info("Foto enviada a revisión", { description: result.data.motivos[0] })
      }
      if (result.data.advertencias.length) {
        toast.error("La foto se publicó, pero quedó una limpieza pendiente.")
      }
      router.refresh()
    } catch (error) {
      toast.error("No se pudo procesar la foto", { description: error instanceof Error ? error.message : undefined })
    } finally {
      input.value = ""
      setBusyPhotoId(null)
    }
  }

  const removePhoto = async (fotoId: number) => {
    if (!window.confirm("¿Quitar esta foto del reporte? Esta acción no se puede deshacer.")) return
    setBusyPhotoId(fotoId)
    const result = await quitarFotoReporteAdminAction(reporte.id, fotoId)
    setBusyPhotoId(null)
    if (!result.success) {
      toast.error("No se pudo quitar la foto", { description: result.error })
      return
    }
    if (result.data.cleanupPending) toast.error("La foto se quitó del reporte, pero quedó pendiente limpiar el archivo.")
    else toast.success("Foto quitada")
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader className="pr-8">
          <DialogTitle>Editar reporte</DialogTitle>
          <DialogDescription>Actualizá el contenido, la ubicación y las fotos. El estado se gestiona desde las herramientas de administrador.</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="admin-report-title">Nombre</Label>
              <Input id="admin-report-title" value={titulo} onChange={(event) => setTitulo(event.target.value)} maxLength={120} required />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="admin-report-description">Descripción</Label>
              <Textarea id="admin-report-description" value={descripcion} onChange={(event) => setDescripcion(event.target.value)} rows={5} maxLength={5000} required />
            </div>
            <div className="space-y-2">
              <Label>Categoría</Label>
              <Select value={categoriaId} onValueChange={setCategoriaId}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Elegir categoría" /></SelectTrigger>
                <SelectContent>{categorias.map((item) => <SelectItem key={item.id} value={String(item.id)}>{item.nombre}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Prioridad</Label>
              <Select value={prioridadId} onValueChange={setPrioridadId}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Elegir prioridad" /></SelectTrigger>
                <SelectContent>{prioridades.map((item) => <SelectItem key={item.id} value={String(item.id)}>{item.nombre}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin-report-lat">Latitud</Label>
              <Input id="admin-report-lat" type="number" step="any" value={lat} onChange={(event) => setLat(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin-report-lon">Longitud</Label>
              <Input id="admin-report-lon" type="number" step="any" value={lon} onChange={(event) => setLon(event.target.value)} />
            </div>
          </div>

          <section className="space-y-3 border-t border-border pt-4" aria-labelledby="admin-report-photos">
            <h3 id="admin-report-photos" className="text-sm font-semibold">Fotos</h3>
            {reporte.fotos_reporte.length ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {reporte.fotos_reporte.map((foto, index) => (
                  <div key={foto.id} className="min-w-0 space-y-2 rounded-xl border border-border p-3">
                    <img src={foto.publicUrl ?? foto.url ?? "/placeholder.svg"} alt={`Foto ${index + 1} del reporte`} className="aspect-video w-full rounded-lg bg-muted object-contain" />
                    <div className="grid gap-2">
                      <Label htmlFor={`replace-photo-${foto.id}`} className="text-xs">Reemplazar foto {index + 1}</Label>
                      <Input id={`replace-photo-${foto.id}`} type="file" accept={REPORT_IMAGE_ACCEPT_ATTR} disabled={busyPhotoId !== null} onChange={(event) => void replacePhoto(foto.id, event.target.files?.[0], event.target)} />
                      <Button type="button" variant="destructive" size="sm" disabled={busyPhotoId !== null} onClick={() => void removePhoto(foto.id)}>
                        {busyPhotoId === foto.id ? "Procesando…" : `Quitar foto ${index + 1}`}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-muted-foreground">Este reporte no tiene fotos para reemplazar o quitar.</p>}
          </section>

          <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" disabled={saving || busyPhotoId !== null} onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={saving || busyPhotoId !== null}>{saving ? "Guardando…" : "Guardar cambios"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
