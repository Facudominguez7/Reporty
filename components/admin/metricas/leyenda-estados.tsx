/** Un estado de la leyenda: su nombre y el color de su tramo en las barras. */
export type EstadoDeLeyenda = { nombre: string; color: string }

/**
 * Leyenda de colores de las barras de estado del panel de métricas.
 *
 * @param estados - Estados en el mismo orden en que aparecen en las barras.
 */
export function LeyendaEstados({ estados }: { estados: EstadoDeLeyenda[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1" aria-label="Colores de los estados">
      {estados.map((estado) => (
        <li key={estado.nombre} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: estado.color }} aria-hidden="true" />
          {estado.nombre}
        </li>
      ))}
    </ul>
  )
}
