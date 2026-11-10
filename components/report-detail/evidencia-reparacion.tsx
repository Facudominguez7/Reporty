"use client"

/**
 * Comparación «Antes / Después», estado de la verificación comunitaria y formulario
 * mínimo para informar una reparación en la ficha del reporte (S10, S11, S13, S16, S17).
 *
 * La ficha es visual: solo presenta lo que la base ya decidió. Confirmar, impugnar e
 * informar se delega a las server actions que recibe por propiedades, así ningún
 * estado, punto ni cierre se calcula en el navegador (S12). El comentario de la
 * evidencia y el motivo de la impugnación se eligen de listas cerradas: el navegador
 * envía la clave y el servidor resuelve la frase aprobada.
 */

import { useId, useRef, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import dayjs from "dayjs"
import utc from "dayjs/plugin/utc"
import timezone from "dayjs/plugin/timezone"
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Clock,
  Flag,
  Images,
  MessageCircle,
  ShieldCheck,
} from "lucide-react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  MENSAJE_CAPTCHA_NO_DISPONIBLE,
  TURNSTILE_CONFIGURADO,
  TURNSTILE_NO_DISPONIBLE,
  TurnstileWidget,
} from "@/components/turnstile-widget"
import {
  REPORT_IMAGE_ACCEPT_ATTR,
  REPORT_IMAGE_MAX_SOURCE_BYTES,
} from "@/lib/media/report-images"
import { optimizeReportImage } from "@/lib/media/optimize-report-image"
import {
  FRASES_IMPUGNACION,
  FRASES_REPARACION,
  PLACEHOLDER_FRASE_IMPUGNACION,
  PLACEHOLDER_FRASE_REPARACION,
  PREGUNTA_POR_QUE_NO_ESTA_REPARADO,
  PREGUNTA_QUE_SE_ARREGLO,
} from "@/lib/reportes/frases-reparacion"
import type {
  EvidenciaReparacionVista,
  SeccionReparacionVista,
} from "@/lib/use-cases/reportes/evidencia-reparacion-detalle.server"
import { ComparadorFotos, type FotoComparada } from "./comparador-fotos"

dayjs.extend(utc)
dayjs.extend(timezone)

const ZONA_HORARIA = "America/Argentina/Buenos_Aires"

/**
 * Action que Turnstile vincula al formulario de evidencia. `app/reportes/[id]/actions.ts`
 * verifica el mismo valor con Siteverify, así un token de otro formulario no sirve para
 * informar una reparación (S12).
 */
const ACCION_CAPTCHA_INFORMAR_REPARACION = "informar_reparacion"

/** Estilo compartido por los dos desplegables de frases, igual al de «¿Qué novedad tenés?». */
const ESTILO_SELECT_FRASE =
  "min-h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm leading-5 text-foreground"

/** Resultado mínimo que la ficha necesita de una acción: si falló y qué mostrar. */
export type ResultadoAccionReparacion = { success: boolean; error?: string }

/** Acciones server-side que la ficha delega; el cliente nunca decide el resultado. */
export type AccionesEvidenciaReparacion = {
  onConfirmar: () => Promise<ResultadoAccionReparacion>
  onImpugnar: (motivoClave: string) => Promise<ResultadoAccionReparacion>
  onInformar: (
    fraseClave: string,
    imagen: File,
    captchaToken: string | null,
  ) => Promise<ResultadoAccionReparacion>
}

export type EvidenciaReparacionProps = {
  seccion: SeccionReparacionVista
  /** Foto original del reporte para la comparación; `null` si el reporte no tiene fotos. */
  fotoAntes: { src: string; fecha: string | null } | null
  acciones: AccionesEvidenciaReparacion
}

/** Fecha y hora de la evidencia, siempre en hora argentina como el resto de la ficha. */
function formatearFechaHora(fecha: string) {
  return dayjs.utc(fecha).tz(ZONA_HORARIA).format("DD/MM/YYYY HH:mm")
}

/**
 * `reportes.created_at` es un timestamp sin zona: se lee como hora argentina para que
 * el HTML del servidor y el navegador coincidan, igual que en la ficha.
 */
