/**
 * Formato de números, fechas y tamaños del archivo de auditoría.
 *
 * Se resuelve sin `Intl` para que el resultado sea determinístico en el servidor
 * y en las pruebas: fechas en UTC y separador decimal con coma.
 */

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"] as const

function dosDigitos(valor: number): string {
  return String(valor).padStart(2, "0")
}

/**
 * Formatea una fecha ISO como `dd/mm/aaaa` en UTC.
 *
 * @param iso fecha en formato ISO 8601.
 */
export function formatearFechaCorta(iso: string): string {
  const fecha = new Date(iso)
  if (Number.isNaN(fecha.getTime())) return "—"
  return `${dosDigitos(fecha.getUTCDate())}/${dosDigitos(fecha.getUTCMonth() + 1)}/${fecha.getUTCFullYear()}`
}

/**
 * Formatea una fecha ISO como `dd mmm aaaa`, por ejemplo `01 nov 2025`.
 *
 * @param iso fecha en formato ISO 8601.
 */
export function formatearFechaLegible(iso: string): string {
  const fecha = new Date(iso)
  if (Number.isNaN(fecha.getTime())) return "—"
  return `${dosDigitos(fecha.getUTCDate())} ${MESES[fecha.getUTCMonth()]} ${fecha.getUTCFullYear()}`
}

/**
 * Describe el período archivado de un lote.
 *
 * @param primeraFecha primera fecha de evento del lote.
 * @param ultimaFecha última fecha de evento del lote.
 */
export function periodoArchivado(primeraFecha: string, ultimaFecha: string): string {
  const desde = formatearFechaCorta(primeraFecha)
  const hasta = formatearFechaCorta(ultimaFecha)
  return desde === hasta ? desde : `${desde} – ${hasta}`
}

/**
 * Formatea una cantidad con separador de miles.
 *
 * @param cantidad número de eventos.
 */
export function formatearCantidad(cantidad: number): string {
  if (!Number.isFinite(cantidad)) return "0"
  return Math.trunc(cantidad).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")
}

/**
 * Formatea un tamaño en bytes con unidades binarias y una decimal.
 *
 * @param bytes cantidad de bytes.
 */
export function formatearTamano(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B"
  if (bytes < 1024) return `${Math.trunc(bytes)} B`

  const unidades = ["KB", "MB", "GB", "TB"]
  let valor = bytes / 1024
  let indice = 0
  while (valor >= 1024 && indice < unidades.length - 1) {
    valor /= 1024
    indice += 1
  }
  const redondeado = valor >= 100 ? valor.toFixed(0) : valor.toFixed(1)
  return `${redondeado.replace(".", ",")} ${unidades[indice]}`
}

/**
 * Muestra el hash completo acotado para la lista, sin perder el valor en el detalle.
 *
 * @param hash hash SHA-256 hexadecimal.
 * @param longitud cantidad de caracteres visibles.
 */
export function hashVisible(hash: string | null, longitud = 12): string {
  if (!hash) return "—"
  return hash.length <= longitud ? hash : `${hash.slice(0, longitud)}…`
}
