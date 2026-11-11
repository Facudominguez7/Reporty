"use client"
/**
 * Tarjetas de la cola administrativa de reparaciones (S8).
 *
 * Cada sub-vista decide un solo tipo de decisión: aprobar o cancelar la revisión
 * de reparado de una evidencia en verificación, o
 * revertir una reparación validada. Las tarjetas muestran la foto del «antes» y
 * del «después» para juzgar una irregularidad sin abrir el reporte (S2), y los
 * mensajes reflejan el estado real que devuelve la base sin mostrar identidades
 * de quienes confirmaron o impugnaron.
 */
import { useState, useTransition } from "react"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { EvidenciaEnDecision } from "@/lib/moderation/evidencia-reparacion-admin.server"
import {
  MOTIVO_CANCELACION_MAX,
  mensajeDeEvidenciaResuelta,
  payloadDeCancelacion,
} from "@/lib/moderation/evidencia-reparacion-mensajes"
import type { AccionEvidenciaAdministrativa } from "@/lib/use-cases/reportes/evidencia-reparacion"
import { resolverEvidenciaColaAction } from "./reparaciones-actions"

const dateFormatter = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "medium",
  timeZone: "America/Argentina/Buenos_Aires",
})

/** Formatea una fecha ISO sin exponer la zona horaria del servidor. */
function formatDate(value: string | null) {
  if (!value) return "sin fecha"
  return dateFormatter.format(new Date(value))
}

/** Enlace al reporte afectado, con su número y título. */
function EnlaceReporte({ reporteId, titulo }: { reporteId: number; titulo: string }) {
  return (
    <Link href={`/reportes/${reporteId}`} className="underline-offset-4 hover:underline">
      Reporte #{reporteId} · {titulo}
    </Link>
  )
}

/** Contador visible de confirmaciones de la evidencia. */
function Contadores({ confirmaciones, umbral }: {
  confirmaciones: number
  umbral: number
}) {
  return (
    <dl className="grid gap-2 text-sm sm:grid-cols-3">
      <div>
        <dt className="text-xs text-muted-foreground">Confirmaciones</dt>
        <dd className="font-medium">{confirmaciones} de {umbral}</dd>
      </div>
    </dl>
  )
}

/**
 * Comparación «Antes / Después» de una tarjeta: es lo que permite detectar una
 * foto que no corresponde al lugar o al arreglo sin salir de la cola (S2).
 *
 * @param antes - Miniatura de la foto original del reporte, si existe.
 * @param despues - Miniatura de la foto que subió el autor de la reparación, si existe.
 * @param titulo - Título del reporte, usado en el texto alternativo de cada foto.
 */
function ComparacionFotos({ antes, despues, titulo }: { antes: string | null; despues: string | null; titulo: string }) {
  const fotos = [
    { etiqueta: "Antes", url: antes },
    { etiqueta: "Después", url: despues },
  ]

  return (
    <div className="grid grid-cols-2 gap-3">
      {fotos.map(({ etiqueta, url }) => (
        <figure key={etiqueta} className="space-y-1">
          <figcaption className="text-xs uppercase tracking-wide text-muted-foreground">{etiqueta}</figcaption>
          {url ? (
            <a href={url} target="_blank" rel="noreferrer" className="block">
              <Image
                unoptimized
                src={url}
                alt={`${etiqueta} de la reparación del reporte: ${titulo}`}
                width={320}
                height={240}
                className="h-32 w-full rounded-md border object-cover"
              />
            </a>
          ) : (
            <p className="flex h-32 items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">
              Sin foto
            </p>
          )}
        </figure>
      ))}
    </div>
  )
}

/** Props del panel de cancelación de la revisión de reparado (S1, S3). */
export type PanelCancelarRevisionProps = {
  motivo: string
  procesando: boolean
  onCambiarMotivo: (motivo: string) => void
  onConfirmar: () => void
  onVolver: () => void
}

/**
 * Panel de cancelación de la revisión de reparado, con motivo opcional (S1, S3).
 * Explica el efecto durable antes de confirmar: la evidencia queda rechazada, el
 * reporte sigue Pendiente y las fotos originales se conservan.
 *
 * @param props - Motivo escrito, estado del envío y los tres manejadores del panel.
 */
export function PanelCancelarRevision({ motivo, procesando, onCambiarMotivo, onConfirmar, onVolver }: PanelCancelarRevisionProps) {
  return (
    <div className="w-full space-y-2 rounded-md border border-dashed p-3">
      <Label htmlFor="motivo-cancelacion" className="text-xs uppercase tracking-wide text-muted-foreground">
        Motivo de la cancelación (opcional)
      </Label>
      <Textarea
        id="motivo-cancelacion"
        value={motivo}
        maxLength={MOTIVO_CANCELACION_MAX}
        disabled={procesando}
        autoFocus
        aria-describedby="ayuda-cancelacion"
        className="min-h-20"
        placeholder="Por ejemplo: la foto es una captura de pantalla y no muestra el arreglo."
        onChange={(evento) => onCambiarMotivo(evento.target.value)}
      />
      <p className="text-xs text-muted-foreground">{motivo.length}/{MOTIVO_CANCELACION_MAX}</p>
      <p id="ayuda-cancelacion" className="text-sm text-muted-foreground">
        La evidencia queda rechazada, el reporte sigue Pendiente y sus fotos originales se conservan.
        Si el autor tiene un correo registrado, se le avisa qué pasó.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="destructive" disabled={procesando} onClick={onConfirmar}>
          {procesando ? "Cancelando la revisión…" : "Confirmar cancelación"}
        </Button>
        <Button variant="outline" disabled={procesando} onClick={onVolver}>
          Volver
        </Button>
      </div>
    </div>
  )
}

