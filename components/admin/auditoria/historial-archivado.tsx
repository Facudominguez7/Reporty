import Link from "next/link"

import {
  diagnosticarConexionR2Action,
  ejecutarArchivadoManualAction,
  simularArchivadoAction,
} from "@/app/admin/auditoria/acciones"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LIMITE_CORRIDA_MANUAL } from "@/lib/auditoria-archivo/configuracion"
import { contextoRetencion } from "@/lib/auditoria-archivo/retencion"
import {
  estimarEspacioLiberable,
  formatearCantidad,
  formatearFechaCorta,
  formatearTamano,
  hashVisible,
  periodoArchivado,
} from "@/lib/auditoria/formato"

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
  /** Resultado del diagnóstico de R2: `ok`, `error` o ausente. */
  r2?: string
  /** Detalle operativo del diagnóstico; nunca incluye credenciales. */
  r2Detalle?: string
  /** Resultado de la última corrida real manual: `ok`, `error` o ausente. */
  archivado?: string
  archivadoEventos?: string
  archivadoPurgado?: string
  /** Muestra el bloque de pruebas (diagnóstico y corrida manual); `false` en producción. */
  mostrarPruebas?: boolean
  /** Días de retención caliente (`AUDIT_HOT_DAYS`). */
  diasRetencion?: number
  /** Fecha del evento más viejo que sigue en PostgreSQL; `null` si no hay eventos. */
  eventoMasViejo?: string | null
  /** Reloj inyectable para que las fechas del mensaje sean deterministas en pruebas. */
  ahora?: Date
  hayError?: boolean
}

/**
 * Explica el resultado de la simulación con la regla de retención, para que un
 * cero se entienda sin tener que preguntar.
 */
function mensajeSimulacion(
  simulacion: string,
  contexto: ReturnType<typeof contextoRetencion>,
  diasRetencion: number,
  hayEventos: boolean,
): string {
  if (simulacion === "error") return "No pudimos simular el archivado: revisá la configuración de Cloudflare R2."

  const limite = formatearFechaCorta(contexto.limite)
  const cantidad = Number(simulacion) || 0
  if (cantidad > 0) {
    return `Simulación: se archivarían ${formatearCantidad(cantidad)} eventos anteriores al ${limite}. No se modificó ni se eliminó nada.`
  }
  if (!hayEventos) {
    return "Simulación: todavía no hay eventos de auditoría registrados, así que no se archivaría nada. No se modificó ni se eliminó nada."
  }
  const proxima = contexto.proximaElegible
    ? ` El primero será elegible el ${formatearFechaCorta(contexto.proximaElegible)}.`
    : " Los eventos vencidos ya están en lotes en curso."
  return `Simulación: no hay eventos anteriores al ${limite} (retención de ${diasRetencion} días), así que no se archivaría nada.${proxima} No se modificó ni se eliminó nada.`
}

const ETIQUETAS_ESTADO: Record<string, { etiqueta: string; variante: "reparado" | "pendiente" | "destructive" | "outline" | "secondary" }> = {
  verificado: { etiqueta: "Verificado", variante: "reparado" },
  subido: { etiqueta: "Subido", variante: "pendiente" },
  origen_eliminado: { etiqueta: "Purgado", variante: "outline" },
  reclamado: { etiqueta: "Reclamado", variante: "secondary" },
  fallido: { etiqueta: "Fallido", variante: "destructive" },
}

/**
 * Estados con archivo remoto confirmado.
 *
 * `subido` todavía no tiene la integridad verificada y `fallido` no tiene
 * archivo: en ambos casos el panel muestra las acciones deshabilitadas con la
 * explicación, en lugar de ofrecer una descarga que fallaría.
 */
const ESTADOS_CON_ARCHIVO = new Set(["verificado", "origen_eliminado"])

const AYUDA_CON_ARCHIVO = "Disponible después de verificar la integridad del archivo."
const AYUDA_FALLIDO = "El archivado falló; el archivo no está disponible."

/**
 * Sección administrativa con el historial de auditoría archivado en R2.
 *
 * No expone URLs del bucket: la descarga y la recuperación pasan por rutas del
 * servidor que vuelven a validar la sesión y el rol Admin.
 */
