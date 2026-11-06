"use client"

import dynamic from "next/dynamic"
import { useRef, useState, type FormEvent, type ChangeEvent } from "react"
import { useRouter } from "next/navigation"
import { AlertCircle, CheckCircle2, LoaderCircle, MapPin, PawPrint, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { PageTitleBar } from "@/components/page-title-bar"
import { MapLoadingSkeleton } from "@/components/loading-skeletons"
import { optimizeReportImage } from "@/lib/media/optimize-report-image"
import { crearMascotaAction } from "./actions"

const LocationPickerMap = dynamic(
  () => import("@/components/location-picker-map").then((module) => module.LocationPickerMap),
  { ssr: false, loading: () => <MapLoadingSkeleton className="rounded-md" /> },
)

type Moderation = "APPROVED" | "REVIEW" | "REJECTED"

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

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (lock.current) return
    setError("")
    setModeration(null)
    if (lat === null || lon === null) {
      setError("Marcá la última ubicación conocida en el mapa antes de publicar.")
      return
    }
    if (!image) {
      setError("Adjuntá una foto para publicar la mascota.")
      return
    }
    if (!publicPhoneConfirmed) {
      setError("Confirmá que entendés que el teléfono será público.")
      return
    }

    lock.current = true
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
      setModeration(result.data.moderation)
      if (result.data.moderation === "APPROVED") router.refresh()
    } catch {
      setError("No pudimos procesar la publicación. Revisá tu conexión e intentá nuevamente.")
    } finally {
      lock.current = false
      setBusy(false)
    }
  }

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
                <div className="space-y-2">
                  <Label htmlFor="foto-mascota">Foto <span className="text-destructive">(obligatoria)</span></Label>
                  <Input id="foto-mascota" type="file" accept="image/jpeg,image/png,image/webp" aria-required="true" aria-describedby="foto-ayuda foto-error" onChange={handleImage} disabled={busy} />
                  <p id="foto-ayuda" className="text-xs text-muted-foreground">JPG, PNG o WebP. La foto será revisada antes de publicarse.</p>
                  {optimizingImage && <p role="status" aria-live="polite" className="text-sm text-muted-foreground">Optimizando foto…</p>}
                  {imageError && <p id="foto-error" role="alert" className="text-sm text-destructive">{imageError}</p>}
                  {imagePreview && <img src={imagePreview} alt="Vista previa de la foto seleccionada" className="h-40 w-full rounded-lg object-cover sm:max-w-sm" />}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="tipo-animal">Tipo de animal <span className="text-destructive">(obligatorio)</span></Label>
                  <select id="tipo-animal" required value={tipoAnimal} onChange={(event) => setTipoAnimal(event.target.value)} disabled={busy} className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <option value="">Seleccioná una opción</option>
                    <option value="perro">Perro</option>
                    <option value="gato">Gato</option>
                    <option value="otro">Otro</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="descripcion-mascota">Descripción <span className="text-destructive">(obligatoria)</span></Label>
                  <Textarea id="descripcion-mascota" required maxLength={5000} value={descripcion} onChange={(event) => setDescripcion(event.target.value)} placeholder="Color, tamaño, collar y otras señas particulares" rows={4} disabled={busy} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="telefono-mascota">Teléfono de contacto <span className="text-destructive">(obligatorio)</span></Label>
                  <Input id="telefono-mascota" type="tel" autoComplete="tel" required maxLength={40} value={telefono} onChange={(event) => setTelefono(event.target.value)} disabled={busy} />
                  <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm" id="aviso-telefono">Este teléfono será público: cualquier persona podrá verlo y llamarte o escribirte.</p>
                  <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm" htmlFor="confirmar-telefono-publico">
                    <input id="confirmar-telefono-publico" type="checkbox" required checked={publicPhoneConfirmed} onChange={(event) => setPublicPhoneConfirmed(event.target.checked)} disabled={busy} aria-describedby="aviso-telefono" className="mt-1 size-4 accent-primary" />
                    <span>Entiendo y acepto que mi teléfono sea visible públicamente.</span>
                  </label>
                </div>

                <div className="space-y-2">
                  <Label>Última ubicación conocida <span className="text-destructive">(obligatoria)</span></Label>
                  <p className="text-sm text-muted-foreground">Tocá el mapa para indicar dónde se perdió o fue vista por última vez.</p>
                  <div role="group" aria-label="Seleccionar última ubicación conocida">
                    <LocationPickerMap onLocationSelect={(latitude, longitude) => { setLat(latitude); setLon(longitude) }} initialLat={lat} initialLon={lon} preserveZoomOnSelection />
                  </div>
                  {lat !== null && lon !== null ? <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><MapPin className="size-4" aria-hidden="true" />Ubicación seleccionada: {lat.toFixed(5)}, {lon.toFixed(5)}</p> : <p className="text-xs text-destructive">Seleccioná un punto en el mapa.</p>}
                </div>

                {error && <p role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"><AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{error}{error.includes("cuenta registrada") && <> <a className="underline" href="/auth">Iniciá sesión o registrate</a>.</>}</p>}
                {moderation === "APPROVED" && <div role="status" className="rounded-lg border border-primary/30 bg-primary/5 p-4"><p className="flex items-center gap-2 font-semibold"><CheckCircle2 className="size-5" aria-hidden="true" />Publicación aprobada</p><p className="mt-1 text-sm text-muted-foreground">La mascota ya puede aparecer públicamente.</p></div>}
                {moderation === "REVIEW" && <div role="status" className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4"><p className="font-semibold">Publicación recibida; foto pendiente de revisión</p><p className="mt-1 text-sm text-muted-foreground">No hace falta volver a enviarla. La foto se mostrará cuando termine la moderación.</p></div>}
                {moderation === "REJECTED" && <div role="status" className="rounded-lg border border-destructive/40 bg-destructive/5 p-4"><p className="font-semibold text-destructive">La foto no fue aprobada</p><p className="mt-1 text-sm text-muted-foreground">La publicación no está disponible. Podés elegir otra foto e intentar nuevamente.</p></div>}
                {moderation === "REJECTED" && <Button type="button" variant="outline" className="w-full" onClick={startOver}>Crear otra publicación</Button>}
                <Button type="submit" className="min-h-11 w-full" disabled={busy || optimizingImage || moderation !== null}>
                  {busy ? <><LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> Publicando…</> : moderation === "APPROVED" ? "Mascota publicada" : moderation === "REVIEW" ? "En revisión" : <><Send className="size-4" aria-hidden="true" /> Publicar mascota</>}
                </Button>
                {busy && <p role="status" aria-live="polite" className="text-center text-sm text-muted-foreground">Enviando la publicación y revisando la foto…</p>}
                <p className="text-xs text-muted-foreground">Al publicar, el estado inicial será “Perdida” y la fecha se asignará automáticamente.</p>
              </form>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  )
}
