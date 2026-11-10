"use client"

import dynamic from "next/dynamic"
import Link from "next/link"
import { InvitacionDonar } from "@/components/donaciones/invitacion-donar"
import { useEffect, useRef, useState, type FormEvent, type ChangeEvent } from "react"
import { useRouter } from "next/navigation"
import { AlertCircle, CheckCircle2, CircleX, FilePlus2, LoaderCircle, MapPin, PawPrint, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { PageTitleBar } from "@/components/page-title-bar"
import { MapLoadingSkeleton } from "@/components/loading-skeletons"
import { optimizeReportImage } from "@/lib/media/optimize-report-image"
import { crearMascotaAction } from "./actions"

const LocationPickerMap = dynamic(
  () => import("@/components/location-picker-map").then((module) => module.LocationPickerMap),
  { ssr: false, loading: () => <MapLoadingSkeleton className="rounded-md" /> },
)

type Moderation = "APPROVED" | "PENDING" | "REVIEW" | "REJECTED"

export function PetModerationDialog({ moderation, message, open, onOpenChange }: {
  moderation: "PENDING" | "REVIEW" | "REJECTED"; message: string; open: boolean; onOpenChange: (open: boolean) => void
}) {
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="gap-3">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 pr-8">
          {moderation === "REJECTED" ? <CircleX className="size-5 text-destructive" aria-hidden="true" /> : <AlertCircle className="size-5 text-amber-600" aria-hidden="true" />}
          {moderation === "REJECTED" ? "La foto no fue aprobada" : moderation === "REVIEW" ? "Revisión pendiente" : "Publicación pendiente"}
        </DialogTitle>
        <DialogDescription>{message}</DialogDescription>
      </DialogHeader>
      <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
    </DialogContent>
  </Dialog>
}

export function FormularioMascota() {
  const router = useRouter()
  const lock = useRef(false)
  const formRef = useRef<HTMLFormElement>(null)
  const [tipoAnimal, setTipoAnimal] = useState("")
  const [descripcion, setDescripcion] = useState("")
  const [telefono, setTelefono] = useState("")
  const [lat, setLat] = useState<number | null>(null)
  const [lon, setLon] = useState<number | null>(null)
  const [image, setImage] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [imageError, setImageError] = useState("")
  const [optimizingImage, setOptimizingImage] = useState(false)
  const [publicPhoneConfirmed, setPublicPhoneConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [moderation, setModeration] = useState<Moderation | null>(null)
  const [message, setMessage] = useState("")
  const [createdPet, setCreatedPet] = useState<{ mascotaId: number; pointsAwarded: number } | null>(null)
  const [showResultDialog, setShowResultDialog] = useState(false)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const redirected = useRef(false)

  useEffect(() => () => {
    if (imagePreview) URL.revokeObjectURL(imagePreview)
  }, [imagePreview])

  const handleResultDialogOpenChange = (open: boolean) => {
    setShowResultDialog(open)
    if (!open && !redirected.current) {
      redirected.current = true
      router.push("/mapa")
    }
  }

  const startOver = () => {
    setTipoAnimal("")
    setDescripcion("")
    setTelefono("")
    setLat(null)
    setLon(null)
    setImage(null)
    setImagePreview(null)
    setImageError("")
    setOptimizingImage(false)
    setPublicPhoneConfirmed(false)
    setModeration(null)
    setMessage("")
    setShowResultDialog(false)
    setError("")
    formRef.current?.reset()
  }

  const handleImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return
    setImageError("")
    setImage(null)
    setImagePreview(null)
    setOptimizingImage(true)
    try {
      const optimized = await optimizeReportImage(file)
      setImage(optimized.file)
      setImagePreview(URL.createObjectURL(optimized.file))
    } catch (cause) {
      setImageError(cause instanceof Error ? cause.message : "No pudimos procesar la foto.")
    } finally {
      setOptimizingImage(false)
    }
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (lock.current || optimizingImage || moderation !== null) return
    setError("")
    if (lat === null || lon === null || !image || !tipoAnimal || !descripcion.trim() || !telefono.trim() || !publicPhoneConfirmed) return
    setShowConfirmDialog(true)
  }

  const confirmSubmit = async () => {
    if (lock.current || optimizingImage || moderation !== null || lat === null || lon === null || !image || !tipoAnimal || !descripcion.trim() || !telefono.trim() || !publicPhoneConfirmed) return
    lock.current = true
    setShowConfirmDialog(false)
    setBusy(true)
    try {
      const payload = new FormData()
      payload.set("tipoAnimal", tipoAnimal)
      payload.set("descripcion", descripcion)
      payload.set("lat", String(lat))
      payload.set("lon", String(lon))
      payload.set("telefono", telefono)
      payload.set("image", image)
      const result = await crearMascotaAction(payload)
      if (!result.success) {
        setError(result.error)
        return
      }
      setModeration(result.data.moderation === "APPROVED" && (!Number.isSafeInteger(result.data.mascotaId) || result.data.mascotaId! <= 0) ? "PENDING" : result.data.moderation)
      setMessage(result.data.moderation === "APPROVED" && (!Number.isSafeInteger(result.data.mascotaId) || result.data.mascotaId! <= 0)
        ? "La publicación quedó pendiente. No la vuelvas a enviar; necesita revisión administrativa."
        : result.data.message)
      setShowResultDialog(true)
      if (result.data.moderation === "APPROVED" && Number.isSafeInteger(result.data.mascotaId) && result.data.mascotaId! > 0) {
        setCreatedPet({ mascotaId: result.data.mascotaId!, pointsAwarded: result.data.pointsAwarded })
        router.refresh()
      }
    } catch {
      setError("No pudimos procesar la publicación. Revisá tu conexión e intentá nuevamente.")
    } finally {
      lock.current = false
      setBusy(false)
    }
  }

  if (createdPet) {
    return (
      <div className="page-shell flex items-center justify-center px-4">
        <Button type="button" variant="outline" onClick={() => setShowResultDialog(true)}>Ver resultado de la publicación</Button>
        <Dialog open={showResultDialog} onOpenChange={handleResultDialogOpenChange}>
          <DialogContent className="gap-3">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 pr-8"><CheckCircle2 className="size-5 text-primary" aria-hidden="true" />Mascota publicada en Reporty</DialogTitle>
              <DialogDescription>{createdPet.pointsAwarded > 0 ? `Gracias por ayudar. Sumaste ${createdPet.pointsAwarded} puntos.` : "Gracias por compartir la publicación."}</DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-2">
              <Button asChild size="sm" className="min-w-0 whitespace-normal [overflow-wrap:anywhere] text-center"><Link href="/reportes?vista=mascotas">Ver mascotas</Link></Button>
              <Button asChild variant="outline" size="sm" className="min-w-0 whitespace-normal [overflow-wrap:anywhere] text-center"><Link href={`/mascotas/${createdPet.mascotaId}`}>Ver la publicación</Link></Button>
            </div>
            <InvitacionDonar />
          </DialogContent>
        </Dialog>
      </div>
    )
  }

  const canSubmit = Boolean(image && tipoAnimal && descripcion.trim() && telefono.trim() && lat !== null && lon !== null && publicPhoneConfirmed)

  return (
    <div className="page-shell">
      <div className="page-container space-y-6 md:space-y-8">
        <section className="space-y-3">
          <PageTitleBar icon={<PawPrint className="size-4" />} title="Cargar mascota perdida" description="Compartí la información para ayudar a que vuelva a casa." />
          <Card>
            <CardHeader>
              <CardTitle>Información de la mascota</CardTitle>
              <CardDescription>Completá los datos de contacto y marcá dónde fue vista por última vez.</CardDescription>
            </CardHeader>
            <CardContent>
              <form ref={formRef} onSubmit={submit} className="space-y-6">
                <div className="space-y-4">
                  <Label htmlFor="foto-mascota">Foto *</Label>
                  <div className="rounded-md border border-dashed border-border bg-card p-6 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <div className="flex h-12 w-12 items-center justify-center rounded-md border border-border bg-card">
                        <FilePlus2 className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
                      </div>
                      <p className="text-sm font-medium">Agregá una foto de la mascota</p>
                      <div className="flex flex-wrap justify-center gap-2 focus-within:ring-2 focus-within:ring-ring">
                        <Button type="button" size="sm" asChild>
                          <label htmlFor="foto-mascota" className={busy || optimizingImage ? "cursor-not-allowed opacity-50" : "cursor-pointer"}>
                            <FilePlus2 className="h-4 w-4" aria-hidden="true" />
                            Cargar imagen
                          </label>
                        </Button>
                        <input id="foto-mascota" type="file" accept="image/jpeg,image/png,image/webp" aria-required="true" aria-describedby={imageError || (!image && !optimizingImage) ? "foto-ayuda foto-error" : "foto-ayuda"} onChange={handleImage} disabled={busy || optimizingImage} className="sr-only" />
                      </div>
                      <p id="foto-ayuda" className="text-center text-xs text-muted-foreground">1 imagen · JPG, PNG o WebP. La foto será revisada antes de publicarse.</p>
                      {optimizingImage && <p role="status" aria-live="polite" className="text-xs text-primary">Optimizando imagen...</p>}
                    </div>
                  </div>
                  {imageError && <p id="foto-error" role="alert" className="text-sm text-destructive">{imageError}</p>}
                  {!image && !imageError && !optimizingImage && <p id="foto-error" className="text-xs text-destructive">Adjuntá una foto para publicar la mascota.</p>}
                  {imagePreview && <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
                    <div className="relative">
                      <img src={imagePreview} alt="Vista previa de la foto seleccionada" className="h-24 w-full rounded-md object-cover" />
                      <Button type="button" variant="destructive" size="icon-sm" className="absolute -top-2 -right-2" disabled={busy} onClick={() => { setImage(null); setImagePreview(null) }} aria-label="Eliminar imagen">
                        <span aria-hidden="true">×</span>
                      </Button>
                    </div>
                  </div>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="tipo-animal">Tipo de animal *</Label>
                  <Select required value={tipoAnimal} onValueChange={setTipoAnimal} disabled={busy}>
                    <SelectTrigger id="tipo-animal" aria-describedby={!tipoAnimal ? "tipo-animal-error" : undefined} className="w-full">
                      <SelectValue placeholder="Seleccioná una opción" />
                    </SelectTrigger>
                    <SelectContent className="w-full">
                      <SelectItem value="perro">Perro</SelectItem>
                      <SelectItem value="gato">Gato</SelectItem>
                      <SelectItem value="otro">Otro</SelectItem>
                    </SelectContent>
                  </Select>
                  {!tipoAnimal && <p id="tipo-animal-error" className="text-xs text-destructive">Seleccioná el tipo de animal.</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="descripcion-mascota">Descripción *</Label>
                  <Textarea id="descripcion-mascota" required aria-describedby={!descripcion.trim() ? "descripcion-mascota-error" : undefined} maxLength={5000} value={descripcion} onChange={(event) => setDescripcion(event.target.value)} placeholder="Color, tamaño, collar y otras señas particulares" rows={4} disabled={busy} />
                  {!descripcion.trim() && <p id="descripcion-mascota-error" className="text-xs text-destructive">Completá la descripción de la mascota.</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="telefono-mascota">Teléfono de contacto *</Label>
                  <Input id="telefono-mascota" type="tel" inputMode="numeric" pattern="[0-9]+" autoComplete="tel" required aria-describedby={!telefono.trim() ? "telefono-mascota-ayuda telefono-mascota-error" : "telefono-mascota-ayuda"} maxLength={40} value={telefono} onChange={(event) => setTelefono(event.target.value.replace(/[^0-9]/g, ""))} disabled={busy} />
                  <p id="telefono-mascota-ayuda" className="text-xs text-muted-foreground">Ingresá solo números, sin espacios ni símbolos.</p>
                  {!telefono.trim() && <p id="telefono-mascota-error" className="text-xs text-destructive">Completá el teléfono de contacto.</p>}
                  <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm" id="aviso-telefono">Este teléfono será público: cualquier persona podrá verlo y llamarte o escribirte.</p>
                  <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm" htmlFor="confirmar-telefono-publico">
                    <input id="confirmar-telefono-publico" type="checkbox" required checked={publicPhoneConfirmed} onChange={(event) => setPublicPhoneConfirmed(event.target.checked)} disabled={busy} aria-describedby={publicPhoneConfirmed ? "aviso-telefono" : "aviso-telefono confirmar-telefono-error"} className="mt-1 size-4 accent-primary" />
                    <span>Entiendo y acepto que mi teléfono sea visible públicamente.</span>
                  </label>
                  {!publicPhoneConfirmed && <p id="confirmar-telefono-error" className="text-xs text-destructive">Confirmá que entendés que el teléfono será público.</p>}
                </div>

                <div className="space-y-2">
                  <Label>Última ubicación conocida *</Label>
                  <p className="text-sm text-muted-foreground">Tocá el mapa para indicar dónde se perdió o fue vista por última vez.</p>
                  <div role="group" aria-label="Seleccionar última ubicación conocida">
                    <LocationPickerMap onLocationSelect={(latitude, longitude) => { setLat(latitude); setLon(longitude) }} initialLat={lat} initialLon={lon} preserveZoomOnSelection />
                  </div>
                  {lat !== null && lon !== null ? <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><MapPin className="size-4" aria-hidden="true" />Ubicación seleccionada: {lat.toFixed(5)}, {lon.toFixed(5)}</p> : <p className="text-xs text-destructive">Seleccioná un punto en el mapa.</p>}
                </div>

                {error && <p role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"><AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{error}{error.includes("cuenta registrada") && <> <a className="underline" href="/auth">Iniciá sesión o registrate</a>.</>}</p>}
                {moderation === "PENDING" && <div role="status" className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4"><p className="font-semibold">Publicación pendiente</p><p className="mt-1 text-sm text-muted-foreground">{message}</p></div>}
                {moderation === "REVIEW" && <div role="status" className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4"><p className="font-semibold">Revisión pendiente</p><p className="mt-1 text-sm text-muted-foreground">{message}</p></div>}
                {moderation === "REJECTED" && <div role="status" className="rounded-lg border border-destructive/40 bg-destructive/5 p-4"><p className="font-semibold text-destructive">La foto no fue aprobada</p><p className="mt-1 text-sm text-muted-foreground">{message} Podés elegir otra foto e intentar nuevamente.</p></div>}
                {moderation === "REJECTED" && <Button type="button" variant="outline" className="w-full" onClick={startOver}>Crear otra publicación</Button>}
                {moderation && moderation !== "APPROVED" && <Button type="button" variant="outline" className="w-full" onClick={() => setShowResultDialog(true)}>Ver resultado de la publicación</Button>}
                <div className="flex gap-3">
                <Button type="submit" className="min-h-11 flex-1" disabled={busy || optimizingImage || moderation !== null || !canSubmit}>
                  {busy ? <><LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> Publicando…</> : moderation === "APPROVED" ? "Mascota publicada" : moderation === "REVIEW" ? "En revisión" : <><Send className="size-4" aria-hidden="true" /> Publicar mascota</>}
                </Button>
                <Button type="button" variant="outline" className="min-h-11 flex-1" asChild disabled={busy}>
                  <Link href="/reportes">Cancelar</Link>
                </Button>
                </div>
                {busy && <p role="status" aria-live="polite" className="text-center text-sm text-muted-foreground">Enviando la publicación y revisando la foto…</p>}
                <p className="text-xs text-muted-foreground">Al publicar, el estado inicial será “Perdida” y la fecha se asignará automáticamente.</p>
              </form>
            </CardContent>
          </Card>
        </section>
      </div>
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Send className="size-4" aria-hidden="true" /></span>
              ¿Confirmar publicación de la mascota?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>Revisá la información antes de publicar la mascota.</p>
                <div className="space-y-2 rounded-xl border border-border/70 bg-muted/60 p-3 text-sm">
                  <div><span className="font-medium text-muted-foreground">Tipo de animal:</span> {tipoAnimal === "perro" ? "Perro" : tipoAnimal === "gato" ? "Gato" : "Otro"}</div>
                  <div><span className="font-medium text-muted-foreground">Descripción:</span> {descripcion}</div>
                  <div><span className="font-medium text-muted-foreground">Teléfono público:</span> {telefono}</div>
                  <div><span className="font-medium text-muted-foreground">Imagen:</span> Sí</div>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmSubmit} disabled={busy}><Send className="mr-2 size-4" aria-hidden="true" />Confirmar y Enviar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {busy && <div className="fixed inset-0 z-[100] flex min-h-dvh items-center justify-center bg-primary px-6 py-10 text-primary-foreground">
        <div role="status" aria-live="polite" aria-busy="true" className="flex max-w-md flex-col items-center gap-5 text-center">
          <LoaderCircle className="size-12 animate-spin" aria-hidden="true" />
          <div className="space-y-2"><h2 className="text-2xl font-semibold">La IA está analizando tu foto</h2><p className="text-sm leading-relaxed opacity-90">Estamos revisando la imagen y terminando de enviar tu publicación. Puede demorar unos segundos; dejá esta pantalla abierta.</p></div>
        </div>
      </div>}
      {moderation && moderation !== "APPROVED" && <PetModerationDialog moderation={moderation} message={message} open={showResultDialog} onOpenChange={handleResultDialogOpenChange} />}
    </div>
  )
}
