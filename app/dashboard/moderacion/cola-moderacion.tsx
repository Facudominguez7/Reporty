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
import { conciliarAvisoMascotaAction, revisarImagenAction, reintentarAvisosMascotaAction } from "./actions"

const dateFormatter = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "medium",
  timeStyle: "short",
  hourCycle: "h23",
  timeZone: "America/Argentina/Buenos_Aires",
})

function formatModerationDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "Fecha no disponible" : dateFormatter.format(date)
}

/** Presenta una evidencia sin rutas privadas y permite recuperar solo mediante intención explícita. */
function TarjetaRevision({ imagen }: { imagen: ImagenAdministrativa }) {
  const [pendiente, iniciarTransicion] = useTransition()
  const [mensaje, actualizarMensaje] = useState("")
  const [imagenAusente, marcarAusente] = useState(false)
  const router = useRouter()
  const revisable = imagen.decision === "REVIEW" && imagen.estado === "pendiente"
  const reclamada = imagen.estado === "reclamada"
  const publicando = imagen.decision === "APPROVED" && imagen.estado === "publicando"
  const mascota = imagen.tipo === "mascota"
  const terminal = imagen.soloAviso || ["rechazada", "publicada", "retirada"].includes(imagen.estado)
  const etiquetas: Record<string, string> = { pendiente: "Pendiente de revisión", reclamada: "Clasificación reclamada", publicando: "Aprobada · publicación pendiente", publicada: "Publicada", rechazada: "Rechazada", retirada: "Publicación retirada" }

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
      <CardTitle>{mascota ? imagen.soloAviso ? `Aviso de estado · mascota ${imagen.tipoAnimal ?? ""} · #${imagen.mascotaId}` : `Mascota ${imagen.tipoAnimal ? `· ${imagen.tipoAnimal}` : ""} · revisión de foto` : imagen.decision !== "REJECTED" ? <Link href={`/reportes/${imagen.reporteId}`}>Reporte #{imagen.reporteId}</Link> : `Reporte #${imagen.reporteId} · retirado`}</CardTitle>
      <CardDescription><time dateTime={imagen.fecha}>{formatModerationDate(imagen.fecha)}</time></CardDescription>
      <Badge variant="secondary">{etiquetas[imagen.estado] ?? "Requiere atención"}</Badge>
    </CardHeader>
    <CardContent className="flex flex-col gap-4">
      {!terminal && !imagenAusente ? <Image unoptimized src={`/api/moderacion/imagenes/${imagen.id}`} width={640} height={480} alt={`Evidencia privada ${mascota ? "de mascota" : `del reporte ${imagen.reporteId}`}, pendiente de decisión administrativa`} className="max-h-80 w-full rounded-md object-contain" onError={() => marcarAusente(true)} /> : null}
      {imagenAusente || imagen.cargaPendiente ? <p role="status">Imagen no disponible o carga no confirmada. Solo se puede aprobar si el servidor verifica los bytes privados; si faltan, rechazá la solicitud.</p> : null}
      <ul className="list-disc pl-5 text-sm text-muted-foreground">{imagen.motivos?.map((motivo) => <li key={motivo}>{motivo}</li>)}</ul>
      {imagen.avisoMascota ? <p role="status" className="text-sm">Aviso: {imagen.avisoMascota.conciliadoAt ? `aceptación verificada y conciliada el ${imagen.avisoMascota.conciliadoAt}` : imagen.avisoMascota.conciliacion ? "aceptación incierta; requiere verificación manual, no se reenvía" : imagen.avisoMascota.estado}. Intentos: {imagen.avisoMascota.intentos}.</p> : null}
      {mascota && imagen.mascotaId && imagen.avisoMascota && !imagen.avisoMascota.conciliadoAt ? <Button variant="outline" disabled={pendiente || imagen.avisoMascota.conciliacion} onClick={() => iniciarTransicion(async () => { const resultado = await reintentarAvisosMascotaAction(imagen.mascotaId!); actualizarMensaje(resultado.mensaje); router.refresh() })}>Reintentar avisos de estado pendientes</Button> : null}
      {reclamada ? <p className="text-sm">Una clasificación pudo interrumpirse. Recuperar invalida su token y devuelve la foto a revisión humana; no vuelve a consumir proveedor. No recuperes trabajo activo.</p> : null}
      {terminal ? <p className="text-sm">{imagen.soloAviso ? "Este aviso se conserva en la cola hasta entrega confirmada o conciliación administrativa." : mascota ? imagen.estado === "rechazada" ? "La foto fue rechazada; no se creó una mascota ni se otorgaron puntos." : "La decisión y su auditoría se conservan." : imagen.esReemplazo ? "El reemplazo fue rechazado; el reporte y las fotos actuales se conservan." : "La decisión y su auditoría se conservan. El borrado privado puede reintentarse si falló."}</p> : null}
      {imagen.aviso ? <p className="text-sm">Advertencia al autor: {imagen.aviso.conciliacion ? "aceptación incierta; requiere conciliación, sin reenvío" : imagen.aviso.estado}. Intentos: {imagen.aviso.intentos}. No se muestra el destinatario.</p> : null}
      <p role="status" aria-live="polite" aria-atomic="true">{pendiente ? "Procesando decisión…" : mensaje}</p>
    </CardContent>
    <CardFooter className="flex flex-wrap gap-2">
      {revisable ? <><Button disabled={pendiente || imagenAusente} onClick={() => actuar("aprobar")}>Aprobar y publicar</Button><Button variant="destructive" disabled={pendiente} onClick={() => actuar("rechazar")}>Rechazar</Button></> : null}
      {reclamada ? <Button variant="outline" disabled={pendiente} onClick={() => actuar("recuperar")}>Recuperar clasificación interrumpida</Button> : null}
      {publicando ? <Button disabled={pendiente} onClick={() => actuar("publicar")}>Reintentar publicación sin reclasificar</Button> : null}
      {mascota && imagen.mascotaId && imagen.estado === "publicada"  ? <Button variant="destructive" disabled={pendiente} onClick={() => { if (window.confirm("¿Retirar esta publicación? Se revertirán sus puntos de creación una sola vez.")) actuar("retirarMascota") }}>Retirar publicación y revertir puntos</Button> : null}
      {terminal || imagen.motivos.includes("limpieza_publica_pendiente") ? <Button variant="outline" disabled={pendiente} onClick={() => actuar("limpiar")}>Reintentar limpieza de foto</Button> : null}
      {imagen.aviso && ["pendiente", "reclamado"].includes(imagen.aviso.estado) && !imagen.aviso.conciliacion ? <Button className="h-auto whitespace-normal text-left" variant="outline" disabled={pendiente} onClick={() => actuar("avisar")}>Reintentar advertencia al autor</Button> : null}
      {imagen.avisoMascota?.conciliacion ? <div className="space-y-2"><p className="text-sm">Comprobá en el proveedor la clave idempotente mascota/{imagen.avisoMascota.id}. Solo conciliá si verificaste su aceptación; la ventana segura de reenvío terminó.</p><Button className="h-auto whitespace-normal text-left" variant="outline" disabled={pendiente} onClick={() => { if (window.confirm("¿Verificaste la aceptación de este correo en el proveedor? Esta acción registra tu identidad y no reenvía el mensaje.")) iniciarTransicion(async () => { const result = await conciliarAvisoMascotaAction(imagen.avisoMascota!.id); actualizarMensaje(result.mensaje); router.refresh() }) }}>Registrar aceptación verificada, sin reenviar</Button></div> : null}
      {imagen.aviso?.conciliacion ? <div className="space-y-2">
        <p className="text-sm">Verificá manualmente en Resend que aceptó el correo con la clave retiro-reporte/{imagen.reporteId}. Sin evidencia, dejá el aviso pendiente: no confirmes ni reenvíes.</p>
        <Button className="h-auto whitespace-normal text-left" variant="outline" disabled={pendiente} onClick={() => { if (window.confirm("¿Verificaste en Resend la aceptación de este aviso? Se registrará tu identidad; no se enviará otro correo.")) actuar("conciliar") }}>Confirmar aceptación verificada en Resend</Button>
      </div> : null}
    </CardFooter>
  </Card>
}

/** Renderiza una página acotada de la cola; no realiza consultas desde el cliente. */
export function ColaModeracion({ imagenes }: { imagenes: ImagenAdministrativa[] }) {
  return <div className="grid gap-6 lg:grid-cols-2">{imagenes.map((imagen) => <TarjetaRevision key={imagen.id} imagen={imagen} />)}</div>
}
