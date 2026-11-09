/**
 * Contexto de la retención caliente para explicar el resultado del archivado.
 *
 * Es lógica pura (sin acceso a datos ni a credenciales), así que la usan tanto
 * el servidor como los componentes del panel.
 */

const MS_POR_DIA = 86_400_000

/** Fechas que explican por qué hay o no hay eventos para archivar. */
export type ContextoRetencion = {
  /** Instante antes del cual un evento es elegible para archivar (ISO 8601). */
  limite: string
  /** Cuándo vence el evento más viejo pendiente; `null` si ya venció o no hay eventos. */
  proximaElegible: string | null
  /** El evento más viejo ya superó la retención (hay algo elegible o en curso). */
  hayVencidos: boolean
}

/**
 * Calcula el límite de retención y cuándo será elegible el evento más viejo.
 *
 * @param entrada días de retención, fecha del evento más viejo y reloj.
 */
export function contextoRetencion(entrada: {
  diasRetencion: number
  eventoMasViejo: string | null
  ahora?: Date
}): ContextoRetencion {
  const ahora = entrada.ahora ?? new Date()
  const retencionMs = entrada.diasRetencion * MS_POR_DIA
  const limite = new Date(ahora.getTime() - retencionMs).toISOString()

  const masViejo = entrada.eventoMasViejo ? new Date(entrada.eventoMasViejo) : null
  if (!masViejo || Number.isNaN(masViejo.getTime())) {
    return { limite, proximaElegible: null, hayVencidos: false }
  }

  const vence = new Date(masViejo.getTime() + retencionMs)
  if (vence.getTime() <= ahora.getTime()) {
    return { limite, proximaElegible: null, hayVencidos: true }
  }

  return { limite, proximaElegible: vence.toISOString(), hayVencidos: false }
}
