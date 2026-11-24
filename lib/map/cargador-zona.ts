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

/**
 * Milisegundos que una zona recordada se da por vigente, igual que la caché del endpoint.
 * Después se muestra lo guardado y se vuelve a pedir, para ver reportes nuevos o reparados.
 */
export const VIGENCIA_ZONA_MS = 30_000

/** Estado de la carga, para que el mapa avise mientras pide o si falló. */
export type EstadoCargaZona = "cargando" | "listo" | "error"

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
  alCambiarEstado?: (estado: EstadoCargaZona) => void
  esperaMs?: number
}

/**
 * Crea un cargador de zonas.
 *
 * @returns `pedir` (programa la carga de una zona), `cancelar` (descarta lo pendiente),
 *   `reintentar` (vuelve a pedir la última zona ya), `revalidar` (la vuelve a pedir si venció)
 *   y `olvidar` (borra las zonas recordadas).
 */
export function crearCargadorZona({ obtener, alCargar, alFallar, alCambiarEstado, esperaMs = ESPERA_ZONA_MS }: OpcionesCargadorZona) {
  const recordadas = new Map<string, { contenido: ContenidoZonaMapa; guardadaEn: number }>()
  let espera: ReturnType<typeof setTimeout> | null = null
  let enCurso: AbortController | null = null
  let ultimaUrl: string | null = null

  /** Descarta la espera y el pedido en curso, si los hay. */
  function cancelar() {
    if (espera) clearTimeout(espera)
    espera = null
    enCurso?.abort()
    enCurso = null
  }

  /** Indica si una zona recordada todavía no venció. */
  function vigente(guardada: { guardadaEn: number }) {
    return Date.now() - guardada.guardadaEn < VIGENCIA_ZONA_MS
  }

  /** Guarda una zona y olvida la más vieja si hay demasiadas. */
  function recordar(url: string, contenido: ContenidoZonaMapa) {
    recordadas.delete(url)
    recordadas.set(url, { contenido, guardadaEn: Date.now() })
    if (recordadas.size > MAXIMO_ZONAS_RECORDADAS) {
      const masVieja = recordadas.keys().next().value
      if (masVieja !== undefined) recordadas.delete(masVieja)
    }
  }

  /**
   * Pide la zona ya, cancelando el pedido anterior. Una zona recordada y vigente se muestra
   * sin pedir; una vencida se muestra igual mientras se vuelve a pedir.
   */
  async function cargar(url: string) {
    const guardada = recordadas.get(url)
    if (guardada) {
      alCargar(guardada.contenido)
      if (vigente(guardada)) {
        // Los datos ya están: no puede quedar visible un error o un «cargando» anterior.
        alCambiarEstado?.("listo")
        return
      }
    }

    const controlador = new AbortController()
    enCurso = controlador
    alCambiarEstado?.("cargando")
    try {
      const contenido = await obtener(url, controlador.signal)
      // Si mientras tanto se pidió otra zona, esta respuesta ya no sirve.
      if (controlador.signal.aborted || enCurso !== controlador) return
      enCurso = null
      recordar(url, contenido)
      alCargar(contenido)
      alCambiarEstado?.("listo")
    } catch {
      if (controlador.signal.aborted) return
      enCurso = null
      // El mapa sigue mostrando lo último que cargó y avisa que esta zona no llegó.
      alCambiarEstado?.("error")
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
    if (!url) {
      // Fuera de Posadas no hay nada que pedir: lo cancelado no puede quedar «cargando».
      ultimaUrl = null
      alCambiarEstado?.("listo")
      return
    }
    ultimaUrl = url
    espera = setTimeout(() => {
      espera = null
      void cargar(url)
    }, esperaMs)
  }

  /** Vuelve a pedir la última zona sin esperar ni usar lo recordado (tras un error). */
  function reintentar() {
    if (!ultimaUrl) return
    cancelar()
    recordadas.delete(ultimaUrl)
    void cargar(ultimaUrl)
  }

  /**
   * Vuelve a pedir la zona visible si lo recordado ya venció, por ejemplo cuando el usuario
   * vuelve a la app con el mapa quieto. Si hay una carga en curso o programada, no hace nada.
   */
  function revalidar() {
    if (!ultimaUrl || espera || enCurso) return
    const guardada = recordadas.get(ultimaUrl)
    if (guardada && vigente(guardada)) return
    void cargar(ultimaUrl)
  }

  /** Olvida las zonas recordadas, por ejemplo cuando el servidor manda datos nuevos. */
  function olvidar() {
    recordadas.clear()
  }

  return { pedir, cancelar, reintentar, revalidar, olvidar }
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

/**
 * Escucha cuándo el usuario vuelve a la app (la pestaña se vuelve visible o la ventana recupera
 * el foco), para revalidar la zona aunque el mapa no se haya movido. En el celular es lo
 * habitual: se deja la app en segundo plano y se vuelve más tarde.
 *
 * @param alVolver - Se llama cada vez que el usuario vuelve.
 * @param ventana - Dónde escuchar `focus`; por defecto, `window`.
 * @param documento - Dónde escuchar `visibilitychange`; por defecto, `document`.
 * @returns Función para dejar de escuchar.
 */
export function alVolverALaApp(
  alVolver: () => void,
  ventana: EventTarget = window,
  documento: EventTarget & { visibilityState: DocumentVisibilityState } = document,
) {
  const alCambiarVisibilidad = () => {
    if (documento.visibilityState === "visible") alVolver()
  }
  documento.addEventListener("visibilitychange", alCambiarVisibilidad)
  ventana.addEventListener("focus", alVolver)
  return () => {
    documento.removeEventListener("visibilitychange", alCambiarVisibilidad)
    ventana.removeEventListener("focus", alVolver)
  }
}
