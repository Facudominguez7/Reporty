/** Normaliza la búsqueda para limitar el tamaño del filtro enviado a PostgREST. */
export function normalizarBusquedaDefensoria(valor: string) {
  return valor.replace(/\0/g, "").trim().slice(0, 200)
}

/** Reconoce un número de reporte explícito, con o sin el prefijo que muestra la bandeja. */
export function obtenerIdBusquedaDefensoria(valor: string): number | null {
  const numero = valor.trim().match(/^(?:reporte\s+)?#?(\d+)$/i)?.[1]
  const id = Number(numero)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

/** Serializa una búsqueda literal de título o dirección como expresión OR de PostgREST. */
export function filtroBusquedaDefensoria(valor: string) {
  const texto = normalizarBusquedaDefensoria(valor)
  if (!texto) return ""
  const regex = texto.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&")
  const citado = `"${regex.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`
  return `titulo.imatch.${citado},direccion.imatch.${citado}`
}
