"use client"

import { useState } from "react"
import dynamic from "next/dynamic"
import Image from "next/image"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, Calendar, CircleCheck, MapPin, PawPrint, Pencil, Phone, Share2, Trash2, TriangleAlert } from "lucide-react"
import { ChipReporte, TONO_CATEGORIA } from "@/components/report-detail/chip-reporte"
import { describirAntiguedad, ZONA_HORARIA_APP } from "@/lib/fechas/antiguedad"
import { PageTitleBar } from "@/components/page-title-bar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { shareReport } from "@/lib/share/share-report"
import { datosHistoriaMascota, generarImagenHistoria } from "@/lib/share/historia-instagram"
import { useHistoriaInstagram } from "@/components/share/use-historia-instagram"
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

/** Botón de la barra de acciones: ícono arriba y texto abajo, igual que en la ficha del reporte. */
const CLASE_ACCION = "aspect-square h-auto min-h-11 w-16 flex-col gap-1 whitespace-normal rounded-full px-1 text-center text-[10px] leading-tight text-muted-foreground hover:bg-muted"
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
  const historia = useHistoriaInstagram(crearArchivoHistoria, (resultado) => {
    setError(""); setMessage("")
    if (resultado === "descargada") setMessage("Imagen descargada: subila a tu historia de Instagram.")
    if (resultado === "error") setError("No pudimos armar la imagen. Probá compartir el enlace.")
  })
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
  /** Genera la imagen de la historia de la mascota (la pide `useHistoriaInstagram`). */
  async function crearArchivoHistoria() {
    const blob = await generarImagenHistoria(
      datosHistoriaMascota({ especie: pet.species, estado: pet.status, descripcion: pet.description ?? "", direccion: pet.address ?? null, fotoUrl: pet.image ?? null }),
      getComputedStyle(document.body).fontFamily,
    )
    return new File([blob], `reporty-mascota-${pet.id}.png`, { type: "image/png" })
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
          {/* Mismo formato que la ficha del reporte: fecha, chips, título, descripción, foto, contacto y barra de acciones. */}
          <CardHeader className="gap-3 pb-4">
            <div className="col-span-full flex flex-wrap items-center gap-1.5 border-b border-border pb-2 text-xs text-muted-foreground">
              <Calendar className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="min-w-0">Publicada el día <time dateTime={pet.createdAt}>{new Date(pet.createdAt).toLocaleDateString("es-AR", { year: "numeric", month: "short", day: "numeric", timeZone: ZONA_HORARIA_APP })}</time> <span className="font-bold">({describirAntiguedad(new Date(pet.createdAt))})</span></span>
            </div>
            <div className="flex w-full flex-wrap items-center gap-1.5">
              {editing ? <label className="grid gap-1 text-xs">Estado<select aria-label="Estado" className="min-h-10 rounded-md border bg-background px-3" value={draft.estado} onChange={(e) => setDraft({ ...draft, estado: e.target.value })} disabled={pending}><option value="perdida">Perdida</option><option value="encontrada">Encontrada</option></select></label> : <ChipReporte etiqueta="Estado" tono={pet.status === "Perdida" ? "var(--destructive)" : "var(--primary)"} icono={pet.status === "Perdida" ? <TriangleAlert aria-hidden="true" /> : <CircleCheck aria-hidden="true" />} valor={statusLabel} />}
              {!editing && <ChipReporte etiqueta="Animal" tono={TONO_CATEGORIA} icono={<PawPrint aria-hidden="true" />} valor={pet.species} />}
            </div>
            <div className="flex min-w-0 items-start gap-3">
              {editing ? <label className="grid min-w-0 flex-1 gap-1 text-sm">Tipo de animal<select aria-label="Tipo de animal" className="min-h-10 rounded-md border bg-background px-3" value={draft.tipoAnimal} onChange={(e) => setDraft({ ...draft, tipoAnimal: e.target.value })} disabled={pending}><option value="perro">Perro</option><option value="gato">Gato</option><option value="otro">Otro</option></select></label> : <CardTitle className="min-w-0 flex-1 break-words text-xl font-bold tracking-tight md:text-2xl">{pet.species} {statusLabel.toLowerCase()}</CardTitle>}
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
            {editing ? <label className="grid gap-1 text-sm">Teléfono público<Input type="tel" inputMode="numeric" maxLength={40} value={draft.telefono} onChange={(e) => setDraft({ ...draft, telefono: e.target.value.replace(/[^0-9]/g, "") })} disabled={pending} /></label> : <div className="flex items-center gap-2 text-xs text-muted-foreground"><span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted" aria-hidden="true"><Phone className="size-3" /></span><span className="min-w-0 break-words">Teléfono público: <a className="font-medium text-foreground underline" href={`tel:${pet.phone}`}>{pet.phone}</a></span></div>}
            {pet.coordinates && <a href="#mascota-ubicacion" className="mt-3 flex w-fit items-center gap-1 text-xs font-semibold underline lg:hidden"><MapPin className="size-3 shrink-0" aria-hidden="true" /><span className="line-clamp-1">{pet.address ?? "Ver ubicación"}</span></a>}
            <div className="mt-3">
              <hr className="mb-2 border-border" />
              <div role="group" aria-label="Acciones sobre la publicación" className="flex flex-wrap justify-center gap-4">
                <MenuCompartir onAbrir={historia.preparar} onCompartirEnlace={share} onCompartirHistoria={historia.compartir}><Button type="button" variant="ghost" size="xs" className={CLASE_ACCION} aria-label="Compartir publicación"><Share2 className="size-4" aria-hidden="true" />Compartir</Button></MenuCompartir>
                {isOwner && pet.status === "Perdida" && <AlertDialog><AlertDialogTrigger asChild><Button type="button" variant="ghost" size="xs" className={`${CLASE_ACCION} text-primary hover:bg-primary/10`} disabled={pending || editing}><CircleCheck className="size-4" aria-hidden="true" />Marcar encontrada</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>¿Marcar como encontrada?</AlertDialogTitle><AlertDialogDescription>Este cambio es definitivo y no se puede deshacer.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={found}>Confirmar</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>}
                {(isOwner && pet.status === "Perdida" || isAdmin) && <AlertDialog><AlertDialogTrigger asChild><Button type="button" variant="ghost" size="xs" className={`${CLASE_ACCION} text-destructive hover:bg-destructive/10`} disabled={pending || editing} aria-label="Retirar publicación"><Trash2 className="size-4" aria-hidden="true" />Retirar</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>¿Retirar publicación?</AlertDialogTitle><AlertDialogDescription>La publicación dejará de aparecer públicamente y se conservará su historial.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={retire}>Retirar</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>}
              </div>
            </div>
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
