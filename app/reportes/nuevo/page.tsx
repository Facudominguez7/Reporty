"use client"

/** Formulario ciudadano con resultado de fotografía independiente del reporte creado. */

import type React from "react"
import type { AuthError, User } from "@supabase/supabase-js"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/utils/supabase/client"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { MapPin, Send, CheckCircle2, CircleX, Info, FilePlus2, LoaderCircle } from "lucide-react"
import Link from "next/link"
import { InvitacionDonar } from "@/components/donaciones/invitacion-donar"
import { PUNTOS } from "@/database/queries/puntos"
import { MapLoadingSkeleton, NuevoReporteLoadingSkeleton } from "@/components/loading-skeletons"
import { REPORT_IMAGE_ACCEPT_ATTR } from "@/lib/media/report-images"
import { buscarUbicacionPrecisa, esUbicacionAproximada } from "@/lib/geolocalizacion/ubicacion-precisa"
import { isWithinReportCoverage } from "@/lib/map/report-coverage"
import { armarTituloReporte, requiereTituloManual } from "@/lib/reportes/titulo-automatico"
import { createReportImageThumbnail, optimizeReportImage } from "@/lib/media/optimize-report-image"
import { toast } from "sonner"
import { 
  getCategorias, 
  getPrioridades, 
  verificarPuedeCrearReporte
} from "@/database/queries/reportes/nuevo"
import dynamic from "next/dynamic"
import { crearReporteAction } from "./actions"
import { getCategoryIcon, getPriorityIcon } from "@/components/report-card"
import { PageTitleBar } from "@/components/page-title-bar"
import { ReportContactActions } from "@/components/report-contact-actions"
import { canShowReportContacts } from "@/lib/report-contacts/eligibility"

/** Maps Supabase Auth errors from the guest sign-in to user-facing messages. */
function getGuestSessionErrorMessage(error: AuthError | null) {
  if (error?.code === "over_request_rate_limit" || error?.status === 429) {
    return "Demasiados intentos desde tu conexión. Probá de nuevo en unos minutos."
  }

  if (error?.code === "anonymous_provider_disabled") {
    return "Los reportes como invitado no están disponibles. Iniciá sesión para reportar."
  }

  if (error?.message?.toLowerCase().includes("captcha")) {
    return "Completá la verificación de seguridad e intentá nuevamente."
  }

  return "No pudimos preparar tu sesión de invitado. Intentá nuevamente."
}

type CreatedReport = {
  reportId: number
  /** Título con el que el servidor guardó el reporte. */
  titulo: string
  isGuest: boolean
  pointsAwarded: number
  imageFailed: boolean
  withdrawn: boolean
  imageMessage: string
  imageApproved: boolean
  /** Correos de organismos notificados automáticamente; vacío si no se avisó a nadie. */
  correosEnviados: string[]
  createdDate: string
}

const getPriorityTone = (priority: string) => {
  const normalizedPriority = priority
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")

  if (normalizedPriority.includes("alta") || normalizedPriority.includes("high")) {
    return "high" as const
  }

  if (normalizedPriority.includes("media") || normalizedPriority.includes("medium")) {
    return "medium" as const
  }

  return "low" as const
}

const priorityToneClasses = {
  high: "bg-priority-high text-card",
  medium: "bg-priority-medium text-foreground",
  low: "bg-priority-low text-card",
} as const

// Cargar el mapa dinámicamente solo en el cliente
const LocationPickerMap = dynamic(
  () => import("@/components/location-picker-map").then(mod => mod.LocationPickerMap),
  { 
    ssr: false,
    loading: () => <MapLoadingSkeleton className="rounded-md" />
  }
)


