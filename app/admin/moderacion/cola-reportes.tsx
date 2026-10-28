"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import type { RevisionRechazoReporte } from "@/lib/moderation/report-status-reviews.server"
import { resolverRevisionRechazoAction } from "./reportes-actions"

const dateFormatter = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "medium",
  timeZone: "America/Argentina/Buenos_Aires",
})

function formatDate(value: string) {
  return dateFormatter.format(new Date(value))
}

function TarjetaRevisionReporte({ revision }: { revision: RevisionRechazoReporte }) {
  const [procesando, iniciarTransicion] = useTransition()
  const [mensaje, setMensaje] = useState("")
  const router = useRouter()

  function resolver(decision: "rechazar" | "descartar") {
    iniciarTransicion(async () => {
      try {
        const resultado = await resolverRevisionRechazoAction(revision.reporteId, decision)
        setMensaje(resultado.success
          ? decision === "rechazar" ? "Reporte rechazado." : "Revisión descartada."
          : resultado.error)
        if (resultado.success) router.refresh()
      } catch {
        setMensaje("No se pudo resolver la revisión. Actualizá la cola antes de reintentar.")
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Link href={`/reportes/${revision.reporteId}`} className="underline-offset-4 hover:underline">
            Reporte #{revision.reporteId} · {revision.titulo}
          </Link>
        </CardTitle>
        <CardDescription>
          En revisión desde <time dateTime={revision.reviewCreatedAt}>{formatDate(revision.reviewCreatedAt)}</time>
        </CardDescription>
        <Badge variant="secondary">Pendiente</Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-foreground">{revision.descripcion || "Sin descripción."}</p>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted-foreground">Votos comunitarios</dt>
            <dd className="font-medium">{revision.noExisteVotes} votos de “No existe”</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Reporte creado</dt>
            <dd><time dateTime={revision.reportCreatedAt}>{formatDate(revision.reportCreatedAt)}</time></dd>
          </div>
        </dl>
        <p role="status" aria-live="polite" aria-atomic="true">{procesando ? "Resolviendo revisión…" : mensaje}</p>
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2">
        <Button variant="destructive" disabled={procesando} onClick={() => resolver("rechazar")}>
          Rechazar reporte
        </Button>
        <Button variant="outline" disabled={procesando} onClick={() => resolver("descartar")}>
          Descartar revisión
        </Button>
      </CardFooter>
    </Card>
  )
}

export function ColaRevisionesReportes({ revisiones }: { revisiones: RevisionRechazoReporte[] }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {revisiones.map((revision) => <TarjetaRevisionReporte key={revision.reporteId} revision={revision} />)}
    </div>
  )
}
