import Link from "next/link"
import { Download, FileClock, Lock } from "lucide-react"

import { simularArchivadoAction } from "@/app/admin/auditoria/acciones"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { formatearCantidad, formatearTamano, hashVisible, periodoArchivado } from "@/lib/auditoria/formato"

/** Lote archivado tal como lo muestra el panel, desacoplado del módulo de datos. */
export type ArchivoListado = {
  id: string
  estado: string
  cantidadRegistros: number
  primeraFecha: string
  ultimaFecha: string
  tamanoComprimido: number | null
  hashSha256: string | null
  rutaObjeto: string | null
}

/** Métricas que acompañan a la sección. */
export type MetricasHistorial = {
  eventosArchivados: number
  bytesEnR2: number
  elegibles: number
  espacioTablaBytes: number
  lotes: number
  lotesFallidos: number
  lotesPendientesPurga: number
}

type Props = {
  archivos: ArchivoListado[]
  metricas: MetricasHistorial | null
  filtros: { desde?: string; hasta?: string }
  /** Resultado de la última simulación: cantidad de eventos o `error`. */
  simulacion?: string
  hayError?: boolean
}

const ETIQUETAS_ESTADO: Record<string, { etiqueta: string; variante: "reparado" | "pendiente" | "destructive" | "outline" | "secondary" }> = {
  verificado: { etiqueta: "Verificado", variante: "reparado" },
  subido: { etiqueta: "Subido", variante: "pendiente" },
  origen_eliminado: { etiqueta: "Purgado", variante: "outline" },
  reclamado: { etiqueta: "Reclamado", variante: "secondary" },
  fallido: { etiqueta: "Fallido", variante: "destructive" },
}

/**
 * Sección administrativa con el historial de auditoría archivado en R2.
 *
 * No expone URLs del bucket: la descarga y la recuperación pasan por rutas del
 * servidor que vuelven a validar la sesión y el rol Admin.
 */
export function HistorialArchivado({ archivos, metricas, filtros, simulacion, hayError = false }: Props) {
  const disponible = archivos.filter((archivo) => archivo.estado !== "fallido" && archivo.rutaObjeto)

  return (
    <section className="space-y-4" aria-labelledby="historial-archivado">
      <header>
        <h2 id="historial-archivado" className="text-xl font-semibold tracking-tight">Historial archivado</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Lotes de auditoría con más de 180 días, guardados como JSON Lines comprimido en un bucket privado.
        </p>
      </header>

      {simulacion && (
        <p role="status" className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
          {simulacion === "error"
            ? "No pudimos simular el archivado: revisá la configuración de Cloudflare R2."
            : `Simulación: se archivarían ${formatearCantidad(Number(simulacion) || 0)} eventos. No se modificó ni se eliminó nada.`}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="p-4">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Eventos archivados</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{formatearCantidad(metricas?.eventosArchivados ?? 0)}</p>
          <p className="mt-1 text-xs text-muted-foreground">{formatearCantidad(metricas?.lotes ?? 0)} lotes en R2</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Tamaño en R2</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{formatearTamano(metricas?.bytesEnR2 ?? 0)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Comprimido con GZIP</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Espacio liberable en PostgreSQL</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{formatearCantidad(metricas?.elegibles ?? 0)}</p>
          <p className="mt-1 text-xs text-muted-foreground">eventos fuera de la ventana caliente</p>
        </CardContent></Card>
      </div>

      <div className="grid gap-3 rounded-xl border border-border bg-card p-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
        <form method="get" action="/admin/auditoria" className="contents">
          <label className="grid gap-1 text-sm">Desde
            <input type="date" name="desde" defaultValue={filtros.desde} className="min-h-10 rounded-md border border-input bg-background px-3" />
          </label>
          <label className="grid gap-1 text-sm">Hasta
            <input type="date" name="hasta" defaultValue={filtros.hasta} className="min-h-10 rounded-md border border-input bg-background px-3" />
          </label>
          <Button type="submit" variant="outline">Aplicar</Button>
        </form>
        <form action={simularArchivadoAction} className="md:col-span-3">
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" variant="neutral">
              <FileClock aria-hidden="true" />
              Ejecutar archivado (dry-run)
            </Button>
            <span className="text-xs text-muted-foreground">
              La simulación no modifica ni elimina datos.
            </span>
          </div>
        </form>
      </div>

      {hayError ? (
        <p role="alert" className="text-sm text-destructive">No pudimos cargar el historial archivado.</p>
      ) : disponible.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía no hay lotes archivados.</p>
      ) : (
        <ol className="space-y-2" aria-label="Lotes de auditoría archivados">
          {disponible.map((archivo) => {
            const estado = ETIQUETAS_ESTADO[archivo.estado] ?? ETIQUETAS_ESTADO.subido
            return (
              <li key={archivo.id}>
                <Card><CardContent className="flex flex-col gap-3 p-3 sm:p-4 md:flex-row md:items-center md:justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">{periodoArchivado(archivo.primeraFecha, archivo.ultimaFecha)}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatearCantidad(archivo.cantidadRegistros)} eventos · {formatearTamano(archivo.tamanoComprimido ?? 0)} comprimidos
                    </p>
                    <p className="font-mono text-xs text-muted-foreground" title={archivo.hashSha256 ?? undefined}>
                      SHA-256 {hashVisible(archivo.hashSha256)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={estado.variante} className="gap-1.5 px-3 py-1 text-[0.7rem] tracking-[0.04em]">
                      <span aria-hidden="true" className="size-[7px] rounded-full bg-current opacity-75" />
                      {estado.etiqueta}
                    </Badge>
                    <Link href={`/admin/auditoria/archivo/${archivo.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                      Ver eventos
                    </Link>
                    <a href={`/api/admin/auditoria/archivo/${archivo.id}/descarga`} className={buttonVariants({ variant: "neutral", size: "sm" })}>
                      <Download aria-hidden="true" />
                      Descargar .jsonl.gz
                    </a>
                  </div>
                </CardContent></Card>
              </li>
            )
          })}
        </ol>
      )}

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <Lock aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
        Los archivos son privados y viven en un bucket privado: solo un Admin los descarga a través del servidor, y
        ninguna consulta ni descarga se autoriza en el navegador. Ningún archivo histórico se elimina automáticamente.
      </p>
    </section>
  )
}
