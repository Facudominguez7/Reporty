"use client"

import { useRef, useState } from "react"
import dynamic from "next/dynamic"
import Image from "next/image"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, Calendar, MapPin, PawPrint, Pencil, Share2, Trash2 } from "lucide-react"
import { PageTitleBar } from "@/components/page-title-bar"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { shareReport } from "@/lib/share/share-report"
import { compartirHistoria, datosHistoriaMascota, descargarArchivo, generarImagenHistoria } from "@/lib/share/historia-instagram"
import { MenuCompartir } from "@/components/report-detail/menu-compartir"
import { getPetStatusAdjective } from "@/lib/mascotas/status-label"
import { resolveReportesReturnTo } from "@/lib/reportes/navigation"
import { marcarMascotaEncontradaAction, retirarMascotaDetalleAction } from "./actions"
import { retirarMascotaAdminAction } from "./admin-actions"
import type { MascotaDetail } from "@/database/queries/mascotas/detalle"
import { editarMascotaAction } from "@/app/dashboard/moderacion/actions"
import { AdminReportEditActions } from "@/app/reportes/[id]/admin-report-editor"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

const MiniMap = dynamic(() => import("@/components/mini-map").then((m) => m.MiniMap), { ssr: false })
const LocationPickerMap = dynamic(() => import("@/components/location-picker-map").then((m) => m.LocationPickerMap), { ssr: false })

type Props = { pet: MascotaDetail; isOwner: boolean; isAdmin?: boolean }
function petDraft(pet: MascotaDetail) {
  return { tipoAnimal: pet.species === "Perro" ? "perro" : pet.species === "Gato" ? "gato" : "otro", descripcion: pet.description, lat: pet.coordinates?.[0]?.toString() ?? "", lon: pet.coordinates?.[1]?.toString() ?? "", telefono: pet.phone, estado: pet.status === "Perdida" ? "perdida" : "encontrada" }
}

