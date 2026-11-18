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

/**
 * Escapa un carácter en una sola pasada para las dos capas: primero como literal de regex
 * y después dentro del valor citado de PostgREST, donde cada barra invertida se duplica.
 */
function escaparCaracterBusqueda(caracter: string) {
  if (caracter === '"') return '\\"'
  if (caracter === "\\") return "\\\\\\\\"
  return `\\\\${caracter}`
}

/** Serializa una búsqueda literal de título o dirección como expresión OR de PostgREST. */
export function filtroBusquedaDefensoria(valor: string) {
  const texto = normalizarBusquedaDefensoria(valor)
  if (!texto) return ""
  const citado = `"${texto.replace(/[\\^$.*+?()[\]{}|"]/g, escaparCaracterBusqueda)}"`
  return `titulo.imatch.${citado},direccion.imatch.${citado}`
}
