import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { ChevronLeft, Download } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { etiquetaAccion, fraseAccion } from "@/lib/auditoria/acciones"
import { formatearCantidad, formatearFechaLegible, formatearTamano, periodoArchivado } from "@/lib/auditoria/formato"
import { recuperarEventosArchivados } from "@/lib/auditoria-archivo/servicio-recuperacion"
import { createClient } from "@/utils/supabase/server"

export const metadata = { title: "Lote archivado · Administración", robots: { index: false, follow: false } }

/**
 * Detalle de un lote de auditoría archivado.
 *
 * Los eventos se leen del objeto en R2 y se muestran como histórico de solo
 * lectura: no se restauran a `public.audit_events`.
 */
export default async function LoteArchivadoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/auth?next=/admin/auditoria/archivo/${encodeURIComponent(id)}`)

  const { unauthorized, recuperado, error } = await recuperarEventosArchivados(supabase, user.id, id)
  if (unauthorized) redirect("/mapa")
  // Un identificador inexistente, inválido o ajeno se responde igual: 404 sin filtrar existencia.
  if (!recuperado && !error) notFound()

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/auditoria" className="inline-flex items-center gap-1 text-sm text-primary">
          <ChevronLeft className="size-4" aria-hidden="true" /> Volver a auditoría
        </Link>
      </div>

      <header className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight">Lote archivado</h1>
        <p className="text-sm text-muted-foreground">
          Histórico de solo lectura: estos eventos ya no están en PostgreSQL y no se restauran al panel principal.
        </p>
      </header>

      {error || !recuperado ? (
        <p role="alert" className="text-sm text-destructive">
          No pudimos leer el lote archivado. Revisá la integridad del objeto en R2 o volvé a intentarlo más tarde.
        </p>
      ) : (
        <>
          <Card><CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Período</p>
              <p className="mt-1 text-sm font-medium">{periodoArchivado(recuperado.archivo.primeraFecha, recuperado.archivo.ultimaFecha)}</p>
            </div>
            <div>
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Eventos</p>
              <p className="mt-1 text-sm font-medium tabular-nums">{formatearCantidad(recuperado.eventos.length)}</p>
            </div>
            <div>
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Tamaño comprimido</p>
              <p className="mt-1 text-sm font-medium tabular-nums">{formatearTamano(recuperado.archivo.tamanoComprimido ?? 0)}</p>
            </div>
            <div>
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Integridad</p>
              <div className="mt-1 flex items-center gap-2">
                <Badge variant="reparado">SHA-256 verificado</Badge>
              </div>
              <p className="mt-1 break-all font-mono text-[0.65rem] text-muted-foreground">{recuperado.archivo.hashSha256}</p>
            </div>
          </CardContent></Card>

          <div className="flex flex-wrap items-center gap-3">
            <a href={`/api/admin/auditoria/archivo/${recuperado.archivo.id}/descarga`} className={buttonVariants({ variant: "outline" })}>
              <Download aria-hidden="true" /> Descargar .jsonl.gz
            </a>
            <span className="text-xs text-muted-foreground">
              La descarga queda registrada en la auditoría administrativa.
            </span>
          </div>

          <ol className="space-y-2" aria-label="Eventos del lote archivado">
            {recuperado.eventos.map((evento) => (
              <li key={evento.id}>
                <Card><CardContent className="space-y-1 p-3 sm:p-4">
                  <p className="text-sm">
                    <span className="font-medium">{evento.actor_id ? `Usuario ${evento.actor_id.slice(0, 8)}` : "Usuario sin identificar"}</span>{" "}
                    {fraseAccion(evento.action)}
                    {evento.report_id ? ` en #${evento.report_id}${evento.report_title ? ` · ${evento.report_title}` : ""}` : ""}.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatearFechaLegible(evento.occurred_at)} · {etiquetaAccion(evento.action)} · evento #{evento.id}
                  </p>
                </CardContent></Card>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  )
}
