/**
 * Fuente y reglas de los barrios de Posadas (#299).
 *
 * Los límites vienen de la capa `geonode:Barrios_SMU0` del WFS de la IDE de Posadas, con licencia
 * ODbL. Este módulo no importa nada de la app: lo usan el script de importación
 * (`scripts/territorio/importar-barrios.mjs`, corre con Node sin compilar) y las pantallas que
 * muestran el barrio con su atribución.
 */

/** Atribución que exige la licencia ODbL donde se muestre un barrio. */
export const ATRIBUCION_BARRIOS = "Secretaría de Movilidad Urbana, Dirección SIG-IDE, Municipalidad de Posadas (ODbL)"

/** Licencia de la capa de barrios. */
export const LICENCIA_BARRIOS = "ODbL"

/** Capa de barrios en el GeoServer de la IDE. */
export const CAPA_BARRIOS = "geonode:Barrios_SMU0"

/** WFS de la IDE. El host lleva `www` y `.gob.ar`: es el que cubre su certificado HTTPS. */
export const WFS_IDE_POSADAS = "https://www.ide.posadas.gob.ar/geoserver/ows"

/** Registro de la capa en el catálogo (CSW) de la IDE: de ahí salen su título y su fecha. */
export const CSW_BARRIOS =
  "https://www.ide.posadas.gob.ar/catalogue/csw?request=GetRecordById&service=CSW&version=2.0.2" +
  "&id=6ccbef1e-9d48-11f0-875a-0242ac120004&outputschema=http%3A%2F%2Fwww.opengis.net%2Fcat%2Fcsw%2F2.0.2&elementsetname=full"

/** Sistema de coordenadas en que la IDE entrega los barrios: POSGAR 2007 / Argentina 6. */
const CRS_BARRIOS = "urn:ogc:def:crs:EPSG::5348"

/** Pedido GetFeature de todos los barrios en GeoJSON. */
export const URL_BARRIOS_WFS =
  `${WFS_IDE_POSADAS}?service=WFS&version=2.0.0&request=GetFeature&typeNames=${CAPA_BARRIOS}&outputFormat=application/json`

/** Feature de barrio tal como la entrega el WFS. */
export type FeatureBarrio = {
  type: "Feature"
  properties: { id?: string; _Barrio?: string; [campo: string]: unknown }
  geometry: unknown
}

/** Respuesta GeoJSON del WFS. */
type RespuestaWfs = {
  crs?: { properties?: { name?: string } }
  numberMatched?: number
  numberReturned?: number
  features?: FeatureBarrio[]
}

/**
 * Lee del registro del catálogo el título de la capa y su fecha de modificación.
 *
 * @param xml - Respuesta de `CSW_BARRIOS`.
 * @returns `version` (el título) y `fecha` (ISO). Lanza si falta la fecha o no es válida.
 */
export function leerMetadatosFuente(xml: string): { version: string; fecha: string } {
  const leer = (etiqueta: string) => xml.match(new RegExp(`<${etiqueta}[^>]*>([^<]*)</${etiqueta}>`))?.[1]?.trim()
  const textoFecha = leer("dct:modified") ?? leer("dc:date")
  const fecha = textoFecha ? new Date(textoFecha) : null
  if (!fecha || Number.isNaN(fecha.getTime())) {
    throw new Error("El catálogo de la IDE no declara una fecha válida para la capa de barrios.")
  }
  return { version: leer("dc:title") || CAPA_BARRIOS, fecha: fecha.toISOString() }
}

/**
 * Revisa que la respuesta del WFS tenga todos los barrios y en el sistema de coordenadas esperado.
 *
 * @param respuesta - GeoJSON devuelto por `URL_BARRIOS_WFS`.
 * @returns Los barrios. Lanza si no llegó ninguno, si el servidor cortó la respuesta o si las
 *   coordenadas no vienen en EPSG:5348 (la base las transforma desde ese sistema).
 */
export function validarBarriosWfs(respuesta: RespuestaWfs): FeatureBarrio[] {
  const barrios = respuesta.features ?? []
  if (barrios.length === 0) throw new Error("El WFS no devolvió ningún barrio.")
  const crs = respuesta.crs?.properties?.name
  if (crs !== CRS_BARRIOS) throw new Error(`Los barrios llegaron en ${crs ?? "un sistema desconocido"}, no en EPSG:5348.`)
  if (typeof respuesta.numberMatched === "number" && respuesta.numberMatched !== barrios.length) {
    throw new Error(`El WFS devolvió ${barrios.length} de ${respuesta.numberMatched} barrios: la respuesta vino cortada.`)
  }
  return barrios
}
