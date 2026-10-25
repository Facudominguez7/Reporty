"use client"
/** Tarjetas de revisión privada con acciones explícitas y anuncios accesibles. */
import { useState, useTransition } from "react"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card"
import type { ImagenAdministrativa, OperacionRevision } from "@/lib/moderation/administracion.server"
import { revisarImagenAction } from "./actions"

/** Presenta una evidencia sin rutas privadas y permite recuperar solo mediante intención explícita. */
function TarjetaRevision({ imagen }: { imagen: ImagenAdministrativa }) {
  const [pendiente, iniciarTransicion] = useTransition()
  const [mensaje, actualizarMensaje] = useState("")
  const [imagenAusente, marcarAusente] = useState(false)
  const router = useRouter()
  const revisable = imagen.decision === "REVIEW" && imagen.estado === "pendiente"
  const reclamada = imagen.estado === "reclamada"
  const publicando = imagen.decision === "APPROVED" && imagen.estado === "publicando"
  const terminal = ["rechazada", "publicada"].includes(imagen.estado)
  const etiquetas: Record<string, string> = { pendiente: "Pendiente de revisión", reclamada: "Clasificación reclamada", publicando: "Aprobada · publicación pendiente", publicada: "Publicada", rechazada: "Rechazada" }

  /** Deshabilita todas las decisiones de esta evidencia mientras se procesa la operación. */
  function actuar(operacion: OperacionRevision) {
    iniciarTransicion(async () => {
      try {
        const resultado = await revisarImagenAction(imagen.id, operacion)
        actualizarMensaje(resultado.mensaje)
        router.refresh()
      } catch { actualizarMensaje("No se pudo completar la operación. Actualizá la cola antes de reintentar.") }
    })
  }

  return <Card>
    <CardHeader>
      <CardTitle><Link href={`/reportes/${imagen.reporteId}`}>Reporte #{imagen.reporteId}</Link></CardTitle>
      <CardDescription><time dateTime={imagen.fecha}>{imagen.fecha}</time></CardDescription>
      <Badge variant="secondary">{etiquetas[imagen.estado] ?? "Requiere atención"}</Badge>
    </CardHeader>
    <CardContent className="flex flex-col gap-4">
      {!terminal && !imagenAusente ? <Image unoptimized src={`/api/moderacion/imagenes/${imagen.id}`} width={640} height={480} alt={`Evidencia privada del reporte ${imagen.reporteId}, pendiente de decisión administrativa`} className="max-h-80 w-full rounded-md object-contain" onError={() => marcarAusente(true)} /> : null}
      {imagenAusente || imagen.cargaPendiente ? <p role="status">Imagen no disponible o carga no confirmada. Solo se puede aprobar si el servidor verifica los bytes privados; si faltan, rechazá la solicitud.</p> : null}
      <ul className="list-disc pl-5 text-sm text-muted-foreground">{imagen.motivos.map((motivo) => <li key={motivo}>{motivo}</li>)}</ul>
      {reclamada ? <p className="text-sm">Una clasificación pudo interrumpirse. Recuperar invalida su token y devuelve la foto a revisión humana; no vuelve a consumir proveedor. No recuperes trabajo activo.</p> : null}
      {terminal ? <p className="text-sm">La decisión y su auditoría se conservan. El borrado privado puede reintentarse si falló.</p> : null}
      <p role="status" aria-live="polite" aria-atomic="true">{pendiente ? "Procesando decisión…" : mensaje}</p>
    </CardContent>
    <CardFooter className="flex flex-wrap gap-2">
      {revisable ? <><Button disabled={pendiente || imagenAusente} onClick={() => actuar("aprobar")}>Aprobar y publicar</Button><Button variant="destructive" disabled={pendiente} onClick={() => actuar("rechazar")}>Rechazar</Button></> : null}
      {reclamada ? <Button variant="outline" disabled={pendiente} onClick={() => actuar("recuperar")}>Recuperar clasificación interrumpida</Button> : null}
      {publicando ? <Button disabled={pendiente} onClick={() => actuar("publicar")}>Reintentar publicación sin reclasificar</Button> : null}
      {terminal ? <Button variant="outline" disabled={pendiente} onClick={() => actuar("limpiar")}>Reintentar limpieza privada</Button> : null}
    </CardFooter>
  </Card>
}

/** Renderiza una página acotada de la cola; no realiza consultas desde el cliente. */
export function ColaModeracion({ imagenes }: { imagenes: ImagenAdministrativa[] }) {
  return <div className="grid gap-6 lg:grid-cols-2">{imagenes.map((imagen) => <TarjetaRevision key={imagen.id} imagen={imagen} />)}</div>
}
