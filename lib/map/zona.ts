/**
 * Zona visible del mapa: el rectángulo que el mapa pide al servidor (#281).
 *
 * Reglas compartidas por el endpoint `GET /api/mapa/reportes`, la carga inicial de `/mapa`
 * y el mapa en el navegador, así todos piden y agrupan la misma zona de la misma forma.
 */
import { REPORT_STATE_IDS } from "@/lib/authz/catalog"
import { POSADAS_BOUNDS } from "@/lib/map/initial-view"

/** Rectángulo en grados (EPSG:4326). */
export type ZonaMapa = {
  oeste: number
  sur: number
  este: number
  norte: number
}

/** Estados que muestra el mapa: pendientes, tomados por la Defensoría y reparados. */
export const ESTADOS_MAPA = [
  REPORT_STATE_IDS.PENDIENTE,
  REPORT_STATE_IDS.TOMADO_DEFENSORIA,
  REPORT_STATE_IDS.REPARADO,
] as const

/** Hasta esta cantidad de reportes en la zona se dibujan puntos; con más, grupos. */
export const MAXIMO_PUNTOS_ZONA = 300

/**
 * En el zoom máximo nunca se agrupa (no habría forma de acercarse más para ver cada reporte):
 * se devuelven puntos, hasta esta cantidad.
 */
export const MAXIMO_PUNTOS_ZOOM_MAXIMO = 1000

/**
 * Tolerancia, en fracción de tesela, para que un borde ya alineado (y redondeado) no salte a
 * la tesela vecina al ajustarlo de nuevo.
 */
const TOLERANCIA_TESELA = 1e-3

/** Decimales con los que se redondean los bordes, para que la URL (y su caché) sea estable. */
const DECIMALES_ZONA = 6

/** Ancho en grados de una tesela de 256 px en ese zoom. */
function anchoTesela(zoom: number) {
  return 360 / 2 ** zoom
}

/** Redondea un número a los decimales de la zona. */
function redondear(valor: number) {
  return Number(valor.toFixed(DECIMALES_ZONA))
}

/**
 * Lee una zona escrita como `oeste,sur,este,norte`.
 *
 * @param texto - Valor del parámetro `zona`.
 * @returns La zona, o `null` si no tiene cuatro números válidos en orden.
 */
export function leerZona(texto: string): ZonaMapa | null {
  const partes = texto.split(",")
  if (partes.length !== 4) return null
  const numeros = partes.map((parte) => (parte.trim() === "" ? Number.NaN : Number(parte)))
  if (numeros.some((numero) => !Number.isFinite(numero))) return null
  const [oeste, sur, este, norte] = numeros
  if (oeste < -180 || este > 180 || sur < -90 || norte > 90) return null
  if (oeste >= este || sur >= norte) return null
  return { oeste, sur, este, norte }
}

/**
 * Escribe una zona como `oeste,sur,este,norte`, el formato que lee `leerZona`.
 *
 * @param zona - Rectángulo a escribir.
 * @returns Texto para el parámetro `zona`.
 */
export function zonaATexto(zona: ZonaMapa) {
  return [zona.oeste, zona.sur, zona.este, zona.norte].join(",")
}

/**
 * Lleva la zona a lo que el mapa puede mostrar: agranda los bordes hasta la grilla de teselas
 * del zoom (dos vistas casi iguales piden exactamente la misma zona y comparten caché) y la
 * recorta a los límites de Posadas.
 *
 * @param zona - Zona pedida.
 * @param zoom - Zoom del mapa.
 * @returns La zona ajustada, o `null` si no toca Posadas.
 */
export function ajustarZonaAlMapa(zona: ZonaMapa, zoom: number): ZonaMapa | null {
  const paso = anchoTesela(zoom)
  const [limiteSur, limiteOeste, limiteNorte, limiteEste] = POSADAS_BOUNDS
  // Es idempotente: el navegador ajusta la zona y el servidor la vuelve a ajustar. Sin la
  // tolerancia, el redondeo a 6 decimales dejaba el borde apenas fuera de la grilla y cada
  // ajuste corría la zona una tesela más.
  const haciaAbajo = (valor: number) => Math.floor(valor / paso + TOLERANCIA_TESELA) * paso
  const haciaArriba = (valor: number) => Math.ceil(valor / paso - TOLERANCIA_TESELA) * paso
  const ajustada = {
    oeste: redondear(Math.max(limiteOeste, haciaAbajo(zona.oeste))),
    sur: redondear(Math.max(limiteSur, haciaAbajo(zona.sur))),
    este: redondear(Math.min(limiteEste, haciaArriba(zona.este))),
    norte: redondear(Math.min(limiteNorte, haciaArriba(zona.norte))),
  }
  if (ajustada.oeste >= ajustada.este || ajustada.sur >= ajustada.norte) return null
  return ajustada
}

/**
 * Tamaño de celda de los grupos: media tesela, así cada grupo ocupa a lo sumo medio
 * cuadrado de mapa y al acercarse las celdas se achican.
 *
 * @param zoom - Zoom del mapa.
 * @returns Lado de la celda en grados.
 */
export function tamanoCeldaGrupos(zoom: number) {
  return anchoTesela(zoom) / 2
}

/** Normaliza un nombre de estado igual que los filtros del listado. */
function normalizarEstado(valor: string) {
  return valor
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "")
}

/**
 * Estados que puede devolver el mapa con el filtro `estado` de la URL. El filtro solo achica
 * la lista fija del mapa: Rechazado nunca entra, aunque se pida.
 *
 * @param estado - Valor del filtro (`Pendiente`, `Reparado`, `seguimiento`…), o nada.
 * @returns IDs de estado permitidos; vacío si el filtro excluye todo.
 */
export function resolverEstadosMapa(estado: string | undefined): number[] {
  const todos = [...ESTADOS_MAPA]
  if (!estado || estado === "all") return todos

  const pedido = normalizarEstado(estado)
  // «seguimiento» son los estados abiertos institucionales (hoy, tomado por la Defensoría).
  if (pedido === "seguimiento") {
    const cerradosOBase: number[] = [REPORT_STATE_IDS.PENDIENTE, REPORT_STATE_IDS.REPARADO, REPORT_STATE_IDS.RECHAZADO]
    return todos.filter((id) => !cerradosOBase.includes(id))
  }
  const porNombre: Record<string, number> = {
    pendiente: REPORT_STATE_IDS.PENDIENTE,
    reparado: REPORT_STATE_IDS.REPARADO,
    rechazado: REPORT_STATE_IDS.RECHAZADO,
  }
  const id = porNombre[pedido]
  if (id === undefined) return todos
  return todos.filter((permitido) => permitido === id)
}
