"use client"

/** Aviso del formulario de carga cuando ya hay un reporte abierto parecido cerca. */

import { useState } from "react"
import Link from "next/link"
import { CheckCircle2, Copy, ExternalLink, MessageCircle, RefreshCw, Undo2 } from "lucide-react"

import { Button } from "@/components/ui/button"
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
import { APORTES_COMUNITARIOS, type AporteKey } from "@/lib/reportes/aportes"
import type { AvisoDuplicado } from "@/lib/reportes/duplicados"
import { formatearFechaArgentina } from "@/lib/fechas/fecha-base"

export type DecisionDuplicado = "distinto" | "reemplazar"

type AvisoReporteDuplicadoProps = {
  aviso: AvisoDuplicado
  /** La sesión puede publicar una novedad en un reporte ajeno. */
  puedeAportar: boolean
  decision: DecisionDuplicado | null
  publicandoAporte: boolean
  onPublicarAporte: (aporte: AporteKey) => void
  onDecidir: (decision: DecisionDuplicado | null) => void
}

/**
 * Enlace al reporte existente en otra pestaña, para no perder lo cargado en el formulario.
 *
 * @param props.aviso - Aviso con el reporte existente.
 */
function TarjetaReporteExistente({ aviso }: { aviso: AvisoDuplicado }) {
  return (
    <Link
      href={`/reportes/${aviso.reporte.id}`}
      target="_blank"
      rel="noopener"
      className="flex items-start gap-3 rounded-xl border border-border bg-card p-3 text-left transition-colors hover:bg-muted"
    >
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm font-semibold leading-5">{aviso.reporte.titulo}</p>
        {aviso.reporte.descripcion && (
          <p className="line-clamp-2 text-xs text-muted-foreground">«{aviso.reporte.descripcion}»</p>
        )}
        <p className="text-xs text-muted-foreground">
          A {aviso.metros} m · {formatearFechaArgentina(aviso.reporte.createdAt)}
        </p>
      </div>
      <ExternalLink className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-label="Abre en otra pestaña" />
    </Link>
  )
}

/**
 * Muestra el reporte parecido y las salidas posibles según de quién es y a qué distancia está:
 * sumar una novedad, confirmar que es otro problema o reemplazar el reporte propio.
 *
 * @param props - Aviso, permisos de la sesión, decisión tomada y acciones del formulario.
 */
