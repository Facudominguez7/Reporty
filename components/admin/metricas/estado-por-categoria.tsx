import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { EstadoPorCategoria } from "@/lib/metricas/metricas-barrios"

import { LeyendaEstados } from "./leyenda-estados"

/** Estados en el orden de las barras: primero lo resuelto, al final lo descartado. */
const ESTADOS = [
  { nombre: "Reparado", color: "var(--primary)", campo: "reparados" },
  { nombre: "Defensoría", color: "var(--semantic-admin)", campo: "defensoria" },
  { nombre: "Pendiente", color: "var(--semantic-warning)", campo: "pendientes" },
  { nombre: "Rechazado", color: "var(--estado-rechazado)", campo: "rechazados" },
] as const

/**
 * Barras al 100 % de cada categoría repartidas por estado, ordenadas por la proporción que sigue
 * pendiente: el volumen por categoría es parecido; lo que cambia es cuánto se resuelve.
 *
 * @param categorias - Categorías ya ordenadas por la base.
 */
export function EstadoPorCategoriaCard({ categorias }: { categorias: EstadoPorCategoria[] }) {
  return (
    <Card>
      <CardHeader className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <CardTitle className="text-lg">Qué pasa con cada categoría</CardTitle>
          <CardDescription>Ordenadas por la proporción que sigue pendiente.</CardDescription>
        </div>
        <LeyendaEstados estados={[...ESTADOS]} />
      </CardHeader>
      <CardContent>
        {categorias.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No hay reportes para mostrar.</p>
        ) : (
          <ul className="grid grid-cols-[minmax(6rem,8rem)_minmax(0,1fr)] items-center gap-x-4 gap-y-3 sm:grid-cols-[minmax(6rem,8rem)_minmax(0,1fr)_minmax(9rem,12rem)]">
            {categorias.map((categoria) => (
              <li key={categoria.categoria} className="contents">
                <span className="text-sm font-medium">{categoria.categoria}</span>
                <div
                  className="flex h-3.5 overflow-hidden rounded-full bg-muted"
                  role="img"
                  aria-label={ESTADOS.map((estado) => `${categoria[estado.campo]} ${estado.nombre.toLowerCase()}`).join(", ") + ` de ${categoria.total}`}
                >
                  {ESTADOS.map((estado) => (
                    <span
                      key={estado.campo}
                      style={{ width: `${(categoria[estado.campo] / categoria.total) * 100}%`, background: estado.color }}
                    />
                  ))}
                </div>
                <span className="col-start-2 text-xs text-muted-foreground tabular-nums sm:col-start-auto sm:text-sm">
                  <strong className="font-semibold text-foreground">{categoria.pendientes}</strong> de {categoria.total} pendientes
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
