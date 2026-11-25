"use client"

import { useEffect, useRef, useState } from "react"
import Image from "next/image"
import Link from "next/link"

import { FormularioTomarReporte, useTomaReporte } from "@/components/defensoria/dialogo-tomar-reporte"
import { ChipReporte, tonoEstado, tonoPrioridad } from "@/components/report-detail/chip-reporte"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { useMediaQuery } from "@/hooks/use-media-query"
import { obtenerIdBusquedaDefensoria } from "@/database/queries/reportes/filtro-defensoria"
import { AtribucionBarrios } from "@/components/territorio/atribucion-barrios"

/** Reporte de la bandeja tal como lo entrega la página del servidor. */
export type ReporteBandeja = {
  id: number
  titulo: string
  descripcion: string | null
  categoria: string
  prioridad: string
  estado: string
  ubicacion?: string
  /** Barrio donde cae el reporte (#299); `null` o ausente si no cae en ninguno. */
  barrio?: string | null
  autor: string | null
  createdAt: string
  imageUrl: string | null
  numeroReclamo: string | null
}

type Vista = "pendientes" | "tomados"
type BandejaClientProps = {
  reportes: ReporteBandeja[]
  vistaInicial?: Vista
  busquedaInicial?: string
  pagina?: number
  hayMas?: boolean
}