export function AvisoReporteDuplicado({
  aviso,
  puedeAportar,
  decision,
  publicandoAporte,
  onPublicarAporte,
  onDecidir,
}: AvisoReporteDuplicadoProps) {
  const [aporte, setAporte] = useState<AporteKey>("problema_sigue_igual")
  const [confirmandoDistinto, setConfirmandoDistinto] = useState(false)
  const [confirmandoReemplazo, setConfirmandoReemplazo] = useState(false)
  const esPropio = aviso.tipo !== "ajeno"

  if (decision) {
    return (
      <div className="tone-info-card flex flex-wrap items-center gap-3 rounded-xl border p-3" role="status">
        <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
        <p className="min-w-0 flex-1 text-sm">
          {decision === "distinto"
            ? "Lo vas a publicar como un problema distinto."
            : `Al publicar, se elimina tu reporte «${aviso.reporte.titulo}».`}
        </p>
        <Button type="button" variant="ghost" size="sm" onClick={() => onDecidir(null)}>
          <Undo2 className="size-4" aria-hidden="true" />
          Deshacer
        </Button>
      </div>
    )
  }

  return (
    <section
      aria-labelledby="aviso-duplicado-titulo"
      aria-live="polite"
      className="tone-warning-card card-shadow space-y-3 rounded-xl border p-4"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--semantic-warning)] text-foreground">
          <Copy className="size-4" aria-hidden="true" />
        </span>
        <div className="space-y-1">
          <h2 id="aviso-duplicado-titulo" className="text-base font-semibold leading-6">
            {aviso.tipo === "ajeno" && "Parece que ya está reportado"}
            {aviso.tipo === "propio_mismo_punto" && "Ya reportaste este punto"}
            {aviso.tipo === "propio_cerca" && `Ya reportaste este problema a ${aviso.metros} m`}
          </h2>
          <p className="text-sm text-muted-foreground">
            {aviso.tipo === "ajeno" &&
              `Hay un reporte de esta categoría a ${aviso.metros} m. Si es el mismo problema, sumale una novedad: así gana peso.`}
            {aviso.tipo === "propio_mismo_punto" &&
              `Tu reporte está a ${aviso.metros} m y sigue abierto. Repetirlo no le suma prioridad. Si cargaste algo mal, reemplazalo.`}
            {aviso.tipo === "propio_cerca" &&
              "¿Es otro punto de la cuadra, por ejemplo otra luminaria? Cargalo aparte con el pin justo en el lugar y una foto nueva."}
          </p>
        </div>
      </div>

      <TarjetaReporteExistente aviso={aviso} />

      {aviso.tipo === "ajeno" && (
        <div className="space-y-2">
          {puedeAportar ? (
            <>
              <label htmlFor="aporte-duplicado" className="block text-sm font-medium">
                ¿Qué novedad tenés?
              </label>
              <select
                id="aporte-duplicado"
                value={aporte}
                onChange={(event) => setAporte(event.target.value as AporteKey)}
                disabled={publicandoAporte}
                className="min-h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm leading-5 text-foreground"
              >
                {APORTES_COMUNITARIOS.map(({ key, label }) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
              <Button type="button" className="w-full" onClick={() => onPublicarAporte(aporte)} disabled={publicandoAporte}>
                <MessageCircle className="size-4" aria-hidden="true" />
                {publicandoAporte ? "Publicando…" : "Es el mismo: publicar novedad"}
              </Button>
            </>
          ) : (
            <Button asChild className="w-full">
              <Link href={`/reportes/${aviso.reporte.id}`}>Es el mismo: ver el reporte</Link>
            </Button>
          )}
          <Button type="button" variant="outline" className="w-full" onClick={() => setConfirmandoDistinto(true)}>
            Es otro problema
          </Button>
        </div>
      )}

      {aviso.tipo === "propio_mismo_punto" && (
        <div className="space-y-2">
          <Button asChild className="w-full">
            <Link href={`/reportes/${aviso.reporte.id}`}>
              <MessageCircle className="size-4" aria-hidden="true" />
              Agregar una novedad
            </Link>
          </Button>
          <Button type="button" variant="outline" className="w-full" onClick={() => setConfirmandoReemplazo(true)}>
            <RefreshCw className="size-4" aria-hidden="true" />
            Reemplazar mi reporte
          </Button>
        </div>
      )}

      {aviso.tipo === "propio_cerca" && (
        <div className="space-y-2">
          <Button type="button" className="w-full" onClick={() => onDecidir("distinto")}>
            Es otro punto: seguir
          </Button>
          <Button asChild variant="outline" className="w-full">
            <Link href={`/reportes/${aviso.reporte.id}`}>Es el mismo: ver mi reporte</Link>
          </Button>
          <Button type="button" variant="ghost" className="w-full" onClick={() => setConfirmandoReemplazo(true)}>
            Lo cargué mal: reemplazar mi reporte
          </Button>
        </div>
      )}

      <AlertDialog open={confirmandoDistinto} onOpenChange={setConfirmandoDistinto}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Es un problema distinto?</AlertDialogTitle>
            <AlertDialogDescription>
              Ubicá el pin justo donde está el problema y sacá la foto desde ahí: así se distingue del reporte de al lado y no se descarta como repetido.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Mejor sumo una novedad</AlertDialogCancel>
            <AlertDialogAction onClick={() => onDecidir("distinto")}>Sí, es otro problema</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {esPropio && (
        <AlertDialog open={confirmandoReemplazo} onOpenChange={setConfirmandoReemplazo}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Reemplazar tu reporte?</AlertDialogTitle>
              <AlertDialogDescription>
                Al publicar este, eliminamos «{aviso.reporte.titulo}». Se pierden las novedades que dejaron otros vecinos y los puntos que te dio. Esto no se puede deshacer. Lo que completaste en el formulario se mantiene.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => onDecidir("reemplazar")}
              >
                Reemplazar al publicar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </section>
  )
}
