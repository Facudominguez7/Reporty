"use client"

import Image from "next/image"
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
import type { AdminMascota } from "@/database/queries/admin/admin-mascotas"
import { cambiarEstadoMascotaAdminAction, retirarMascotaAdminAction } from "@/app/dashboard/moderacion/actions"

type Option = { id: string; nombre: string }
type Props = { mascotas: AdminMascota[]; estados: Option[]; tipos: Option[]; search?: string; estado?: string; tipo?: string; dentroDeReportes?: boolean }

export function MascotasAdminTable({ mascotas, estados, tipos, search = "", estado = "all", tipo = "all", dentroDeReportes = false }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<number | null>(null)
  const [confirmation, setConfirmation] = useState<AdminMascota | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)

  const updateQuery = (key: string, value: string) => {
    const params = new URLSearchParams()
    if (dentroDeReportes) params.set("vista", "mascotas")
    if (key !== "search" && search) params.set("search", search)
    if (key !== "estado" && estado !== "all") params.set("estado", estado)
    if (key !== "tipo" && tipo !== "all") params.set("tipo", tipo)
    if (value && value !== "all") params.set(key, value)
    startTransition(() => router.push(`${dentroDeReportes ? "/admin/reportes" : "/admin/mascotas"}${params.size ? `?${params}` : ""}`))
  }

  const changeStatus = (pet: AdminMascota, next: string) => startTransition(async () => {
    setBusyId(pet.id)
    const result = await cambiarEstadoMascotaAdminAction(pet.id, next)
    setBusyId(null)
    if (!result.exito) { toast.error(result.mensaje); return }
    toast.success(result.mensaje)
    router.refresh()
  })

  const retire = () => {
    if (!confirmation) return
    const id = confirmation.id
    startTransition(async () => {
      setBusyId(id)
      const result = await retirarMascotaAdminAction(id)
      setBusyId(null)
      if (!result.exito) { toast.error(result.mensaje); return }
      toast.success(result.mensaje)
      setConfirmation(null)
      router.refresh()
    })
  }

  return <div className="space-y-4">
    <div className="flex justify-end md:hidden"><Button type="button" variant="filter" size="sm" className="w-full" onClick={() => setFiltersOpen((value) => !value)}>{filtersOpen ? <X /> : <Filter />}{filtersOpen ? "Ocultar filtros" : "Mostrar filtros"}</Button></div>
    <Card className={filtersOpen ? "block" : "hidden md:block"}><CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-end">
      <label className="flex-1 space-y-1.5 text-sm font-medium">Buscar<div className="relative"><Search className="absolute left-3 top-3 size-4 text-muted-foreground" aria-hidden="true"/><Input defaultValue={search} className="pl-9" placeholder="Descripción" onKeyDown={(event) => { if (event.key === "Enter") updateQuery("search", event.currentTarget.value.trim()) }} /></div></label>
      <label className="space-y-1.5 text-sm font-medium">Estado<Select value={estado} onValueChange={(value) => updateQuery("estado", value)}><SelectTrigger className="w-full md:w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos</SelectItem>{estados.map((option) => <SelectItem key={option.id} value={option.id}>{option.nombre}</SelectItem>)}</SelectContent></Select></label>
      <label className="space-y-1.5 text-sm font-medium">Tipo<Select value={tipo} onValueChange={(value) => updateQuery("tipo", value)}><SelectTrigger className="w-full md:w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos</SelectItem>{tipos.map((option) => <SelectItem key={option.id} value={option.id}>{option.nombre}</SelectItem>)}</SelectContent></Select></label>
    </CardContent></Card>
    <div className="grid gap-2 md:grid-cols-2 md:gap-3">
      {mascotas.map((pet) => <Card key={pet.id} className="cursor-pointer overflow-hidden transition-colors hover:border-primary/40" role="link" tabIndex={0} aria-label={`Abrir mascota ${pet.id}`} onClick={() => router.push(`/mascotas/${pet.id}`)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); router.push(`/mascotas/${pet.id}`) } }}>
        <CardContent className="flex items-center gap-2 p-3 md:gap-4 md:p-4">
          <div className="size-16 flex-none overflow-hidden rounded-xl bg-surface-subtle md:size-20"><Image src={`/api/mascotas/${pet.id}/foto`} alt="" width={80} height={80} sizes="(min-width: 768px) 80px, 64px" className="h-full w-full object-cover" /></div>
          <div className="relative min-w-0 flex-1 space-y-1 md:space-y-2">
            <div className="flex flex-wrap items-center gap-1"><span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">#{pet.id}</span><Badge variant={pet.estado === "perdida" ? "destructive" : "primary"}>{pet.estado === "perdida" ? "Perdida" : "Encontrada"}</Badge><Badge variant="category" className="capitalize">{pet.tipo_animal === "otro" ? "Otro animal" : pet.tipo_animal}</Badge>{pet.retirada_at && <Badge variant="secondary">Retirada</Badge>}</div>
            <p className="line-clamp-2 text-base font-semibold md:text-lg">{pet.descripcion}</p>
            <time className="block text-[0.7rem] text-muted-foreground md:text-xs" dateTime={pet.publicada_at}>Publicada: {new Date(pet.publicada_at).toLocaleDateString("es-AR")}</time>
          </div>
          <div className="flex min-w-0 items-center gap-2 md:justify-end" onClick={(event) => event.stopPropagation()}>
            <Select disabled={pending || busyId === pet.id || Boolean(pet.retirada_at)} value={pet.estado} onValueChange={(value) => changeStatus(pet, value)}><SelectTrigger aria-label={`Cambiar estado de mascota ${pet.id}`} className="min-w-0 w-28 md:w-36"><SelectValue /></SelectTrigger><SelectContent>{estados.map((option) => <SelectItem key={option.id} value={option.id}>{option.nombre}</SelectItem>)}</SelectContent></Select>
            <Button type="button" variant="destructive" size="icon-sm" aria-label={`Retirar mascota ${pet.id}`} disabled={pending || busyId === pet.id || Boolean(pet.retirada_at)} onClick={() => setConfirmation(pet)}><Trash2 /></Button>
          </div>
        </CardContent>
      </Card>)}
      {mascotas.length === 0 && <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">No hay mascotas con estos filtros.</CardContent></Card>}
    </div>
    <AlertDialog open={Boolean(confirmation)} onOpenChange={(open) => !open && setConfirmation(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>¿Retirar esta publicación?</AlertDialogTitle><AlertDialogDescription>La mascota #{confirmation?.id} dejará de estar publicada. Se conservarán sus registros e historial.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel><AlertDialogAction disabled={pending} onClick={retire}>Confirmar retiro</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>
}