export function DetalleMascota({ pet, isOwner, isAdmin = false }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const backHref = resolveReportesReturnTo(searchParams.get("returnTo"), "/reportes?vista=mascotas")
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [pending, setPending] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(() => petDraft(pet))
  const historiaPendiente = useRef<Promise<File> | null>(null)
  const statusLabel = getPetStatusAdjective(pet.status)

  async function saveAdmin() {
    if (JSON.stringify(draft) === JSON.stringify(petDraft(pet))) { setError("No hay cambios para guardar."); return }
    if (!draft.lat.trim() || !draft.lon.trim()) { setError("Ingresá la ubicación de la mascota."); return }
    setPending(true); setError(""); setMessage("")
    try {
      const result = await editarMascotaAction({ id: pet.id, ...draft, tipoAnimal: draft.tipoAnimal as "perro" | "gato" | "otro", estado: draft.estado as "perdida" | "encontrada", lat: Number(draft.lat), lon: Number(draft.lon) })
      if (!result.exito) { setError(result.mensaje); return }
      setEditing(false); setMessage(result.mensaje); router.refresh()
    } catch { setError("No pudimos actualizar la publicación. Intentá nuevamente.") }
    finally { setPending(false) }
  }

  async function share() {
    setError("")
    const outcome = await shareReport({ title: `${pet.species} ${statusLabel.toLowerCase()}`, text: `Mirá esta mascota en Reporty: ${pet.species} ${statusLabel.toLowerCase()}`, url: window.location.href }, navigator)
    if (outcome === "failed") setError("No pudimos compartir el enlace.")
    if (outcome === "copied") setMessage("Enlace copiado.")
  }
  /**
   * Genera la imagen de la historia al abrir el menú, para que `navigator.share`
   * quede pegado al toque (Safari lo exige). Si falla, el próximo intento la rehace.
   */
  function prepararHistoria() {
    if (historiaPendiente.current) return
    const pendiente = generarImagenHistoria(
      datosHistoriaMascota({ especie: pet.species, estado: pet.status, descripcion: pet.description ?? "", direccion: pet.address ?? null, fotoUrl: pet.image ?? null, url: `${window.location.origin}/mascotas/${pet.id}` }),
      getComputedStyle(document.body).fontFamily,
    ).then((blob) => new File([blob], `reporty-mascota-${pet.id}.png`, { type: "image/png" }))
    pendiente.catch(() => { historiaPendiente.current = null })
    historiaPendiente.current = pendiente
  }

  /** Comparte la imagen vertical en el menú del sistema o la descarga, con el link copiado. */
  async function compartirHistoriaMascota() {
    setError(""); setMessage("")
    prepararHistoria()
    try {
      const resultado = await compartirHistoria(await historiaPendiente.current!, `${window.location.origin}/mascotas/${pet.id}`, navigator, descargarArchivo)
      if (resultado === "compartida") setMessage("Link copiado: en la historia, tocá el sticker «Enlace» y pegalo.")
      if (resultado === "descargada") setMessage("Imagen descargada: subila a tu historia. El link quedó copiado para el sticker «Enlace».")
    } catch { setError("No pudimos armar la imagen. Probá compartir el enlace.") }
  }
  async function found() {
    setPending(true); setError(""); setMessage("")
    try {
      const result = await marcarMascotaEncontradaAction(pet.id)
      if (!result.success) { setError(result.error); return }
      setMessage("La mascota fue marcada como encontrada."); router.refresh()
    } catch { setError("No pudimos marcar la mascota como encontrada. Intentá nuevamente.") }
    finally { setPending(false) }
  }
  async function retire() {
    setPending(true); setError(""); setMessage("")
    try {
      const result = isAdmin ? await retirarMascotaAdminAction(pet.id) : await retirarMascotaDetalleAction(pet.id)
      if (!result.success) { setError(result.error); return }
      router.push("/mapa")
    } catch { setError("No pudimos retirar la publicación. Intentá nuevamente.") }
    finally { setPending(false) }
  }

  return <main className="page-shell"><div className="page-container space-y-4 md:space-y-6 lg:space-y-8">
    <section className="space-y-3">
      <PageTitleBar leading={<Button asChild variant="ghost" size="icon" aria-label="Volver a publicaciones"><Link href={backHref}><ArrowLeft className="size-4" /></Link></Button>} icon={<PawPrint className="size-4" />} title="Detalle de la mascota" description="Consultá los datos de la publicación." />
    </section>
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
      <div className="space-y-4 lg:col-span-8">
        <Card className="gap-0">
          <CardHeader className="pb-3">
            <div className="col-span-full mb-1 flex items-center gap-1.5 border-b border-border pb-1 text-xs text-muted-foreground">
              <Calendar className="size-3.5 shrink-0" aria-hidden="true" />
              <span>Publicada el día <time dateTime={pet.createdAt}>{new Date(pet.createdAt).toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}</time></span>
            </div>
            <div className="flex flex-wrap items-center gap-1">
              {editing ? <label className="grid gap-1 text-xs">Estado<select aria-label="Estado" className="min-h-10 rounded-md border bg-background px-3" value={draft.estado} onChange={(e) => setDraft({ ...draft, estado: e.target.value })} disabled={pending}><option value="perdida">Perdida</option><option value="encontrada">Encontrada</option></select></label> : <Badge variant={pet.status === "Perdida" ? "destructive" : "primary"} className="flex flex-col items-start gap-1 px-2 py-1 text-[10px] leading-none"><span className="text-[8px] font-medium normal-case leading-none tracking-normal opacity-90">Estado</span><span>{statusLabel}</span></Badge>}
            </div>
            <div className="flex min-w-0 items-start gap-3">
              {editing ? <label className="grid min-w-0 flex-1 gap-1 text-sm">Tipo de animal<select aria-label="Tipo de animal" className="min-h-10 rounded-md border bg-background px-3" value={draft.tipoAnimal} onChange={(e) => setDraft({ ...draft, tipoAnimal: e.target.value })} disabled={pending}><option value="perro">Perro</option><option value="gato">Gato</option><option value="otro">Otro</option></select></label> : <CardTitle className="min-w-0 flex-1 break-words text-xl font-bold tracking-tight md:text-2xl">{pet.species} {statusLabel.toLowerCase()}</CardTitle>}
              <MenuCompartir onAbrir={prepararHistoria} onCompartirEnlace={share} onCompartirHistoria={compartirHistoriaMascota}><Button type="button" variant="outline" size="icon" className="size-10 shrink-0" aria-label="Compartir publicación" title="Compartir publicación"><Share2 className="size-4" /></Button></MenuCompartir>
              {(isOwner && pet.status === "Perdida" || isAdmin) && <AlertDialog><AlertDialogTrigger asChild><Button type="button" variant="destructive" size="icon" className="size-10 shrink-0" disabled={pending || editing} aria-label="Retirar publicación" title="Retirar publicación"><Trash2 className="size-4" aria-hidden="true" /></Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>¿Retirar publicación?</AlertDialogTitle><AlertDialogDescription>La publicación dejará de aparecer públicamente y se conservará su historial.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={retire}>Retirar</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>}
              {isAdmin && !editing && <Button type="button" variant="ghost" size="icon" className="size-10 shrink-0 text-muted-foreground" onClick={() => { setDraft(petDraft(pet)); setError(""); setEditing(true) }} aria-label="Editar publicación" title="Editar publicación"><Pencil className="size-4" /></Button>}
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {editing ? <label className="mb-4 grid gap-1 text-sm">Descripción<Textarea value={draft.descripcion} maxLength={5000} onChange={(e) => setDraft({ ...draft, descripcion: e.target.value })} disabled={pending} /></label> : <p className="mb-4 whitespace-pre-wrap break-words text-xs leading-relaxed text-foreground">{pet.description}</p>}
            <div className="mb-4 flex flex-col items-center gap-3 md:mb-6 lg:mb-8">
              <div className="relative aspect-video w-full max-w-2xl overflow-hidden rounded-md bg-[var(--surface-subtle)] md:rounded-lg lg:rounded-xl">
                <Image src={pet.image} alt={`Foto de ${pet.species.toLowerCase()}`} fill sizes="(max-width: 1024px) 100vw, 60vw" className="object-contain" priority />
              </div>
            </div>
            {editing ? <label className="grid gap-1 text-sm">Teléfono público<Input type="tel" inputMode="numeric" maxLength={40} value={draft.telefono} onChange={(e) => setDraft({ ...draft, telefono: e.target.value.replace(/[^0-9]/g, "") })} disabled={pending} /></label> : <p className="break-words text-sm">Teléfono público: <a className="font-medium underline" href={`tel:${pet.phone}`}>{pet.phone}</a></p>}
            {pet.coordinates && <a href="#mascota-ubicacion" className="mx-auto mt-3 flex w-fit items-center gap-1 text-xs font-semibold underline lg:hidden"><MapPin className="size-3 shrink-0" aria-hidden="true" /><span className="line-clamp-1">{pet.address ?? "Ver ubicación"}</span></a>}
            {isOwner && pet.status === "Perdida" && <div className="mt-3 flex flex-col gap-3 border-t border-border pt-3 sm:flex-row">
              {pet.status === "Perdida" && <AlertDialog><AlertDialogTrigger asChild><Button disabled={pending}>Marcar encontrada</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>¿Marcar como encontrada?</AlertDialogTitle><AlertDialogDescription>Este cambio es definitivo y no se puede deshacer.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={found}>Confirmar</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>}
            </div>}
            {error && <Alert variant="destructive" className="mt-3"><AlertDescription role="alert">{error}</AlertDescription></Alert>}
            {message && <Alert className="mt-3"><AlertDescription role="status">{message}</AlertDescription></Alert>}
            {isAdmin && editing && <AdminReportEditActions saving={pending} onSave={() => void saveAdmin()} onCancel={() => { setEditing(false); setError(""); setDraft(petDraft(pet)) }} errorMessage={error} />}
          </CardContent>
        </Card>

      </div>
      {(pet.coordinates || (isAdmin && editing)) && <div className="space-y-4 md:space-y-6 lg:col-span-4">
        <Card id="mascota-ubicacion" className="scroll-mt-4">
          <CardHeader className="pb-3"><CardTitle className="text-base md:text-lg">Ubicación</CardTitle></CardHeader>
          <CardContent className="pt-0">
            {pet.address && !(isAdmin && editing) && <p className="mb-3 flex items-start gap-2 text-sm font-medium text-foreground"><MapPin className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" /><span>{pet.address}</span></p>}
            {isAdmin && editing ? <fieldset disabled={pending} className={pending ? "pointer-events-none opacity-70" : ""}>
              <legend className="text-xs font-medium text-muted-foreground">Ubicación</legend>
              <p className="mb-2 text-xs text-muted-foreground">Elegí un punto en el mapa. Con el teclado, mové el mapa con las flechas y seleccioná su centro.</p>
              <LocationPickerMap initialLat={draft.lat ? Number(draft.lat) : null} initialLon={draft.lon ? Number(draft.lon) : null} heightClassName="h-48" keyboardSelection onLocationSelect={(lat, lon) => setDraft((current) => ({ ...current, lat: String(lat), lon: String(lon) }))} />
            </fieldset> : pet.coordinates && <Link href="/mapa" className="group block w-full" aria-label="Ver ubicación en el mapa completo">
              <div className="relative aspect-square overflow-hidden rounded-md border shadow-sm md:rounded-lg">
                <MiniMap lat={pet.coordinates[0]} lon={pet.coordinates[1]} />
                <div className="absolute inset-x-2 bottom-2 rounded-md border bg-background/95 p-2 shadow-lg md:inset-x-3 md:bottom-3"><div className="flex items-center gap-2 text-xs text-foreground"><MapPin className="size-4 shrink-0 text-primary" /><span className="font-medium">Ver en mapa completo</span></div></div>
              </div>
            </Link>}
          </CardContent>
        </Card>
      </div>}
    </div>
  </div></main>
}
