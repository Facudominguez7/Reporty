"use client"

import { useState } from "react"
import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"
import { MapLoadingSkeleton } from "@/components/loading-skeletons"
import { Button } from "@/components/ui/button"
import { DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { ReporteDetalle } from "@/database/queries/reportes/[id]/index"
import { REPORT_IMAGE_ACCEPT_ATTR } from "@/lib/media/report-images"
import { optimizeReportImage } from "@/lib/media/optimize-report-image"
import { toast } from "sonner"
import { actualizarReporteAdminAction, quitarFotoReporteAdminAction, reemplazarFotoReporteAdminAction } from "./actions"

const EDITOR_MAP_HEIGHT = "h-48 sm:h-52"
const LocationPickerMap = dynamic(
  () => import("@/components/location-picker-map").then((module) => module.LocationPickerMap),
  { ssr: false, loading: () => <div className={`w-full ${EDITOR_MAP_HEIGHT}`}><MapLoadingSkeleton /></div> },
)

type ReporteEditable = Pick<ReporteDetalle, "id" | "titulo" | "descripcion" | "categoria_id" | "prioridad_id" | "lat" | "lon" | "fotos_reporte">
type Lookup = Array<{ id: number; nombre: string }>

type Props = {
  onOpenChange: (open: boolean) => void
  reporte: ReporteEditable
  categorias: Lookup
  prioridades: Lookup
}

export function AdminReportEditor({ onOpenChange, reporte, categorias, prioridades }: Props) {
  const router = useRouter()
  const [titulo, setTitulo] = useState(reporte.titulo)
  const [descripcion, setDescripcion] = useState(reporte.descripcion ?? "")
  const [categoriaId, setCategoriaId] = useState(reporte.categoria_id?.toString() ?? "")
  const [prioridadId, setPrioridadId] = useState(reporte.prioridad_id?.toString() ?? "")
  const [coordinates, setCoordinates] = useState({ lat: reporte.lat, lon: reporte.lon })
  const [saving, setSaving] = useState(false)
  const [busyPhotoId, setBusyPhotoId] = useState<number | null>(null)

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!categoriaId || !prioridadId) {
      toast.error("Elegí una categoría y una prioridad.")
      return
    }
    if ((coordinates.lat === null) !== (coordinates.lon === null)) {
      toast.error("Elegí un punto en el mapa o quitá la ubicación actual.")
      return
    }

    setSaving(true)
    const result = await actualizarReporteAdminAction(reporte.id, {
      titulo, descripcion, categoriaId: Number(categoriaId), prioridadId: Number(prioridadId), lat: coordinates.lat, lon: coordinates.lon,
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
    <DialogContent
      overlayClassName="z-[70]"
      className="z-[80] max-h-[calc(100dvh-0.5rem)] w-[calc(100%-0.5rem)] gap-2 overflow-y-auto p-2 sm:max-h-[calc(100dvh-1rem)] sm:w-[calc(100%-1rem)] sm:max-w-6xl sm:gap-3 sm:p-4"
    >
      <form onSubmit={save} className="space-y-1.5 sm:space-y-3">
        <DialogHeader className="pr-8">
          <DialogTitle className="text-sm sm:text-base">Editar reporte</DialogTitle>
          <DialogDescription className="text-xs leading-4 sm:text-sm sm:leading-5">Actualizá el contenido, la ubicación y las fotos. El estado se gestiona desde las herramientas de administrador.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.9fr)] sm:gap-3">
          <div className="min-w-0 space-y-2 sm:space-y-3">
            <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
              <div className="col-span-2 min-w-0 space-y-1 sm:space-y-2">
                <Label htmlFor="admin-report-title" className="text-xs sm:text-sm">Nombre</Label>
                <Input id="admin-report-title" value={titulo} onChange={(event) => setTitulo(event.target.value)} maxLength={120} required />
              </div>
              <div className="col-span-2 min-w-0 space-y-1 sm:space-y-2">
                <Label htmlFor="admin-report-description" className="text-xs sm:text-sm">Descripción</Label>
                <Textarea id="admin-report-description" value={descripcion} onChange={(event) => setDescripcion(event.target.value)} rows={2} className="min-h-16 resize-none text-sm sm:min-h-20" maxLength={5000} required />
              </div>
              <div className="min-w-0 space-y-1 sm:space-y-2">
                <Label htmlFor="admin-report-category" className="text-xs sm:text-sm">Categoría</Label>
                <Select value={categoriaId} onValueChange={setCategoriaId}>
                  <SelectTrigger id="admin-report-category" className="w-full min-w-0 text-xs sm:text-sm"><SelectValue placeholder="Elegir categoría" /></SelectTrigger>
                  <SelectContent>{categorias.map((item) => <SelectItem key={item.id} value={String(item.id)} className="text-xs sm:text-sm">{item.nombre}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="min-w-0 space-y-1 sm:space-y-2">
                <Label htmlFor="admin-report-priority" className="text-xs sm:text-sm">Prioridad</Label>
                <Select value={prioridadId} onValueChange={setPrioridadId}>
                  <SelectTrigger id="admin-report-priority" className="w-full min-w-0 text-xs sm:text-sm"><SelectValue placeholder="Elegir prioridad" /></SelectTrigger>
                  <SelectContent>{prioridades.map((item) => <SelectItem key={item.id} value={String(item.id)} className="text-xs sm:text-sm">{item.nombre}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="col-span-2 min-w-0 space-y-1 sm:space-y-2">
                <h3 id="admin-report-location" className="text-xs font-medium sm:text-sm">Ubicación</h3>
                <p className="text-xs leading-4 text-muted-foreground">Seleccioná un punto en el mapa. Solo se aceptan ubicaciones dentro del área de cobertura.</p>
                <div role="group" aria-labelledby="admin-report-location" className="overflow-hidden rounded-lg">
                  <LocationPickerMap
                    initialLat={coordinates.lat}
                    initialLon={coordinates.lon}
                    heightClassName={EDITOR_MAP_HEIGHT}
                    onLocationSelect={(lat, lon) => setCoordinates({ lat, lon })}
                  />
                </div>
                <p className="text-xs leading-4 text-muted-foreground">
                  {coordinates.lat !== null && coordinates.lon !== null ? "Ubicación seleccionada en el mapa." : "Sin ubicación seleccionada."}
                </p>
              </div>
            </div>
          </div>

          <section className="min-w-0 space-y-2 border-t border-border pt-2 sm:space-y-3 sm:pt-3 lg:border-l lg:border-t-0 lg:pl-3 lg:pt-0" aria-labelledby="admin-report-photos">
            <h3 id="admin-report-photos" className="text-sm font-semibold sm:text-base">Fotos</h3>
            {reporte.fotos_reporte.length ? (
              <div className="grid gap-1.5 sm:grid-cols-2 sm:gap-2">
                {reporte.fotos_reporte.map((foto, index) => (
                  <div key={foto.id} className="grid min-w-0 grid-cols-[4rem_minmax(0,1fr)] items-center gap-2 rounded-xl border border-border p-1.5 sm:grid-cols-[5rem_minmax(0,1fr)] sm:p-2">
                    <img src={foto.publicUrl ?? foto.url ?? "/placeholder.svg"} alt={`Foto ${index + 1} del reporte`} className="h-16 w-16 rounded-lg bg-muted object-contain sm:h-20 sm:w-20" />
                    <div className="min-w-0 space-y-1">
                      <Label htmlFor={`replace-photo-${foto.id}`} className="truncate text-xs sm:text-sm">Reemplazar foto {index + 1}</Label>
                      <Input id={`replace-photo-${foto.id}`} type="file" accept={REPORT_IMAGE_ACCEPT_ATTR} disabled={busyPhotoId !== null} onChange={(event) => void replacePhoto(foto.id, event.target.files?.[0], event.target)} className="h-10 w-full min-w-0 text-xs file:mr-1 file:px-1 file:text-xs" />
                      <Button type="button" variant="destructive" size="sm" disabled={busyPhotoId !== null} onClick={() => void removePhoto(foto.id)} className="h-10 min-h-10 w-full px-2 text-xs sm:text-sm">
                        {busyPhotoId === foto.id ? "Procesando…" : `Quitar foto ${index + 1}`}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : <p className="text-xs text-muted-foreground sm:text-sm">Este reporte no tiene fotos para reemplazar o quitar.</p>}
          </section>
        </div>

        <div className="flex flex-col-reverse gap-1.5 border-t border-border pt-2 sm:flex-row sm:gap-2 sm:pt-3 sm:justify-end">
          <Button type="button" variant="outline" disabled={saving || busyPhotoId !== null} onClick={() => onOpenChange(false)} className="min-h-10 px-2 text-xs sm:px-4 sm:text-sm">Cancelar</Button>
          <Button type="submit" disabled={saving || busyPhotoId !== null} className="min-h-10 px-2 text-xs sm:px-4 sm:text-sm">{saving ? "Guardando…" : "Guardar cambios"}</Button>
        </div>
      </form>
    </DialogContent>
  )
}