/** Mantiene la selección y los filtros dentro del panel durante una toma. */
export function BandejaClient({ reportes, vistaInicial = "pendientes", busquedaInicial = "", pagina = 1, hayMas = false }: BandejaClientProps) {
  const escritorio = useMediaQuery("(min-width: 64rem)")
  const vista = vistaInicial
  const [busqueda, setBusqueda] = useState(busquedaInicial)
  const [seleccion, setSeleccion] = useState<ReporteBandeja | null>(null)
  const [reclamos, setReclamos] = useState<Record<number, string>>({})
  const [mensaje, setMensaje] = useState("")
  const formulario = useTomaReporte()
  const ocupado = formulario.enviando
  const disparador = useRef<HTMLButtonElement | null>(null)
  const encabezadoDetalle = useRef<HTMLHeadingElement>(null)
  const panelDetalle = useRef<HTMLElement>(null)
  const buscar = useRef<HTMLInputElement>(null)
  const lista = useRef<HTMLUListElement>(null)
  const filas = reportes.map((reporte) => reclamos[reporte.id] ? {
    ...reporte, estado: "Tomado por Defensoría", numeroReclamo: reclamos[reporte.id],
  } : reporte)
  const pendientes = filas.filter((reporte) => reporte.estado === "Pendiente")
  const tomados = filas.filter((reporte) => reporte.estado === "Tomado por Defensoría")
  const consulta = busquedaInicial
  const idBuscado = obtenerIdBusquedaDefensoria(consulta)
  const visibles = idBuscado !== null ? filas.filter((reporte) => reporte.id === idBuscado) : vista === "pendientes" ? pendientes : tomados
  /** Conserva los filtros aplicados al desplazarse entre páginas. */
  function enlacePagina(destino: number) {
    const parametros = new URLSearchParams({ pagina: String(destino) })
    if (vista !== "pendientes") parametros.set("vista", vista)
    if (busquedaInicial) parametros.set("busqueda", busquedaInicial)
    return `/defensoria?${parametros.toString()}`
  }
  const detalle = seleccion && visibles.find((reporte) => reporte.id === seleccion.id)
  const reporteDialogo = detalle ?? seleccion
  const detalleId = detalle?.id

  useEffect(() => {
    const panel = panelDetalle.current
    const tarjeta = panel?.parentElement
    if (!escritorio || detalleId === undefined || !panel || !tarjeta) return

    /** Ajusta el área desplazable sin mover la lista ni cortar el encabezado. */
    function ajustarAltura() {
      if (!panel || !tarjeta) return
      const arriba = tarjeta.getBoundingClientRect().top
      const altura = document.documentElement.clientHeight - Math.max(0, arriba)
      panel.style.setProperty("--desfase-detalle", `${Math.max(0, -arriba)}px`)
      panel.style.setProperty("--alto-detalle", `${Math.max(0, altura)}px`)
    }

    ajustarAltura()
    window.addEventListener("scroll", ajustarAltura, { passive: true })
    window.addEventListener("resize", ajustarAltura)
    return () => {
      window.removeEventListener("scroll", ajustarAltura)
      window.removeEventListener("resize", ajustarAltura)
    }
  }, [escritorio, detalleId])

  /** Mueve el foco sin perder la posición al cambiar el contenido de la bandeja. */
  function enfocar(elemento: HTMLElement | null) {
    elemento?.focus({ preventScroll: true })
  }

  /** Selecciona la ficha y, en escritorio, pasa el foco al título del detalle. */
  function abrir(reporte: ReporteBandeja, boton: HTMLButtonElement) {
    disparador.current = boton
    if (seleccion?.id !== reporte.id) formulario.limpiar()
    setSeleccion(reporte)
    if (escritorio) requestAnimationFrame(() => enfocar(encabezadoDetalle.current))
  }

  /** Anuncia la toma confirmada y conserva el ancla de la fila vecina si sigue visible. */
  function alTomar(reporteId: number, numero: string) {
    const indice = visibles.findIndex((reporte) => reporte.id === reporteId)
    const vecino = visibles[indice + 1] ?? visibles[indice - 1]
    const boton = vecino ? lista.current?.querySelector<HTMLButtonElement>(`[data-reporte="${vecino.id}"]`) : null
    const posicion = boton?.getBoundingClientRect().top
    setReclamos((previo) => ({ ...previo, [reporteId]: numero }))
    setMensaje(`Reporte #${reporteId} tomado. Ahora está en Tomados.`)
    setSeleccion(null)
    disparador.current = boton ?? null
    requestAnimationFrame(() => {
      if (boton?.isConnected && posicion !== undefined) {
        window.scrollBy(0, boton.getBoundingClientRect().top - posicion)
      }
      if (escritorio) enfocar(disparador.current ?? buscar.current)
    })
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <form action="/defensoria" role="group" aria-label="Estado del reporte" className="flex flex-wrap gap-2">
          {busquedaInicial && idBuscado === null && <input type="hidden" name="busqueda" value={busquedaInicial} />}
          <Button type="submit" name="vista" value="pendientes" variant={vista === "pendientes" ? "default" : "outline"} aria-pressed={idBuscado === null && vista === "pendientes"} disabled={ocupado}>Pendientes</Button>
          <Button type="submit" name="vista" value="tomados" variant={vista === "tomados" ? "default" : "outline"} aria-pressed={idBuscado === null && vista === "tomados"} disabled={ocupado}>Tomados</Button>
        </form>
        <form action="/defensoria" className="flex w-full items-end gap-2 sm:max-w-md">
          <input type="hidden" name="vista" value={vista} />
          <label className="grid min-w-0 flex-1 gap-1 text-sm font-medium">
            Buscar reportes
            <Input ref={buscar} type="search" name="busqueda" maxLength={200} placeholder="Título, dirección o Nº de reporte" value={busqueda} disabled={ocupado} onChange={(evento) => setBusqueda(evento.target.value)} />
          </label>
          <Button type="submit" disabled={ocupado}>Buscar</Button>
        </form>
      </div>
      <p role="status" className={mensaje ? "text-sm font-semibold text-accent-foreground" : "sr-only"}>{mensaje}</p>
      <p className="text-sm text-muted-foreground">
        {idBuscado !== null ? `Búsqueda del reporte #${idBuscado} en Pendientes y Tomados` : `${visibles.length} ${visibles.length === 1 ? "reporte" : "reportes"} en esta página · Más antiguos primero`}
      </p>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <section aria-label="Bandeja de reportes" className="min-w-0">
          {visibles.length ? (
            <ul ref={lista} className="grid gap-3">
              {visibles.map((reporte) => (
                <li key={reporte.id} className="relative">
                  <Card className={detalle?.id === reporte.id ? "border-primary" : undefined}>
                    <CardContent className="grid gap-3">
                      <div className="flex flex-wrap gap-2">
                        <ChipReporte etiqueta="Prioridad" tono={tonoPrioridad(reporte.prioridad)} icono={null} valor={reporte.prioridad} />
                        {idBuscado !== null && <ChipReporte etiqueta="Estado" tono={tonoEstado(reporte.estado)} icono={null} valor={reporte.estado} />}
                        {reporte.numeroReclamo && <ChipReporte etiqueta="Reclamo" tono="var(--semantic-admin)" icono={null} valor={`Nº ${reporte.numeroReclamo}`} />}
                      </div>
                      <h2 className="break-words font-semibold">{reporte.titulo}</h2>
                      <p className="text-sm text-muted-foreground">{reporte.categoria} · {reporte.ubicacion && `${reporte.ubicacion} · `}Reporte #{reporte.id}</p>
                      <Button type="button" variant="outline" className="min-h-11 w-fit" disabled={ocupado} data-reporte={reporte.id} aria-pressed={detalle?.id === reporte.id} onClick={(evento) => abrir(reporte, evento.currentTarget)}>
                        Ver el detalle<span className="sr-only">: {reporte.titulo}</span>
                      </Button>
                    </CardContent>
                  </Card>
                  {escritorio && detalle?.id === reporte.id && (
                    <section ref={panelDetalle} aria-label="Detalle seleccionado" className="hidden lg:absolute lg:top-[var(--desfase-detalle,0px)] lg:left-full lg:ml-4 lg:block lg:max-h-[var(--alto-detalle,100dvh)] lg:w-full lg:overflow-y-auto lg:overscroll-contain">
                      <Card>
                        <CardContent className="grid gap-3">
                          <p className="page-meta-label">Reporte #{detalle.id}</p>
                          <h2 ref={encabezadoDetalle} tabIndex={-1} className="break-words text-xl font-semibold tracking-tight">{detalle.titulo}</h2>
                          <DetalleReporte reporte={detalle} alTomar={alTomar} formulario={formulario} />
                        </CardContent>
                      </Card>
                    </section>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-[var(--radius)] border border-dashed bg-card p-5 text-sm text-muted-foreground">
              {idBuscado !== null ? `El reporte #${idBuscado} no aparece en Pendientes ni en Tomados.` : consulta ? "No hay coincidencias en esta página. Probá con otra búsqueda." : `No hay reportes ${vista} en esta página.`}
            </p>
          )}
          {(pagina > 1 || hayMas) && <nav aria-label="Páginas de reportes" className="mt-4 flex flex-wrap items-center gap-2">
            {pagina > 1 && <Button asChild variant="outline"><Link href={enlacePagina(pagina - 1)} scroll={false}>Anterior</Link></Button>}
            <span className="text-sm text-muted-foreground">Página {pagina}</span>
            {hayMas && <Button asChild variant="outline"><Link href={enlacePagina(pagina + 1)} scroll={false}>Siguiente</Link></Button>}
          </nav>}
        </section>
        {!detalle && (
          <section aria-label="Detalle seleccionado" className="hidden min-w-0 lg:block">
            <Card>
              <CardContent className="grid gap-3">
                <h2 className="text-xl font-semibold tracking-tight">Detalle del reporte</h2>
                <p className="text-sm text-muted-foreground">Elegí un reporte para revisarlo sin salir de la bandeja.</p>
              </CardContent>
            </Card>
          </section>
        )}
      </div>
      <Dialog open={!escritorio && Boolean(detalle)} onOpenChange={(abierto) => { if (!abierto && !ocupado) { formulario.limpiar(); setSeleccion(null) } }}>
        <DialogContent showClose={!ocupado} onCloseAutoFocus={(evento) => {
          evento.preventDefault()
          enfocar(disparador.current?.isConnected ? disparador.current : buscar.current)
        }}>
          {reporteDialogo && <>
            <DialogHeader>
              <DialogTitle className="break-words pr-7">{reporteDialogo.titulo}</DialogTitle>
              <DialogDescription>Reporte #{reporteDialogo.id}</DialogDescription>
            </DialogHeader>
            <DetalleReporte key={reporteDialogo.id} reporte={reporteDialogo} alTomar={alTomar} formulario={formulario} />
          </>}
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** Presenta la misma ficha y formulario en el panel y en el diálogo. */
function DetalleReporte({ reporte, alTomar, formulario }: {
  reporte: ReporteBandeja
  alTomar: (id: number, numero: string) => void
  formulario: ReturnType<typeof useTomaReporte>
}) {
  const fecha = new Date(reporte.createdAt).toLocaleDateString("es-AR", { dateStyle: "medium", timeZone: "America/Argentina/Buenos_Aires" })
  const datos = [
    ["Ubicación", reporte.ubicacion || "No disponible"],
    ...(reporte.barrio ? [["Barrio", reporte.barrio]] : []),
    ["Categoría", reporte.categoria],
    ["Prioridad", reporte.prioridad], ["Publicado", fecha], ["Autor", reporte.autor || "Anónimo"],
  ]
  return (
    <div className="grid gap-4">
      {reporte.imageUrl ? (
        <div className="relative aspect-video overflow-hidden rounded-[var(--radius)] border bg-muted">
          <Image src={reporte.imageUrl} alt={`Foto del reporte: ${reporte.titulo}`} fill className="object-contain" sizes="(min-width: 1024px) 38vw, 100vw" />
        </div>
      ) : <p className="rounded-[var(--radius)] bg-muted p-3 text-sm text-muted-foreground">Este reporte no tiene foto disponible.</p>}
      <p className="whitespace-pre-line break-words text-sm">{reporte.descripcion || "Sin descripción."}</p>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        {datos.map(([etiqueta, valor]) => <div key={etiqueta} className="min-w-0"><dt className="font-medium text-muted-foreground">{etiqueta}</dt><dd className="break-words">{valor}</dd></div>)}
        <div><dt className="font-medium text-muted-foreground">Estado</dt><dd><ChipReporte etiqueta="Estado" tono={tonoEstado(reporte.estado)} icono={null} valor={reporte.estado} /></dd></div>
      </dl>
      {reporte.barrio && <AtribucionBarrios />}
      {reporte.numeroReclamo && <p className="rounded-[var(--radius)] bg-accent p-3 text-sm text-accent-foreground"><strong>Reclamo:</strong> {reporte.numeroReclamo}</p>}
      {reporte.estado === "Pendiente" && <div className="border-t pt-4">
        <FormularioTomarReporte reporteId={reporte.id} onTomado={(numero) => alTomar(reporte.id, numero)} formulario={formulario} />
      </div>}
    </div>
  )
}
