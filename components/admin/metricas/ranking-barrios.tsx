import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { BarrioConReportes, ReportesSinBarrio } from "@/lib/metricas/metricas-barrios"

import { LeyendaEstados } from "./leyenda-estados"

const ESTADOS = [
  { nombre: "Pendiente", color: "var(--semantic-warning)" },
  { nombre: "Reparado", color: "var(--primary)" },
  { nombre: "Otro estado", color: "var(--estado-otro)" },
]

/** Porcentaje de `parte` sobre `total` como ancho CSS. */
function ancho(parte: number, total: number) {
  return `${total > 0 ? (parte / total) * 100 : 0}%`
}

/**
 * Ranking de los barrios con más reportes: cada barra mide el total respecto del primero y se
 * reparte entre pendientes, reparados y el resto de los estados.
 *
 * @param barrios - Barrios con reportes, ya ordenados de más a menos.
 * @param sinBarrio - Reportes que no caen en ningún barrio cargado; se avisan aparte.
 * @param cantidadBarrios - Cuántos barrios hay cargados.
 * @param totalReportes - Reportes sin eliminar, para el porcentaje de los que no tienen barrio.
 */
export function RankingBarrios({
  barrios,
  sinBarrio,
  cantidadBarrios,
  totalReportes,
}: {
  barrios: BarrioConReportes[]
  sinBarrio: ReportesSinBarrio
  cantidadBarrios: number
  totalReportes: number
}) {
  const maximo = barrios[0]?.total ?? 0
  const porcentajeSinBarrio = totalReportes > 0 ? Math.round((sinBarrio.total / totalReportes) * 100) : 0

  return (
    <Card className="min-w-0 flex-[999_1_560px]">
      <CardHeader className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <CardTitle className="text-lg">Reportes por barrio</CardTitle>
          <CardDescription>Los {barrios.length} barrios con más reportes, con su estado.</CardDescription>
        </div>
        <LeyendaEstados estados={ESTADOS} />
      </CardHeader>
      <CardContent className="space-y-4">
        {barrios.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Todavía no hay reportes dentro de los barrios.</p>
        ) : (
          <table className="w-full table-fixed border-separate border-spacing-y-2 text-sm">
            <thead>
              <tr className="page-meta-label text-left">
                <th scope="col" className="w-[38%] font-semibold sm:w-[24%]">Barrio</th>
                <th scope="col" className="font-semibold">Estado</th>
                <th scope="col" className="w-12 text-right font-semibold">Total</th>
                <th scope="col" className="w-16 text-right font-semibold">30 días</th>
              </tr>
            </thead>
            <tbody>
              {barrios.map((barrio) => {
                const otros = barrio.total - barrio.pendientes - barrio.reparados
                return (
                  <tr key={barrio.id}>
                    <th scope="row" className="truncate pr-3 text-left font-medium">{barrio.nombre}</th>
                    <td className="pr-3">
                      <div
                        className="flex h-3.5 overflow-hidden rounded-full"
                        style={{ width: ancho(barrio.total, maximo), minWidth: "4px" }}
                        role="img"
                        aria-label={`${barrio.pendientes} pendientes, ${barrio.reparados} reparados y ${otros} en otro estado`}
                      >
                        <span style={{ width: ancho(barrio.pendientes, barrio.total), background: "var(--semantic-warning)" }} />
                        <span style={{ width: ancho(barrio.reparados, barrio.total), background: "var(--primary)" }} />
                        <span style={{ width: ancho(otros, barrio.total), background: "var(--estado-otro)" }} />
                      </div>
                    </td>
                    <td className="text-right font-semibold tabular-nums">{barrio.total}</td>
                    <td className="text-right tabular-nums text-muted-foreground">
                      {barrio.ultimos30Dias > 0 ? `+${barrio.ultimos30Dias}` : "0"}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
        {sinBarrio.total > 0 && (
          <p className="tone-warning-card rounded-[var(--radius)] border px-3 py-2.5 text-sm">
            {sinBarrio.total} reportes ({porcentajeSinBarrio} %) caen fuera de los {cantidadBarrios} barrios cargados,{" "}
            {sinBarrio.pendientes} de ellos pendientes. No aparecen en este ranking.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