/**
 * Componente de página que muestra un formulario para crear y enviar un nuevo reporte.
 *
 * Funciona sin cuenta: si no hay sesión, el navegador crea la sesión de invitado recién al confirmar el envío.
 * Carga las categorías y prioridades disponibles,
 * permite elegir manualmente la ubicación en cualquier dispositivo, ofrece la geolocalización como atajo,
 * permite adjuntar una única imagen, muestra un diálogo de confirmación y realiza el envío final
 * del reporte (creación, subida de imagen si existe, asignación de puntos y redirección).
 *
 * @returns El elemento JSX que renderiza la interfaz completa para crear y enviar un reporte.
 */
/** Conserva el formulario y presenta estados de moderación sin pedir reenviar el texto. */
export default function NuevoReportePage() {
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    category: "",
    priority: "",
    images: [] as File[],
    imageThumbnail: null as File | null,
    lat: null as number | null,
    lon: null as number | null,
  })

  const [categorias, setCategorias] = useState<{ id: number; nombre: string }[]>([])
  const [prioridades, setPrioridades] = useState<{ id: number; nombre: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<User | null>(null)
  const [puedeCrear, setPuedeCrear] = useState(false)
  const [isLocatingLocation, setIsLocatingLocation] = useState(false)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  // El servidor no encontró la dirección del punto: la persona escribe el título y reenvía.
  const [tituloPorFaltaDeDireccion, setTituloPorFaltaDeDireccion] = useState(false)
  const [isPublishing, setIsPublishing] = useState(false)
  const [isOptimizingImage, setIsOptimizingImage] = useState(false)
  // Idempotency key for this form submission; the server rejects duplicates.
  const [submissionId, setSubmissionId] = useState(() => crypto.randomUUID())
  const [createdReport, setCreatedReport] = useState<CreatedReport | null>(null)
  const [showResultDialog, setShowResultDialog] = useState(false)
  // Synchronous guard against double clicks before React re-renders the disabled button.
  const submitLockRef = useRef(false)

  const supabase = createClient()
  const router = useRouter()
  useEffect(() => {
    const checkUserAndLoadData = async () => {
      try {
        // Reuse an existing session (guest or permanent). Without one, the visitor reports
        // as a guest: no session is created here, only when the report is submitted.
        const { data: { user } } = await supabase.auth.getUser()

        if (user) {
          setUser(user)

          // Verificar si el usuario puede crear reportes (Admin, Ciudadano o Invitado)
          const { puedeCrear: canCreate } = await verificarPuedeCrearReporte(supabase, user.id)
          setPuedeCrear(canCreate)

          if (!canCreate) {
            setLoading(false)
            return
          }
        } else {
          setPuedeCrear(true)
        }

        // Cargar categorías usando la query
        const categoriasData = await getCategorias(supabase)
        setCategorias(categoriasData)

        // Cargar prioridades usando la query
        const prioridadesData = await getPrioridades(supabase)
        setPrioridades(prioridadesData)
      } catch (error) {
        // Manejar error silenciosamente
      } finally {
        setLoading(false)
      }
    }

    checkUserAndLoadData()
  }, [])

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]

    if (!selectedFile) {
      return
    }

    setIsOptimizingImage(true)

    try {
      const optimizedImage = await optimizeReportImage(selectedFile)
      const thumbnailImage = await createReportImageThumbnail(optimizedImage.file)

      setFormData((prev) => ({
        ...prev,
        images: [optimizedImage.file],
        imageThumbnail: thumbnailImage,
      }))

    } catch (error) {
      const message = error instanceof Error ? error.message : "No pudimos procesar la imagen seleccionada."

      toast.error("No se pudo usar esa imagen", {
        description: message,
      })

      setFormData((prev) => ({
        ...prev,
        images: [],
        imageThumbnail: null,
      }))
    } finally {
      e.target.value = ""
      setIsOptimizingImage(false)
    }
  }

  const removeImage = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== index),
      imageThumbnail: index === 0 ? null : prev.imageThumbnail,
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (formData.lat === null || formData.lon === null) {
      toast.error("Ubicación requerida", {
        description: "Marcá en el mapa dónde está el problema o usá tu ubicación actual."
      })
      return
    }

    if (!isWithinReportCoverage(formData.lat, formData.lon)) {
      toast.error("Ubicación fuera del área de cobertura", {
        description: "Elegí un punto en Posadas, Garupá o Candelaria."
      })
      return
    }

    // Mostrar el diálogo de confirmación
    setShowConfirmDialog(true)
  }

  const handleLocationSelect = (lat: number, lon: number) => {
    setFormData((prev) => ({
      ...prev,
      lat,
      lon,
    }))
  }

  /**
   * Toma la ubicación del dispositivo esperando unos segundos la lectura más precisa
   * (ver `buscarUbicacionPrecisa`). Si el margen de error sigue siendo grande, marca el
   * punto igual y pide corregirlo tocando el mapa.
   */
  const handleUseCurrentLocation = async () => {
    if (!("geolocation" in navigator)) {
      toast.error("No pudimos obtener tu ubicación", {
        description: "No hace falta habilitar el GPS: podés marcar el punto en el mapa."
      })
      return
    }

    setIsLocatingLocation(true)
    try {
      const { lat, lon, precision } = await buscarUbicacionPrecisa(navigator.geolocation)
      if (!isWithinReportCoverage(lat, lon)) {
        toast.error("Tu ubicación está fuera del área de cobertura", {
          description: "Podés marcar manualmente en el mapa si el problema ocurrió en Posadas, Garupá o Candelaria."
        })
        return
      }

      handleLocationSelect(lat, lon)
      if (esUbicacionAproximada(precision)) {
        toast.warning(`Ubicación aproximada (±${Math.round(precision)} m)`, {
          description: "Si el punto no quedó en el lugar exacto, tocá el mapa donde está el problema."
        })
      }
    } catch {
      toast.error("No pudimos obtener tu ubicación", {
        description: "No hace falta habilitar el GPS: podés marcar el punto en el mapa."
      })
    } finally {
      setIsLocatingLocation(false)
    }
  }

  const isGuestMode = !user || user.is_anonymous === true

  const locationIsValid =
    formData.lat !== null && formData.lon !== null && isWithinReportCoverage(formData.lat, formData.lon)

  // «Otros» siempre pide título; el resto solo cuando el servidor no encontró la dirección.
  const esOtros = formData.category !== "" && requiereTituloManual(Number(formData.category))
  const pideTitulo = esOtros || tituloPorFaltaDeDireccion
  const tituloAutomatico = formData.category !== "" ? armarTituloReporte(Number(formData.category), null) : null

  const canSubmitReport =
    (!pideTitulo || formData.title.trim().length >= 3) &&
    formData.description.trim().length >= 10 &&
    formData.category !== "" &&
    formData.priority !== "" &&
    formData.images.length > 0 &&
    locationIsValid &&
    !loading &&
    !isSubmitting &&
    // Submitting mid-optimization would silently send the report without its photo.
    !isOptimizingImage

  const missingFields = [
    !pideTitulo || formData.title.trim().length >= 3 ? null : "título",
    formData.description.trim().length >= 10 ? null : "descripción",
    formData.category !== "" ? null : "categoría",
    formData.priority !== "" ? null : "prioridad",
    formData.images.length > 0 ? null : "fotografía",
    formData.lat !== null && formData.lon !== null ? null : "ubicación",
  ].filter(Boolean) as string[]

  const estadoDeEnvio = isPublishing
    ? (formData.images.length > 0 ? "Procesando fotografía..." : "Enviando...")
    : "Verificando seguridad..."

  /**
   * Creates the anonymous guest session from the browser, only at submit time and only
   * when there is no session. Running it client-side makes Supabase Auth apply its
   * per-IP anonymous sign-in limit and CAPTCHA to the visitor, not to the server.
   *
   * That call consumes the current challenge token, so it is invalidated here: the report
   * creation must prove itself with a different one.
   */
  const ensureGuestSession = async () => {
    const { data, error } = await supabase.auth.signInAnonymously()

    if (error || !data.user) {
      toast.error("Error al crear el reporte", {
        description: getGuestSessionErrorMessage(error),
      })
      return null
    }

    setUser(data.user)
    return data.user
  }

  const handleResultDialogOpenChange = (open: boolean) => {
    setShowResultDialog(open)
    if (!open) router.push("/mapa")
  }

  /**
   * Muestra el error de un envío rechazado y, si el servidor pidió título por falta de
   * dirección, habilita el campo para que la persona lo escriba y reenvíe.
   *
   * @param fallo - Respuesta fallida de la creación del reporte.
   */
  const avisarFalloDeEnvio = (fallo: { error: string; requiereTitulo?: boolean }) => {
    if (fallo.requiereTitulo) setTituloPorFaltaDeDireccion(true)
    toast.error(fallo.requiereTitulo ? "Falta el título del reporte" : "Error al crear el reporte", {
      description: fallo.error,
    })
  }

  const startNewReport = () => {
    setTituloPorFaltaDeDireccion(false)
    setFormData((prev) => ({
      ...prev,
      title: "",
      description: "",
      category: "",
      priority: "",
      images: [],
      imageThumbnail: null,
    }))
    setSubmissionId(crypto.randomUUID())
    setCreatedReport(null)
  }

  /** Envía una sola vez y diferencia revisión privada, rechazo y fallo de publicación. */
  const confirmSubmit = async () => {
    if (submitLockRef.current) return
    submitLockRef.current = true

    try {
      setIsSubmitting(true)

      // Reutilizar la sesión; crear una invitada solo si no existe.
      if (!user && !(await ensureGuestSession())) {
        return
      }

      const payload = new FormData()
      if (pideTitulo) payload.set("titulo", formData.title)
      payload.set("descripcion", formData.description)
      payload.set("categoriaId", formData.category)
      payload.set("prioridadId", formData.priority)
      payload.set("lat", String(formData.lat))
      payload.set("lon", String(formData.lon))
      payload.set("submissionId", submissionId)

      if (formData.images[0]) {
        payload.set("image", formData.images[0])
      }

      // El token ya está listo: desde acá el servidor lo verifica y puede tardar en analizar la fotografía.
      setIsPublishing(true)
      const result = await crearReporteAction(payload)

      if (!result.success) {
        avisarFalloDeEnvio(result)
        return
      }

      const imageFailed = formData.images.length > 0 && !result.data.imageUploaded
      const withdrawn = result.data.imageModeration?.estado === "REJECTED"
      const imageMessage = result.data.imageModeration?.motivos[0] ?? "La fotografía no está publicada."

      if (imageFailed) {
        const moderacion = result.data.imageModeration
        toast.warning(
          moderacion?.estado === "REVIEW" ? "Reporte creado: fotografía pendiente de revisión"
            : moderacion?.estado === "REJECTED" ? "Reporte retirado por la fotografía adjunta"
            : moderacion?.estado === "APPROVED" ? "Reporte creado: publicación de fotografía pendiente"
            : "Reporte creado sin fotografía",
          { description: moderacion?.motivos[0] ?? "No necesitás reenviar el reporte. La fotografía no está publicada." },
        )
      }

      if (!withdrawn) toast.success(
        result.data.pointsAwarded > 0
          ? `¡Reporte creado exitosamente! +${result.data.pointsAwarded} puntos`
          : "¡Reporte creado exitosamente!",
      )

      setShowResultDialog(true)
      setCreatedReport({
        reportId: result.data.reportId,
        titulo: result.data.titulo,
        isGuest: result.data.isGuest,
        pointsAwarded: result.data.pointsAwarded,
        imageFailed,
        withdrawn,
        imageMessage,
        imageApproved: canShowReportContacts(result.data.imageModeration?.estado, withdrawn),
        correosEnviados: result.data.correosEnviados,
        createdDate: new Date().toLocaleDateString("es-AR"),
      })
      // Refresh server components so the navigation reflects the new guest session.
      router.refresh()

    } catch (error) {
      console.error("Error inesperado:", error)
      toast.error("Error al crear el reporte", {
        description: "Por favor, intenta nuevamente."
      })
    } finally {
      submitLockRef.current = false
      setIsPublishing(false)
      setIsSubmitting(false)
      setShowConfirmDialog(false)
    }
  }

  // Mostrar mensaje de carga o error de autenticación
  if (loading) {
    return <NuevoReporteLoadingSkeleton />
  }

  // Si el usuario no tiene permisos para crear reportes
  if (!puedeCrear) {
    return (
      <div className="page-shell flex items-center justify-center px-4">
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>Acceso no autorizado</CardTitle>
            <CardDescription>Tu rol no permite crear reportes</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              Solo los usuarios con rol <strong>Admin</strong> o <strong>Ciudadano</strong> pueden crear reportes.
              Tu cuenta tiene permisos diferentes.
            </p>
            <div className="flex gap-3">
              <Button asChild className="flex-1">
                <Link href="/mapa">Ver Mapa</Link>
              </Button>
              <Button asChild variant="outline" className="flex-1">
                <Link href="/">Volver al Inicio</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (createdReport) {
    return (
      <div className="page-shell flex items-center justify-center px-4">
        <Button type="button" variant="outline" onClick={() => setShowResultDialog(true)}>Ver resultado del reporte</Button>
        <Dialog open={showResultDialog} onOpenChange={handleResultDialogOpenChange}>
          <DialogContent className="gap-3">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 pr-8">
              {createdReport.withdrawn ? (
                <CircleX className="size-5 text-destructive" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="size-5 text-primary" aria-hidden="true" />
              )}
              {createdReport.withdrawn ? "Reporte retirado" : "Reporte registrado en Reporty"}
            </DialogTitle>
            <DialogDescription>
              {createdReport.withdrawn ? "El reporte no está disponible y no otorga puntos."
                : createdReport.pointsAwarded > 0
                ? `Gracias por ayudar a tu ciudad. Sumaste ${createdReport.pointsAwarded} puntos.`
                : "Gracias por ayudar a tu ciudad. Ya podés seguir su estado."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {createdReport.isGuest && !createdReport.withdrawn && (
              <p className="rounded-xl border border-border/70 bg-muted/60 p-3 text-[0.7rem] text-muted-foreground">
                Reportaste como invitado. Podés volver a ver tus reportes desde este navegador en Mis reportes, o
                guardar tu cuenta con tu correo para no perderlos.
              </p>
            )}
            {createdReport.imageFailed && (
              <p role="status" className="text-sm text-muted-foreground">{createdReport.imageMessage}</p>
            )}
            {!createdReport.withdrawn && createdReport.correosEnviados.length > 0 && (
              <p role="status" className="text-sm text-muted-foreground">
                Se envió correo a: {createdReport.correosEnviados.join(", ")}
              </p>
            )}
            {createdReport.imageApproved && !createdReport.withdrawn && formData.lat !== null && formData.lon !== null && (
              <ReportContactActions
                title={createdReport.titulo}
                category={categorias.find((category) => String(category.id) === formData.category)?.nombre ?? ""}
                description={formData.description}
                latitude={formData.lat}
                longitude={formData.lon}
                date={createdReport.createdDate}
                reportUrl={`${window.location.origin}/reportes/${createdReport.reportId}`}
              />
            )}
            <div className="grid grid-cols-2 gap-2">
              <Button asChild size="sm" className={`min-w-0 whitespace-normal [overflow-wrap:anywhere] text-center ${createdReport.withdrawn ? "col-span-2" : ""}`}>
                <Link href="/mis-reportes">
                  Ver mis reportes
                </Link>
              </Button>
              {!createdReport.withdrawn && <Button asChild variant="outline" size="sm" className="min-w-0 whitespace-normal [overflow-wrap:anywhere] text-center">
                <Link href={`/reportes/${createdReport.reportId}`}>Ver el reporte</Link>
              </Button>}
            </div>
            {!createdReport.withdrawn && <InvitacionDonar />}
            {(!createdReport.imageApproved || createdReport.withdrawn) && (
              <Button type="button" variant="ghost-bordered" className="w-full" onClick={startNewReport}>
                Crear otro reporte
              </Button>
            )}
          </div>
          </DialogContent>
        </Dialog>
      </div>
    )
  }

  return (
    <div className="page-shell">
      <div className="page-container space-y-6 md:space-y-8 lg:space-y-10">
        <section className="space-y-3">
          <PageTitleBar
            icon={<FilePlus2 className="size-4" />}
            title="Crear reporte"
            description="Informá un problema de tu zona."
          />
          {isGuestMode && (
            <p className="flex items-start gap-2 rounded-xl border border-border/70 bg-muted/60 p-3 text-sm text-muted-foreground">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>
                No necesitás cuenta para reportar. Tu reporte quedará vinculado a este navegador y lo vas a encontrar
                en Mis reportes.
              </span>
            </p>
          )}
          <Card>
          <CardHeader>
            <CardTitle>Información del Problema</CardTitle>
            <CardDescription>Completa todos los campos para crear un reporte detallado</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Description */}
              <div className="space-y-2">
                <Label htmlFor="description">Descripción Detallada *</Label>
                <Textarea
                  id="description"
                  placeholder="Describe el problema con el mayor detalle posible..."
                  rows={4}
                  value={formData.description}
                  onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                  required
                />
                {formData.description.trim().length > 0 && formData.description.trim().length < 10 && (
                  <p className="text-xs text-destructive">La descripción debe tener al menos 10 caracteres.</p>
                )}
                {formData.description.trim().length === 0 && (
                  <p className="text-xs text-destructive">Completá la descripción del problema.</p>
                )}
              </div>

              {/* Category and Priority */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2 w-full">
                  <Label>Categoría *</Label>
                  <Select
                    disabled={loading}
                    value={formData.category}
                    onValueChange={(value) => setFormData((prev) => ({ ...prev, category: value }))}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={categorias.length > 0 ? "Selecciona una categoría" : "Cargando categorías..."} />
                    </SelectTrigger>
                    <SelectContent className="w-full">
                      {categorias.map((categoria) => (
                        <SelectItem key={categoria.id} value={categoria.id.toString()}>
                          <span className="inline-flex items-center gap-2">
                            {getCategoryIcon(categoria.nombre, "size-4")}
                            {categoria.nombre}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {formData.category === "" && (
                    <p className="text-xs font-medium text-destructive">Seleccioná una categoría.</p>
                  )}
                  {tituloAutomatico && !pideTitulo && (
                    <p className="text-xs text-muted-foreground">
                      Título automático: {tituloAutomatico} en la dirección que marques en el mapa.
                    </p>
                  )}
                  {pideTitulo && (
                    <div className="space-y-2 pt-2">
                      <Label htmlFor="title">Título del reporte *</Label>
                      <Input
                        id="title"
                        autoFocus={!esOtros}
                        placeholder={esOtros ? "Ej: Pérdida de cloaca en la vereda" : "Ej: Bache frente a la escuela 12"}
                        maxLength={120}
                        value={formData.title}
                        onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
                        required
                      />
                      <p className="text-xs text-muted-foreground">
                        {esOtros
                          ? "En «Otros» contanos en pocas palabras cuál es el problema."
                          : "No pudimos obtener la dirección de ese punto: escribí un título que ayude a ubicar el problema."}
                      </p>
                      {formData.title.trim().length > 0 && formData.title.trim().length < 3 && (
                        <p className="text-xs text-destructive">El título debe tener al menos 3 caracteres.</p>
                      )}
                      {formData.title.trim().length === 0 && (
                        <p className="text-xs text-destructive">Completá el título del reporte.</p>
                      )}
                    </div>
                  )}
                </div>

                <div className="space-y-2 w-full">
                  <Label id="priority-label">Prioridad *</Label>
                  <div
                    role="group"
                    aria-labelledby="priority-label"
                    aria-busy={loading}
                    className="flex w-full flex-row overflow-hidden rounded-full border border-border bg-card"
                  >
                    {prioridades.length > 0 ? (
                      prioridades.map((prioridad, index) => {
                        const tone = getPriorityTone(prioridad.nombre)
                        const isSelected = formData.priority === prioridad.id.toString()

                        return (
                          <button
                            key={prioridad.id}
                            type="button"
                            disabled={loading}
                            aria-pressed={isSelected}
                            onClick={() => setFormData((prev) => ({ ...prev, priority: prioridad.id.toString() }))}
                            className={`flex min-h-11 min-w-0 flex-1 basis-0 items-center justify-center gap-1.5 whitespace-nowrap border-border px-2 py-2 text-xs font-semibold transition-colors focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:gap-2 sm:px-3 sm:text-sm disabled:cursor-not-allowed disabled:opacity-50 ${
                              index > 0 ? "border-l" : ""
                            } ${isSelected ? priorityToneClasses[tone] : "bg-card text-card-foreground hover:bg-background"}`}
                          >
                            {getPriorityIcon(prioridad.nombre, "size-4")}
                            {prioridad.nombre}
                          </button>
                        )
                      })
                    ) : (
                      <span className="flex min-h-11 w-full items-center justify-center px-3 py-2 text-sm text-muted-foreground">
                        Cargando prioridades...
                      </span>
                    )}
                  </div>
                  {formData.priority === "" && (
                    <p className="text-xs font-medium text-destructive">Seleccioná una prioridad.</p>
                  )}
                </div>
              </div>

              {/* Location */}
              <div className="space-y-2">
                <Label>Ubicación del problema *</Label>
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm text-muted-foreground">
                      Marcá en el mapa dónde está el problema.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleUseCurrentLocation}
                      disabled={isLocatingLocation}
                    >
                      <MapPin className="h-4 w-4" />
                      {isLocatingLocation ? "Buscando ubicación…" : "Usar mi ubicación"}
                    </Button>
                  </div>
                  <LocationPickerMap
                    onLocationSelect={handleLocationSelect}
                    initialLat={formData.lat}
                    initialLon={formData.lon}
                    preserveZoomOnSelection
                  />
                  {formData.lat !== null && formData.lon !== null ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
                      <MapPin className="h-4 w-4" />
                      <span>
                        Ubicación seleccionada: {formData.lat.toFixed(5)}, {formData.lon.toFixed(5)}
                      </span>
                    </div>
                  ) : (
                    <p className="text-xs text-destructive">Tocá o hacé clic en el mapa para marcar la ubicación.</p>
                  )}
                </div>
              </div>

              {/* Image Upload */}
              <div className="space-y-4">
                <Label htmlFor="images">Fotografía <span className="text-destructive">(obligatoria)</span></Label>
                <div className="rounded-md border border-dashed border-border bg-card p-6 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <div className="flex h-12 w-12 items-center justify-center rounded-md border border-border bg-card">
                      <FilePlus2 className="w-6 h-6 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Agregá una foto del problema</p>
                    </div>
                    <div className="flex flex-wrap justify-center gap-2">
                      <Button type="button" size="sm" asChild>
                        <label htmlFor="images" className="cursor-pointer">
                          <FilePlus2 className="h-4 w-4" />
                          Cargar imagen
                        </label>
                      </Button>
                      <input
                        id="images"
                        type="file"
                        accept={REPORT_IMAGE_ACCEPT_ATTR}
                        aria-required="true"
                        onChange={handleImageUpload}
                        className="sr-only"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground text-center">
                      1 imagen · JPG, PNG o WebP
                    </p>
                    {isOptimizingImage && (
                      <p className="text-xs text-primary">Optimizando imagen...</p>
                    )}
                  </div>
                </div>

                {/* Image Preview */}
                {formData.images.length > 0 && (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {formData.images.map((image, index) => (
                      <div key={index} className="relative">
                        <img
                          src={URL.createObjectURL(image) || "/placeholder.svg"}
                          alt={`Preview ${index + 1}`}
                          className="w-full h-24 object-cover rounded-md"
                        />
                        <Button
                          type="button"
                          variant="destructive"
                          size="icon-sm"
                          className="absolute -top-2 -right-2"
                          onClick={() => removeImage(index)}
                          aria-label={`Eliminar imagen ${index + 1}`}
                        >
                          <span aria-hidden="true">×</span>
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Submit Button */}
              <div className="flex gap-4 pt-4">
                <Button
                  type="submit"
                  className="flex-1"
                  disabled={!canSubmitReport}
                >
                  <Send className="w-4 h-4" />
                  {isSubmitting
                    ? estadoDeEnvio
                    : isOptimizingImage
                      ? "Optimizando imagen..."
                      : canSubmitReport
                        ? "Enviar Reporte"
                        : "Faltan datos"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  asChild
                  disabled={isSubmitting}
                >
                  <Link href="/reportes">Cancelar</Link>
                </Button>
              </div>

              {!canSubmitReport && missingFields.length > 0 && (
                <p className="text-xs text-destructive">
                  Te falta completar: <span className="font-medium">{missingFields.join(", ")}</span>.
                </p>
              )}
            </form>
          </CardContent>
          </Card>
        </section>
      </div>

      {/* Alert Dialog de Confirmación */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Send className="size-4" aria-hidden="true" />
              </span>
              ¿Confirmar envío del reporte?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>Revisá la información antes de publicar el reporte.</p>
                <div className="space-y-2 rounded-xl border border-border/70 bg-muted/60 p-3 text-sm">
                  <div>
                  <span className="font-medium text-muted-foreground">Título:</span>{" "}
                  {pideTitulo ? formData.title : `${tituloAutomatico ?? ""} en la dirección del mapa (automático)`}
                  </div>
                  <div>
                    <span className="font-medium text-muted-foreground">Categoría:</span>{" "}
                    {categorias.find(c => c.id === parseInt(formData.category))?.nombre}
                  </div>
                  <div>
                    <span className="font-medium text-muted-foreground">Prioridad:</span>{" "}
                    {prioridades.find(p => p.id === parseInt(formData.priority))?.nombre}
                  </div>
                  <div>
                    <span className="font-medium text-muted-foreground">Imagen:</span> Sí
                  </div>
                </div>
                {isGuestMode ? (
                  <p className="text-xs text-muted-foreground">
                    Vas a reportar como invitado. Los puntos y el ranking son para cuentas guardadas con correo.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Podés sumar <span className="font-bold text-primary">{PUNTOS.CREAR_REPORTE} puntos</span> si el reporte no es retirado por la fotografía. El rechazo retira el reporte y revierte su premio.
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmSubmit} disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin mr-2" />
                  {estadoDeEnvio}
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Confirmar y Enviar
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {isSubmitting && isPublishing && (
        <div className="fixed inset-0 z-[100] flex min-h-dvh items-center justify-center bg-primary px-6 py-10 text-primary-foreground">
          <div role="status" aria-live="polite" aria-busy="true" className="flex max-w-md flex-col items-center gap-5 text-center">
            <LoaderCircle className="size-12 animate-spin" aria-hidden="true" />
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold">La IA está analizando tu foto</h2>
              <p className="text-sm leading-relaxed opacity-90">
                Estamos revisando la imagen y terminando de enviar tu reporte. Puede demorar unos segundos; dejá esta pantalla abierta.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