export function HistorialArchivado({
  archivos,
  metricas,
  filtros,
  simulacion,
  r2,
  r2Detalle,
  archivado,
  archivadoEventos,
  archivadoPurgado,
  mostrarPruebas = false,
  diasRetencion = 180,
  eventoMasViejo = null,
  ahora,
  hayError = false,
}: Props) {
  const contexto = contextoRetencion({ diasRetencion, eventoMasViejo, ahora })
  const eventosArchivados = metricas?.eventosArchivados ?? 0
  const bytesEnR2 = metricas?.bytesEnR2 ?? 0
  const espacioLiberable = estimarEspacioLiberable(metricas)

  return (
    <section className="space-y-6" aria-labelledby="historial-archivado">
      <header>
        <h2 id="historial-archivado" className="scroll-mt-6 text-2xl font-semibold leading-8 tracking-tight">Historial archivado</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Consultá los períodos archivados y recuperá eventos sin restaurarlos en la tabla principal.
        </p>
      </header>

      {simulacion && (
        <p role="status" className="rounded-xl border border-border bg-card p-4 text-sm">
          {mensajeSimulacion(simulacion, contexto, diasRetencion, Boolean(eventoMasViejo))}
        </p>
      )}

      {r2 && (
        <p
          role="status"
          className={r2 === "ok" ? "rounded-xl border border-border bg-card p-4 text-sm" : "rounded-xl border border-destructive/40 bg-card p-4 text-sm text-destructive"}
        >
          {r2 === "ok" ? "Conexión con R2 verificada: lectura, escritura e integridad del objeto de prueba." : "No pudimos verificar la conexión con R2."}
          {r2Detalle ? ` ${r2Detalle}` : ""}
        </p>
      )}

      {archivado && (
        <p role="status" className={archivado === "ok" ? "rounded-xl border border-border bg-card p-4 text-sm" : "rounded-xl border border-destructive/40 bg-card p-4 text-sm text-destructive"}>
          {archivado === "ok"
            ? `Corrida real: ${formatearCantidad(Number(archivadoEventos) || 0)} eventos archivados y ${formatearCantidad(Number(archivadoPurgado) || 0)} eliminados de PostgreSQL.`
            : "La corrida real no pudo completarse: los eventos quedaron en PostgreSQL."}
        </p>
      )}

      {mostrarPruebas && (
        <details className="rounded-xl border border-border bg-card p-4">
          <summary className="cursor-pointer text-sm font-medium">Probar antes de producción</summary>
          <div className="mt-3 grid gap-3">
            <p className="text-xs text-muted-foreground">
              Estas acciones escriben en el bucket configurado. En producción la corrida real la dispara el cron; acá
              sirven para validar el ciclo completo en local.
            </p>
            <div className="flex flex-wrap gap-2">
              <form action={diagnosticarConexionR2Action}>
                <Button type="submit" variant="outline" size="sm">Probar conexión con R2</Button>
              </form>
              <form action={ejecutarArchivadoManualAction}>
                <Button type="submit" variant="neutral" size="sm">
                  Ejecutar corrida real (máx. {LIMITE_CORRIDA_MANUAL})
                </Button>
              </form>
            </div>
          </div>
        </details>
      )}

      <div className="grid gap-4 sm:grid-cols-3" aria-label="Métricas del historial archivado">
        <Card><CardContent className="grid gap-2">
          <h3 className="text-xs font-semibold uppercase leading-5 tracking-[0.14em] text-muted-foreground">Eventos archivados</h3>
          <p className="text-3xl font-semibold leading-9 tracking-tight tabular-nums">{formatearCantidad(eventosArchivados)}</p>
        </CardContent></Card>
        <Card><CardContent className="grid gap-2">
          <h3 className="text-xs font-semibold uppercase leading-5 tracking-[0.14em] text-muted-foreground">Tamaño en R2</h3>
          <p className="text-3xl font-semibold leading-9 tracking-tight tabular-nums">{formatearTamano(bytesEnR2)}</p>
        </CardContent></Card>
        <Card><CardContent className="grid gap-2">
          <h3 className="text-xs font-semibold uppercase leading-5 tracking-[0.14em] text-muted-foreground">Espacio liberable en PostgreSQL</h3>
          <p className="text-3xl font-semibold leading-9 tracking-tight tabular-nums">{formatearTamano(espacioLiberable)}</p>
          <p className="text-xs text-muted-foreground">Estimación; no implica que ya se haya liberado.</p>
        </CardContent></Card>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">Próximo lote</h3>
          <p id="ayuda-dry-run" className="text-xs text-muted-foreground">
            Simula el próximo lote: eventos de más de {diasRetencion} días (anteriores al {formatearFechaCorta(contexto.limite)}).
            El dry-run no modifica ni elimina datos.
          </p>
        </div>
        <form action={simularArchivadoAction}>
          <Button type="submit" variant="outline" aria-describedby="ayuda-dry-run">
            Ejecutar archivado (dry-run)
          </Button>
        </form>
      </div>

      {hayError ? (
        <p role="alert" className="text-sm text-destructive">No pudimos cargar el historial archivado.</p>
      ) : (
        <div id="lotes-archivados" className="scroll-mt-6 space-y-3">
          <div className="flex items-baseline justify-between gap-4">
            <h3 className="text-base font-semibold">Lotes archivados</h3>
            <p className="text-xs text-muted-foreground">
              {archivos.length === 1 ? "1 lote" : `${formatearCantidad(archivos.length)} lotes`}
            </p>
          </div>

          <form
            method="get"
            action="/admin/auditoria#lotes-archivados"
            aria-label="Filtrar historial archivado"
            className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          >
            <div className="grid min-w-0 gap-1.5">
              <Label htmlFor="archivo-desde">Desde</Label>
              <Input id="archivo-desde" name="desde" type="date" defaultValue={filtros.desde} />
            </div>
            <div className="grid min-w-0 gap-1.5">
              <Label htmlFor="archivo-hasta">Hasta</Label>
              <Input id="archivo-hasta" name="hasta" type="date" defaultValue={filtros.hasta} />
            </div>
            <Button type="submit">Aplicar</Button>
            <p className="text-xs text-muted-foreground sm:col-span-3">El rango filtra solo la lista de lotes archivados.</p>
          </form>

          {archivos.length === 0 ? (
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-sm font-semibold">Todavía no hay lotes archivados</p>
              <p className="mt-2 text-xs text-muted-foreground">
                Los períodos archivados van a aparecer acá cuando haya lotes disponibles.
              </p>
            </div>
          ) : (
            <ol className="space-y-2" aria-label="Lotes archivados">
              {archivos.map((archivo) => {
                const estado = ETIQUETAS_ESTADO[archivo.estado] ?? ETIQUETAS_ESTADO.subido
                const periodo = periodoArchivado(archivo.primeraFecha, archivo.ultimaFecha)
                const conArchivo = ESTADOS_CON_ARCHIVO.has(archivo.estado) && Boolean(archivo.rutaObjeto)
                const ayudaId = `ayuda-lote-${archivo.id}`

                return (
                  <li key={archivo.id}>
                    <Card><CardContent className="grid gap-3">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <p className="text-base font-semibold leading-5 tabular-nums">{periodo}</p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {formatearCantidad(archivo.cantidadRegistros)} eventos ·{" "}
                            {formatearTamano(archivo.tamanoComprimido ?? 0)} comprimidos
                          </p>
                        </div>
                        <Badge variant={estado.variante} className="gap-1.5 px-3 py-1 text-[0.7rem] tracking-[0.04em]">
                          <span aria-hidden="true" className="size-[7px] rounded-full bg-current opacity-75" />
                          {estado.etiqueta}
                        </Badge>
                      </div>

                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-xs text-muted-foreground">
                          SHA-256 <code className="font-mono text-foreground">{hashVisible(archivo.hashSha256)}</code>
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {conArchivo ? (
                            <>
                              <Link
                                href={`/admin/auditoria/archivo/${archivo.id}`}
                                className={buttonVariants({ variant: "outline", size: "sm" })}
                                aria-label={`Ver eventos del lote del ${periodo}`}
                              >
                                Ver eventos
                              </Link>
                              <a
                                href={`/api/admin/auditoria/archivo/${archivo.id}/descarga`}
                                className={buttonVariants({ variant: "outline", size: "sm" })}
                                aria-label={`Descargar el lote del ${periodo} como .jsonl.gz`}
                              >
                                Descargar .jsonl.gz
                              </a>
                            </>
                          ) : (
                            <>
                              <Button type="button" variant="outline" size="sm" disabled aria-describedby={ayudaId}>
                                Ver eventos
                              </Button>
                              <Button type="button" variant="outline" size="sm" disabled aria-describedby={ayudaId}>
                                Descargar .jsonl.gz
                              </Button>
                            </>
                          )}
                        </div>
                      </div>

                      {!conArchivo && (
                        <p id={ayudaId} className="text-xs text-muted-foreground">
                          {archivo.estado === "fallido" ? AYUDA_FALLIDO : AYUDA_CON_ARCHIVO}
                        </p>
                      )}
                    </CardContent></Card>
                  </li>
                )
              })}
            </ol>
          )}
        </div>
      )}

      <p className="text-sm leading-6 text-muted-foreground">
        Los archivos son privados y se guardan en un bucket privado. Solo los administradores pueden descargarlos a
        través del servidor; toda consulta y descarga se autoriza en el servidor. Ningún archivo histórico se elimina
        automáticamente.
      </p>
    </section>
  )
}