function formatearFechaDeReporte(fecha: string) {
  const interpretada = /(Z|[+-]\d{2}(:?\d{2})?)$/.test(fecha)
    ? new Date(fecha)
    : new Date(`${fecha}-03:00`)
  if (Number.isNaN(interpretada.getTime())) return null
  return dayjs(interpretada).tz(ZONA_HORARIA).format("DD/MM/YYYY")
}

/** Nombre visible del autor de la evidencia; nunca se inventa una identidad. */
function nombreAutor(evidencia: EvidenciaReparacionVista) {
  return evidencia.autor ?? "una cuenta de la comunidad"
}

/**
 * Comparación «Antes / Después» de la hoja: reutiliza el comparador compartido con la
 * tarjeta del reporte y le agrega el marco, el autor y el comentario de la evidencia.
 * Los rótulos «Antes» y «Después» llevan la fecha de cada foto, así que la
 * comparación no depende del color.
 */
function ComparadorAntesDespues({
  evidencia,
  fotoAntes,
}: {
  evidencia: EvidenciaReparacionVista
  fotoAntes: { src: string; fecha: string | null } | null
}) {
  const foto = evidencia.foto
  if (!foto) return null

  const autor = nombreAutor(evidencia)
  const fecha = formatearFechaHora(evidencia.publicadaAt ?? evidencia.informadaAt)
  const fechaAntes = fotoAntes?.fecha ? formatearFechaDeReporte(fotoAntes.fecha) : null
  const altDespues = `Foto de la reparación informada por ${autor} el ${fecha}`

  // La foto original es el «antes»; sin ella el comparador muestra solo el «después».
  const antes: FotoComparada | null = fotoAntes
    ? {
        src: fotoAntes.src,
        alt: `Foto original del reporte${fechaAntes ? `, del ${fechaAntes}` : ""}`,
        fecha: fotoAntes.fecha,
      }
    : null
  const despues: FotoComparada = {
    src: foto.src,
    alt: altDespues,
    fecha: evidencia.publicadaAt ?? evidencia.informadaAt,
  }

  return (
    <Card className="gap-0">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base md:text-xl">
          <Images className="size-4 md:size-5" aria-hidden="true" />
          <span>Antes y después</span>
        </CardTitle>
        <CardDescription className="text-xs md:text-sm">
          La comunidad ya puede ver la foto de la reparación.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <ComparadorFotos antes={antes} despues={despues} />
        <p className="text-xs text-muted-foreground">
          Evidencia de {autor} · {fecha}
        </p>
        {evidencia.comentario && (
          <p className="text-sm leading-relaxed text-foreground">
            «{evidencia.comentario}»
          </p>
        )}
      </CardContent>
    </Card>
  )
}