/** Tarjeta de una evidencia en verificación, aprobable o cancelable (S1, S2). */
function TarjetaEvidencia({ evidencia, umbral }: { evidencia: EvidenciaEnDecision; umbral: number }) {
  const [procesando, iniciarTransicion] = useTransition()
  const [mensaje, setMensaje] = useState("")
  const [cancelando, setCancelando] = useState(false)
  const [motivo, setMotivo] = useState("")
  const router = useRouter()

  function resolver(accion: AccionEvidenciaAdministrativa, motivoDeCancelacion?: string) {
    iniciarTransicion(async () => {
      try {
        const resultado = await resolverEvidenciaColaAction(evidencia.evidenciaId, accion, motivoDeCancelacion)
        setMensaje(resultado.success ? mensajeDeEvidenciaResuelta(resultado.data) : resultado.error)
        if (resultado.success) {
          setCancelando(false)
          setMotivo("")
          router.refresh()
        }
      } catch {
        setMensaje("No se pudo resolver la evidencia. Recargá la cola antes de reintentar.")
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle><EnlaceReporte reporteId={evidencia.reporteId} titulo={evidencia.titulo} /></CardTitle>
        <CardDescription>
          Publicada el <time dateTime={evidencia.publicadaAt ?? undefined}>{formatDate(evidencia.publicadaAt)}</time>
        </CardDescription>
        <Badge variant="secondary">En verificación</Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        <ComparacionFotos
          antes={evidencia.miniaturaReporte ?? evidencia.fotoReporte}
          despues={evidencia.miniaturaEvidencia ?? evidencia.fotoEvidencia}
          titulo={evidencia.titulo}
        />
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Reparación informada</p>
          <p className="mt-1 text-sm text-foreground">{evidencia.comentario}</p>
        </div>
        <Contadores
          confirmaciones={evidencia.confirmaciones}
          umbral={umbral}
        />
        {cancelando ? (
          <PanelCancelarRevision
            motivo={motivo}
            procesando={procesando}
            onCambiarMotivo={setMotivo}
            onConfirmar={() => resolver("rechazar", payloadDeCancelacion(motivo))}
            onVolver={() => setCancelando(false)}
          />
        ) : null}
        <p role="status" aria-live="polite" aria-atomic="true">{procesando ? "Resolviendo evidencia…" : mensaje}</p>
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2">
        <Button disabled={procesando || cancelando} onClick={() => resolver("aprobar")}>
          Aprobar reparación
        </Button>
        {cancelando ? null : (
          <Button
            variant="destructive"
            disabled={procesando}
            aria-expanded={cancelando}
            onClick={() => setCancelando(true)}
          >
            Cancelar revisión
          </Button>
        )}
      </CardFooter>
    </Card>
  )
}

/** Tarjeta de una reparación validada, con la acción de revertir. */
function TarjetaValidada({ evidencia, umbral }: { evidencia: EvidenciaEnDecision; umbral: number }) {
  const [procesando, iniciarTransicion] = useTransition()
  const [mensaje, setMensaje] = useState("")
  const router = useRouter()

  function revertir() {
    if (!window.confirm("¿Revertir la reparación? El reporte volverá a Pendiente y se descontarán los cinco puntos del autor.")) return
    iniciarTransicion(async () => {
      try {
        const resultado = await resolverEvidenciaColaAction(evidencia.evidenciaId, "revertir")
        setMensaje(resultado.success ? mensajeDeEvidenciaResuelta(resultado.data) : resultado.error)
        if (resultado.success) router.refresh()
      } catch {
        setMensaje("No se pudo revertir la reparación. Recargá la cola antes de reintentar.")
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle><EnlaceReporte reporteId={evidencia.reporteId} titulo={evidencia.titulo} /></CardTitle>
        <CardDescription>
          Publicada el <time dateTime={evidencia.publicadaAt ?? undefined}>{formatDate(evidencia.publicadaAt)}</time>
        </CardDescription>
        <Badge variant="secondary">Reparada</Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        <ComparacionFotos
          antes={evidencia.miniaturaReporte ?? evidencia.fotoReporte}
          despues={evidencia.miniaturaEvidencia ?? evidencia.fotoEvidencia}
          titulo={evidencia.titulo}
        />
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Reparación validada</p>
          <p className="mt-1 text-sm text-foreground">{evidencia.comentario}</p>
        </div>
        <Contadores
          confirmaciones={evidencia.confirmaciones}
          umbral={umbral}
        />
        <p role="status" aria-live="polite" aria-atomic="true">{procesando ? "Revirtiendo reparación…" : mensaje}</p>
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2">
        <Button className="h-auto whitespace-normal text-left" variant="outline" disabled={procesando} onClick={revertir}>
          Revertir reparación y devolver el reporte a Pendiente
        </Button>
      </CardFooter>
    </Card>
  )
}

/** Renderiza una página acotada de evidencias en verificación. */
export function ColaEvidenciasEnVerificacion({ evidencias, umbral }: { evidencias: EvidenciaEnDecision[]; umbral: number }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {evidencias.map((evidencia) => (
        <TarjetaEvidencia key={evidencia.evidenciaId} evidencia={evidencia} umbral={umbral} />
      ))}
    </div>
  )
}

/** Renderiza una página acotada de reparaciones validadas que se pueden revertir. */
export function ColaEvidenciasValidadas({ validadas, umbral }: { validadas: EvidenciaEnDecision[]; umbral: number }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {validadas.map((evidencia) => (
        <TarjetaValidada key={evidencia.evidenciaId} evidencia={evidencia} umbral={umbral} />
      ))}
    </div>
  )
}
