/**
 * Carga del mapa por zona en el navegador (#281): espera a que el mapa quede quieto, cancela
 * el pedido anterior y recuerda las zonas ya pedidas, así moverse de un lado a otro no repite
 * pedidos. No depende de React ni de Leaflet.
 */
import type { ContenidoZonaMapa, FiltrosMapa } from "@/database/queries/reportes/mapa-por-zona"
import { MAP_MAX_ZOOM, POSADAS_MIN_ZOOM } from "@/lib/map/initial-view"
import { ajustarZonaAlMapa, zonaATexto, type ZonaMapa } from "@/lib/map/zona"

/** Milisegundos sin movimientos antes de pedir la zona. */
export const ESPERA_ZONA_MS = 250

/** Zonas recordadas como máximo; al pasarse se olvida la más vieja. */
const MAXIMO_ZONAS_RECORDADAS = 40

const ORDEN_FILTROS = ["search", "categoria", "estado", "prioridad"] as const

/**
 * Arma la URL del endpoint para una zona. La zona se ajusta igual que en el servidor, así la
 * URL es la misma para vistas casi iguales y comparte caché.
 *
 * @param zona - Zona visible del mapa.
 * @param zoom - Zoom del mapa; se redondea y se lleva a los límites del mapa.
 * @param filtros - Filtros de la URL de la página; los vacíos no se envían.
 * @returns La URL relativa, o `null` si la zona no toca Posadas.
 */
export function urlZonaMapa(zona: ZonaMapa, zoom: number, filtros: FiltrosMapa): string | null {
  const zoomEntero = Math.min(MAP_MAX_ZOOM, Math.max(POSADAS_MIN_ZOOM, Math.round(zoom)))
  const ajustada = ajustarZonaAlMapa(zona, zoomEntero)
  if (!ajustada) return null

  const parametros = new URLSearchParams({ zona: zonaATexto(ajustada), zoom: String(zoomEntero) })
  for (const clave of ORDEN_FILTROS) {
    const valor = filtros[clave]
    if (valor) parametros.set(clave, valor)
  }
  return `/api/mapa/reportes?${parametros.toString()}`
}

/** Dependencias del cargador; `obtener` hace el pedido real y se reemplaza en las pruebas. */
type OpcionesCargadorZona = {
  obtener: (url: string, senal: AbortSignal) => Promise<ContenidoZonaMapa>
  alCargar: (contenido: ContenidoZonaMapa) => void
  alFallar?: () => void
  esperaMs?: number
}

/**
 * Crea un cargador de zonas.
 *
 * @returns `pedir` (programa la carga de una zona) y `cancelar` (descarta lo pendiente).
 */
export function crearCargadorZona({ obtener, alCargar, alFallar, esperaMs = ESPERA_ZONA_MS }: OpcionesCargadorZona) {
  const recordadas = new Map<string, ContenidoZonaMapa>()
  let espera: ReturnType<typeof setTimeout> | null = null
  let enCurso: AbortController | null = null

  /** Descarta la espera y el pedido en curso, si los hay. */
  function cancelar() {
    if (espera) clearTimeout(espera)
    espera = null
    enCurso?.abort()
    enCurso = null
  }

  /** Guarda una zona y olvida la más vieja si hay demasiadas. */
  function recordar(url: string, contenido: ContenidoZonaMapa) {
    recordadas.delete(url)
    recordadas.set(url, contenido)
    if (recordadas.size > MAXIMO_ZONAS_RECORDADAS) {
      const masVieja = recordadas.keys().next().value
      if (masVieja !== undefined) recordadas.delete(masVieja)
    }
  }

  /** Pide la zona ya, cancelando el pedido anterior. */
  async function cargar(url: string) {
    const guardada = recordadas.get(url)
    if (guardada) {
      alCargar(guardada)
      return
    }

    const controlador = new AbortController()
    enCurso = controlador
    try {
      const contenido = await obtener(url, controlador.signal)
      // Si mientras tanto se pidió otra zona, esta respuesta ya no sirve.
      if (controlador.signal.aborted || enCurso !== controlador) return
      enCurso = null
      recordar(url, contenido)
      alCargar(contenido)
    } catch {
      if (controlador.signal.aborted) return
      enCurso = null
      // El mapa sigue mostrando lo último que cargó.
      alFallar?.()
    }
  }

  /**
   * Programa la carga de una zona: si el mapa se mueve otra vez antes de `esperaMs`, solo
   * se pide la última.
   */
  function pedir(zona: ZonaMapa, zoom: number, filtros: FiltrosMapa) {
    cancelar()
    const url = urlZonaMapa(zona, zoom, filtros)
    if (!url) return
    espera = setTimeout(() => {
      espera = null
      void cargar(url)
    }, esperaMs)
  }

  return { pedir, cancelar }
}

/**
 * Pide una zona al endpoint del mapa.
 *
 * @param url - URL armada con `urlZonaMapa`.
 * @param senal - Señal para cancelar el pedido.
 * @returns El contenido de la zona; lanza si la respuesta no es correcta.
 */
export async function obtenerZonaMapa(url: string, senal: AbortSignal): Promise<ContenidoZonaMapa> {
  const respuesta = await fetch(url, { signal: senal })
  if (!respuesta.ok) throw new Error(`Mapa por zona: ${respuesta.status}`)
  return (await respuesta.json()) as ContenidoZonaMapa
}
