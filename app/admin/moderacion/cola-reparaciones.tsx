"use client"
/**
 * Tarjetas de la cola administrativa de reparaciones (S8).
 *
 * Cada sub-vista decide un solo tipo de decisión: resolver impugnaciones,
 * aprobar o rechazar una evidencia en verificación, o revertir una reparación
 * validada. Los mensajes reflejan el estado real que devuelve la base y nunca
 * muestran identidades de quienes confirmaron o impugnaron.
 */
import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import type { EvidenciaEnDecision, ImpugnacionPendiente } from "@/lib/moderation/evidencia-reparacion-admin.server"
import {
  mensajeDeEvidenciaResuelta,
  mensajeDeImpugnacionResuelta,
} from "@/lib/moderation/evidencia-reparacion-mensajes"
import type { AccionEvidenciaAdministrativa, DecisionImpugnacionReparacion } from "@/lib/use-cases/reportes/evidencia-reparacion"
import { resolverEvidenciaColaAction, resolverImpugnacionColaAction } from "./reparaciones-actions"

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

/** Contadores visibles de la evidencia: confirmaciones, impugnaciones y pendientes. */
function Contadores({ confirmaciones, impugnaciones, impugnacionesPendientes, umbral }: {
  confirmaciones: number
  impugnaciones: number
  impugnacionesPendientes: number
  umbral: number
}) {
  return (
    <dl className="grid gap-2 text-sm sm:grid-cols-3">
      <div>
        <dt className="text-xs text-muted-foreground">Confirmaciones</dt>
        <dd className="font-medium">{confirmaciones} de {umbral}</dd>
      </div>
      <div>
        <dt className="text-xs text-muted-foreground">Impugnaciones</dt>
        <dd className="font-medium">{impugnaciones} en total</dd>
      </div>
      <div>
        <dt className="text-xs text-muted-foreground">Impugnaciones pendientes</dt>
        <dd className="font-medium">{impugnacionesPendientes}</dd>
      </div>
    </dl>
  )
}

/** Tarjeta de una impugnación pendiente con sus dos decisiones posibles. */
function TarjetaImpugnacion({ impugnacion, umbral }: { impugnacion: ImpugnacionPendiente; umbral: number }) {
  const [procesando, iniciarTransicion] = useTransition()
  const [mensaje, setMensaje] = useState("")
  const router = useRouter()

  function resolver(decision: DecisionImpugnacionReparacion) {
    iniciarTransicion(async () => {
      try {
        const resultado = await resolverImpugnacionColaAction(impugnacion.verificacionId, decision)
        setMensaje(resultado.success ? mensajeDeImpugnacionResuelta(resultado.data) : resultado.error)
        if (resultado.success) router.refresh()
      } catch {
        setMensaje("No se pudo resolver la impugnación. Actualizá la cola antes de reintentar.")
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle><EnlaceReporte reporteId={impugnacion.reporteId} titulo={impugnacion.titulo} /></CardTitle>
        <CardDescription>
          Impugnación recibida el <time dateTime={impugnacion.creadoAt}>{formatDate(impugnacion.creadoAt)}</time>
        </CardDescription>
        <Badge variant="secondary">Impugnación pendiente</Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        <blockquote className="border-l-2 border-border pl-3 text-sm">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Motivo de la impugnación</p>
          <p className="mt-1 text-foreground">{impugnacion.motivo || "Sin motivo registrado."}</p>
        </blockquote>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Reparación informada</p>
          <p className="mt-1 text-sm text-foreground">{impugnacion.comentario}</p>
        </div>
        <Contadores
          confirmaciones={impugnacion.confirmaciones}
          impugnaciones={impugnacion.impugnaciones}
          impugnacionesPendientes={impugnacion.impugnacionesPendientes}
          umbral={umbral}
        />
        <p role="status" aria-live="polite" aria-atomic="true">{procesando ? "Resolviendo impugnación…" : mensaje}</p>
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2">
        <Button variant="destructive" disabled={procesando} onClick={() => resolver("aceptada")}>
          Aceptar impugnación
        </Button>
        <Button variant="outline" disabled={procesando} onClick={() => resolver("descartada")}>
          Descartar impugnación
        </Button>
      </CardFooter>
    </Card>
  )
}

/** Tarjeta de una evidencia en verificación, aprobable o rechazable. */
function TarjetaEvidencia({ evidencia, umbral }: { evidencia: EvidenciaEnDecision; umbral: number }) {
  const [procesando, iniciarTransicion] = useTransition()
  const [mensaje, setMensaje] = useState("")
  const router = useRouter()

  function resolver(accion: AccionEvidenciaAdministrativa) {
    iniciarTransicion(async () => {
      try {
        const resultado = await resolverEvidenciaColaAction(evidencia.evidenciaId, accion)
        setMensaje(resultado.success ? mensajeDeEvidenciaResuelta(resultado.data) : resultado.error)
        if (resultado.success) router.refresh()
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
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Reparación informada</p>
          <p className="mt-1 text-sm text-foreground">{evidencia.comentario}</p>
        </div>
        <Contadores
          confirmaciones={evidencia.confirmaciones}
          impugnaciones={evidencia.impugnaciones}
          impugnacionesPendientes={evidencia.impugnacionesPendientes}
          umbral={umbral}
        />
        <p role="status" aria-live="polite" aria-atomic="true">{procesando ? "Resolviendo evidencia…" : mensaje}</p>
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2">
        <Button disabled={procesando} onClick={() => resolver("aprobar")}>
          Aprobar reparación
        </Button>
        <Button variant="destructive" disabled={procesando} onClick={() => resolver("rechazar")}>
          Rechazar evidencia
        </Button>
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
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Reparación validada</p>
          <p className="mt-1 text-sm text-foreground">{evidencia.comentario}</p>
        </div>
        <Contadores
          confirmaciones={evidencia.confirmaciones}
          impugnaciones={evidencia.impugnaciones}
          impugnacionesPendientes={evidencia.impugnacionesPendientes}
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

/** Renderiza una página acotada de impugnaciones pendientes. */
export function ColaImpugnaciones({ impugnaciones, umbral }: { impugnaciones: ImpugnacionPendiente[]; umbral: number }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {impugnaciones.map((impugnacion) => (
        <TarjetaImpugnacion key={impugnacion.verificacionId} impugnacion={impugnacion} umbral={umbral} />
      ))}
    </div>
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