/** Barra de progreso con el texto «N de M confirmaciones», nunca solo color. */
function ProgresoConfirmaciones({ hechas, umbral }: { hechas: number; umbral: number }) {
  const faltan = Math.max(0, umbral - hechas)
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">
          {hechas} de {umbral} confirmaciones
        </p>
        {faltan > 0 && (
          <p className="text-xs text-muted-foreground">
            Falta{faltan === 1 ? "" : "n"} {faltan} confirmación{faltan === 1 ? "" : "es"}
          </p>
        )}
      </div>
      <div
        role="progressbar"
        aria-label="Confirmaciones de la reparación"
        aria-valuemin={0}
        aria-valuemax={umbral}
        aria-valuenow={hechas}
        aria-valuetext={`${hechas} de ${umbral} confirmaciones`}
        className="grid gap-1.5"
        style={{ gridTemplateColumns: `repeat(${Math.max(1, umbral)}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: Math.max(1, umbral) }, (_, indice) => (
          <span
            key={indice}
            aria-hidden="true"
            className={
              indice < hechas
                ? "h-2 rounded-full border border-primary bg-primary"
                : "h-2 rounded-full border border-border bg-input"
            }
          />
        ))}
      </div>
    </div>
  )
}

/** Explica por qué la persona no puede confirmar ni impugnar esta evidencia. */
function AvisoParticipacion({ motivo }: { motivo: NonNullable<EvidenciaReparacionVista["participacion"]["motivo"]> }) {
  const pathname = usePathname()

  if (motivo === "autor") {
    return (
      <p className="text-xs text-muted-foreground">
        El autor de la foto no puede confirmar su propia evidencia.
      </p>
    )
  }

  if (motivo === "operador") {
    return (
      <p className="text-xs text-muted-foreground">
        Las cuentas de operador municipal no participan de la verificación comunitaria.
      </p>
    )
  }

  if (motivo === "sesion") {
    return (
      <p className="text-xs text-muted-foreground">
        Para confirmar o impugnar necesitás una cuenta registrada con el correo
        confirmado.{" "}
        <Link
          href={`/auth?next=${encodeURIComponent(pathname ?? "/reportes")}`}
          className="font-medium text-primary hover:underline"
        >
          Iniciá sesión
        </Link>{" "}
        para participar.
      </p>
    )
  }

  return (
    <p className="text-xs text-muted-foreground">
      Para confirmar o impugnar necesitás una cuenta registrada con el correo
      confirmado. Si entraste como invitado, creá tu cuenta y verificá el correo.
    </p>
  )
}

/**
 * Aviso de impugnación pendiente: la verificación queda en pausa hasta que un
 * administrador la revise (S4, S5). Nunca nombra a quien impugnó.
 */
function AvisoImpugnacionPendiente() {
  const tituloId = useId()
  return (
    <div
      role="group"
      aria-labelledby={tituloId}
      className="tone-warning-card flex items-start gap-2.5 rounded-[var(--radius)] border p-3"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="space-y-1">
        <p id={tituloId} className="text-sm font-semibold">
          Impugnación pendiente
        </p>
        <p className="text-xs leading-relaxed">
          La verificación está en pausa hasta que un administrador revise la
          impugnación. Si la acepta, la evidencia se rechaza y el reporte sigue
          Pendiente; si la descarta, vuelven a contar las confirmaciones.
        </p>
      </div>
    </div>
  )
}

/**
 * Diálogo de impugnación: el motivo se elige de la lista cerrada de S17 y se valida
 * en el servidor antes de registrar la impugnación. Exportado para que la prueba del
 * formulario pueda renderizarlo abierto.
 */
export function DialogoImpugnar({
  abierto,
  cambiandoAbierto,
  enviando,
  motivo,
  onMotivo,
  onEnviar,
}: {
  abierto: boolean
  cambiandoAbierto: (abierto: boolean) => void
  enviando: boolean
  /** Clave de la frase elegida; vacío mientras no se eligió ninguna. */
  motivo: string
  onMotivo: (motivo: string) => void
  onEnviar: () => void
}) {
  const motivoId = useId()
  return (
    <Dialog open={abierto} onOpenChange={cambiandoAbierto}>
      {/* La evidencia vive en una hoja inferior con !z-[70]: el diálogo sube a 80. */}
      <DialogContent className="z-[80]" overlayClassName="z-[80]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="tone-danger-soft-inline inline-flex size-8 shrink-0 items-center justify-center rounded-xl">
              <Flag className="size-4" aria-hidden="true" />
            </span>
            Impugnar la reparación
          </DialogTitle>
          <DialogDescription>
            Elegí por qué la reparación no está hecha. Administración revisa la
            impugnación antes de validar la evidencia.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <label htmlFor={motivoId} className="text-sm font-medium">
            {PREGUNTA_POR_QUE_NO_ESTA_REPARADO}
          </label>
          <select
            id={motivoId}
            value={motivo}
            onChange={(event) => onMotivo(event.target.value)}
            disabled={enviando}
            className={ESTILO_SELECT_FRASE}
          >
            <option value="">{PLACEHOLDER_FRASE_IMPUGNACION}</option>
            {FRASES_IMPUGNACION.map(({ key, label }) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <DialogFooter className="gap-2">
          <DialogClose asChild>
            <Button variant="outline" type="button" disabled={enviando}>
              Cancelar
            </Button>
          </DialogClose>
          <Button
            type="button"
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={onEnviar}
            disabled={enviando || motivo.length === 0}
          >
            <Flag className="mr-2 size-4" aria-hidden="true" />
            {enviando ? "Enviando..." : "Enviar impugnación"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Estado de la evidencia con sus acciones: informada, en verificación o reparada.
 * Cada estado tiene su propio texto y su propio ícono, así nunca se presenta uno
 * como otro (S11).
 */
function TarjetaEstadoEvidencia({
  evidencia,
  umbral,
  acciones,
}: {
  evidencia: EvidenciaReparacionVista
  umbral: number
  acciones: AccionesEvidenciaReparacion
}) {
  const router = useRouter()
  const [confirmando, setConfirmando] = useState(false)
  const [impugnando, setImpugnando] = useState(false)
  const [dialogoAbierto, setDialogoAbierto] = useState(false)
  const [motivo, setMotivo] = useState("")

  const autor = nombreAutor(evidencia)
  const fechaInforme = formatearFechaHora(evidencia.informadaAt)
  const { participacion } = evidencia
  // Una cuenta deja una sola verificación por evidencia (S7): quien ya confirmó o
  // impugnó no puede cambiar de tipo, así que solo se le muestra lo que registró.
  const puedeConfirmar = participacion.puede && participacion.yaVerifico === null
  const puedeImpugnar = participacion.puede && participacion.yaVerifico === null

  const confirmar = async () => {
    setConfirmando(true)
    try {
      const resultado = await acciones.onConfirmar()
      if (!resultado.success) {
        toast.error(resultado.error ?? "No pudimos registrar tu confirmación.")
        return
      }
      toast.success("Confirmación registrada", {
        description: "Gracias por verificar la reparación.",
      })
      router.refresh()
    } catch (error) {
      console.error("Error al confirmar la reparación:", error)
      toast.error("No pudimos registrar tu confirmación.")
    } finally {
      setConfirmando(false)
    }
  }

  const impugnar = async () => {
    setImpugnando(true)
    try {
      const resultado = await acciones.onImpugnar(motivo)
      if (!resultado.success) {
        toast.error(resultado.error ?? "No pudimos registrar tu impugnación.")
        return
      }
      toast.success("Impugnación enviada", {
        description: "Administración la revisa antes de validar la reparación.",
      })
      setMotivo("")
      setDialogoAbierto(false)
      router.refresh()
    } catch (error) {
      console.error("Error al impugnar la reparación:", error)
      toast.error("No pudimos registrar tu impugnación.")
    } finally {
      setImpugnando(false)
    }
  }

  if (evidencia.estado === "informada") {
    return (
      <Card className="gap-0">
        <CardHeader className="pb-3">
          <CardTitle className="text-base md:text-xl">
            <span className="inline-flex items-center gap-2">
              <Clock className="size-4 md:size-5" aria-hidden="true" />
              Reparación informada
            </span>
          </CardTitle>
          <CardDescription className="text-xs md:text-sm">
            {autor} informó la reparación el {fechaInforme}. La foto está en moderación
            y todavía no se muestra en el reporte.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 pt-0">
          <p className="text-xs text-muted-foreground">
            El reporte sigue Pendiente hasta que la comunidad confirme la reparación.
          </p>
          {evidencia.comentario && (
            <p className="text-sm leading-relaxed text-foreground">
              «{evidencia.comentario}»
            </p>
          )}
        </CardContent>
      </Card>
    )
  }

  const reparado = evidencia.estado === "reparado"

  return (
    <Card className="gap-0">
      <CardHeader className="pb-3">
        <CardTitle className="text-base md:text-xl">
          <span className="inline-flex items-center gap-2">
            {reparado ? (
              <ShieldCheck className="size-4 md:size-5" aria-hidden="true" />
            ) : (
              <CheckCircle2 className="size-4 md:size-5" aria-hidden="true" />
            )}
            {reparado ? "Reparado" : "En verificación"}
          </span>
        </CardTitle>
        <CardDescription className="text-xs md:text-sm">
          {reparado
            ? (evidencia.foto
              ? "La reparación quedó validada y el reporte está Reparado. El antes y el después se mantienen en la ficha."
              : "La reparación quedó validada y el reporte está Reparado. La foto de la evidencia no llegó a publicarse, así que no hay una comparación disponible.")
            : `La foto ya se publicó y la comunidad la está confirmando. Con ${umbral} confirmaciones el reporte pasa a Reparado.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <ProgresoConfirmaciones hechas={evidencia.confirmaciones} umbral={umbral} />

        {/* Una reparación ya validada no está en pausa: sus impugnaciones quedaron resueltas (S5). */}
        {!reparado && evidencia.impugnacionesPendientes > 0 && <AvisoImpugnacionPendiente />}

        {!reparado && participacion.puede && (
          <div className="grid gap-2 sm:grid-cols-2">
            {puedeConfirmar && (
              <Button type="button" onClick={confirmar} disabled={confirmando || impugnando}>
                <CheckCircle2 className="mr-2 size-4" aria-hidden="true" />
                {confirmando ? "Confirmando..." : "Confirmar reparación"}
              </Button>
            )}
            {puedeImpugnar && (
              <Button
                type="button"
                variant="outline"
                className="border-destructive/45 text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => setDialogoAbierto(true)}
                disabled={confirmando || impugnando}
              >
                <Flag className="mr-2 size-4" aria-hidden="true" />
                Impugnar
              </Button>
            )}
          </div>
        )}

        {!reparado && participacion.yaVerifico === "confirmacion" && (
          <p className="text-xs text-muted-foreground">
            Tu confirmación ya está registrada. Gracias por verificar la reparación.
          </p>
        )}

        {!reparado && participacion.yaVerifico === "impugnacion" && (
          <p className="text-xs text-muted-foreground">
            Tu impugnación está pendiente de revisión. La verificación sigue en pausa
            hasta que un administrador la resuelva.
          </p>
        )}

        {!reparado && !participacion.puede && participacion.motivo && (
          <AvisoParticipacion motivo={participacion.motivo} />
        )}

        <DialogoImpugnar
          abierto={dialogoAbierto}
          cambiandoAbierto={setDialogoAbierto}
          enviando={impugnando}
          motivo={motivo}
          onMotivo={setMotivo}
          onEnviar={impugnar}
        />
      </CardContent>
    </Card>
  )
}

/**
 * Formulario mínimo mobile-first: una foto con cámara, la frase que describe el
 * arreglo y la verificación anti bots del resto del sitio (S13, S16). Reusa el
 * pipeline existente: la foto se optimiza en el navegador y entra en la moderación
 * de siempre.
 */
function FormularioEvidenciaReparacion({
  onInformar,
}: {
  onInformar: AccionesEvidenciaReparacion["onInformar"]
}) {
  const router = useRouter()
  const [imagen, setImagen] = useState<File | null>(null)
  const [frase, setFrase] = useState("")
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [captchaReset, setCaptchaReset] = useState(0)
  const [enviando, setEnviando] = useState(false)
  const fraseId = useId()

  const necesitaCaptcha = TURNSTILE_CONFIGURADO
  const captchaNoDisponible = TURNSTILE_NO_DISPONIBLE
  const puedeEnviar = Boolean(imagen)
    && frase.length > 0
    && !enviando
    && !captchaNoDisponible
    && (!necesitaCaptcha || captchaToken !== null)

  /** Vuelve a pedir un challenge: el token anterior se consumió en el intento. */
  const pedirNuevoCaptcha = () => {
    if (!necesitaCaptcha) return
    setCaptchaToken(null)
    setCaptchaReset((valor) => valor + 1)
  }

  const elegirImagen = (archivo: File | null) => {
    setImagen(archivo)
  }

  const enviar = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!imagen || !puedeEnviar) return

    setEnviando(true)
    try {
      const optimizada = await optimizeReportImage(imagen)
      const resultado = await onInformar(frase, optimizada.file, captchaToken)
      if (!resultado.success) {
        toast.error(resultado.error ?? "No pudimos informar la reparación.")
        return
      }
      toast.success("Evidencia enviada", {
        description: "La foto pasa por moderación antes de publicarse.",
      })
      setImagen(null)
      setFrase("")
      router.refresh()
    } catch (error) {
      console.error("Error al informar la reparación:", error)
      toast.error(
        error instanceof Error && error.message
          ? error.message
          : "No pudimos informar la reparación.",
      )
    } finally {
      pedirNuevoCaptcha()
      setEnviando(false)
    }
  }

  return (
    <Card className="gap-0">
      <CardHeader className="pb-3">
        <CardTitle className="text-base md:text-xl">¿Ya lo arreglaron? Informá la reparación</CardTitle>
        <CardDescription className="text-xs md:text-sm">
          Subí una foto del lugar. El reporte no cambia de estado hasta que la comunidad
          la confirme.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <form onSubmit={enviar} className="space-y-3">
          <div className="space-y-2">
            <input
              id="evidencia-foto-camara"
              type="file"
              accept={REPORT_IMAGE_ACCEPT_ATTR}
              capture="environment"
              className="sr-only"
              disabled={enviando}
              onChange={(event) => elegirImagen(event.target.files?.[0] ?? null)}
            />
            <label
              htmlFor="evidencia-foto-camara"
              className="flex cursor-pointer flex-col items-center gap-1 rounded-[var(--radius)] border border-dashed border-primary/55 bg-primary/5 px-3 py-5 text-center focus-within:ring-2 focus-within:ring-ring"
            >
              <Camera className="size-6 text-primary" aria-hidden="true" />
              <span className="text-sm font-semibold">Sacar la foto ahora</span>
              <span className="text-xs text-muted-foreground">
                JPG, PNG o WebP · hasta {Math.round(REPORT_IMAGE_MAX_SOURCE_BYTES / (1024 * 1024))} MB
              </span>
            </label>
            <input
              id="evidencia-foto-galeria"
              type="file"
              accept={REPORT_IMAGE_ACCEPT_ATTR}
              className="sr-only"
              disabled={enviando}
              onChange={(event) => elegirImagen(event.target.files?.[0] ?? null)}
            />
            <label
              htmlFor="evidencia-foto-galeria"
              className="inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-pill)] border border-border bg-card px-4 text-sm font-medium focus-within:ring-2 focus-within:ring-ring"
            >
              <Images className="size-4" aria-hidden="true" />
              Elegir de la galería
            </label>
            {imagen && (
              <p className="text-xs text-muted-foreground">
                Foto elegida: {imagen.name}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label htmlFor={fraseId} className="text-sm font-medium">
              {PREGUNTA_QUE_SE_ARREGLO}
            </label>
            <select
              id={fraseId}
              value={frase}
              onChange={(event) => setFrase(event.target.value)}
              disabled={enviando}
              className={ESTILO_SELECT_FRASE}
            >
              <option value="">{PLACEHOLDER_FRASE_REPARACION}</option>
              {FRASES_REPARACION.map(({ key, label }) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              La foto pasa por la moderación de siempre antes de publicarse.
            </p>
          </div>

          {captchaNoDisponible && (
            <Alert variant="destructive">
              <AlertTitle>Verificación de seguridad no disponible</AlertTitle>
              <AlertDescription>{MENSAJE_CAPTCHA_NO_DISPONIBLE}</AlertDescription>
            </Alert>
          )}
          {necesitaCaptcha && !captchaNoDisponible && (
            <div className="space-y-1">
              <p className="text-sm font-medium">Verificación de seguridad</p>
              <TurnstileWidget
                onTokenChange={setCaptchaToken}
                resetSignal={captchaReset}
                action={ACCION_CAPTCHA_INFORMAR_REPARACION}
              />
            </div>
          )}

          <Button type="submit" className="w-full" disabled={!puedeEnviar}>
            <MessageCircle className="mr-2 size-4" aria-hidden="true" />
            {enviando ? "Enviando..." : "Enviar evidencia"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

/**
 * Resumen compacto de la reparación para la ficha (S11, S13): dice en una línea qué
 * estado tiene la evidencia y abre la hoja con la comparación y las acciones.
 *
 * El estado que muestra es siempre el de la evidencia, nunca el del reporte: un
 * reporte Pendiente con una reparación informada no se presenta como «Reparado».
 *
 * El resumen ofrece el acceso alto «¿Ya lo arreglaron?» y abre la hoja de reparación;
 * el control flotante también conserva ese acceso para quien puede informar o ver evidencia.
 */
export function ResumenReparacion({
  seccion,
  onVer,
}: {
  seccion: SeccionReparacionVista
  /** Recibe el botón que abrió la hoja para devolverle el foco al cerrarla. */
  onVer: (disparador: HTMLElement | null) => void
}) {
  const botonRef = useRef<HTMLButtonElement>(null)
  const { evidencia } = seccion
  // Sin evidencia y sin permiso (invitado, sesión anónima, operador) la franja
  // igual se muestra: invita a ingresar en vez de esconder el flujo.
  if (!evidencia && !seccion.puedeInformar) {
    return (
      <div className="flex items-center gap-3 rounded-[var(--radius)] border border-border bg-card px-3 py-2 shadow-[var(--card-shadow)]">
        <span
          aria-hidden="true"
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-[var(--radius)] bg-primary/10 text-primary"
        >
          <Camera className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">¿Ya lo arreglaron?</p>
          <p className="text-xs text-muted-foreground">
            Iniciá sesión con tu cuenta para informar la reparación.
          </p>
        </div>
        <Button asChild size="sm" className="shrink-0">
          <Link href="/auth">Ingresar</Link>
        </Button>
      </div>
    )
  }

  if (!evidencia) {
    return (
      <div className="flex items-center gap-3 rounded-[var(--radius)] border border-border bg-card px-3 py-2 shadow-[var(--card-shadow)]">
        <span aria-hidden="true" className="inline-flex size-10 shrink-0 items-center justify-center rounded-[var(--radius)] bg-primary/10 text-primary">
          <Camera className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">¿Ya lo arreglaron?</p>
          <p className="text-xs text-muted-foreground">Informá la reparación con una foto.</p>
        </div>
        <Button ref={botonRef} type="button" size="sm" aria-haspopup="dialog" className="shrink-0" onClick={() => onVer(botonRef.current)}>
          Informar
        </Button>
      </div>
    )
  }

  const estado =
    evidencia.estado === "reparado"
      ? "Reparado"
      : evidencia.estado === "informada"
        ? "Reparación informada"
        : `En verificación · ${evidencia.confirmaciones} de ${seccion.umbral} confirmaciones`

  return (
    <div className="flex items-center gap-3 rounded-[var(--radius)] border border-border bg-card px-3 py-2 shadow-[var(--card-shadow)]">
      <span
        aria-hidden="true"
        className="inline-flex size-10 shrink-0 items-center justify-center rounded-[var(--radius)] bg-primary/10 text-primary"
      >
        {evidencia.estado === "reparado" ? <ShieldCheck className="size-5" /> : <Camera className="size-5" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">Reparación</p>
        <p className="truncate text-xs text-muted-foreground">{estado}</p>
      </div>
      <Button
        ref={botonRef}
        type="button"
        size="sm"
        aria-haspopup="dialog"
        className="shrink-0"
        onClick={() => onVer(botonRef.current)}
      >
        Ver la evidencia
      </Button>
    </div>
  )
}

/**
 * Sección de reparación de la ficha del reporte: comparación «Antes / Después»,
 * estado de la verificación con sus acciones y, cuando corresponde, el formulario
 * para informar una reparación nueva.
 */
export function EvidenciaReparacion({ seccion, fotoAntes, acciones }: EvidenciaReparacionProps) {
  const { evidencia } = seccion

  return (
    <div className="flex flex-col gap-4">
      {evidencia && evidencia.estado !== "informada" && (
        <ComparadorAntesDespues evidencia={evidencia} fotoAntes={fotoAntes} />
      )}
      {evidencia && (
        <TarjetaEstadoEvidencia evidencia={evidencia} umbral={seccion.umbral} acciones={acciones} />
      )}
      {seccion.puedeInformar && (
        <FormularioEvidenciaReparacion onInformar={acciones.onInformar} />
      )}
    </div>
  )
}
