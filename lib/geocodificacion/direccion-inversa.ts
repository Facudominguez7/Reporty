/**
 * Geocodificación inversa: convierte las coordenadas de un reporte en una dirección
 * legible («Bolívar 1450, Posadas») usando Nominatim de OpenStreetMap.
 *
 * Se consulta una sola vez por reporte (al crearlo o al corregir su ubicación) y el
 * resultado se guarda en `reportes.direccion`, así la ficha nunca depende del servicio
 * externo y se respeta su política de uso (1 consulta por segundo, sin uso masivo).
 * Cualquier falla devuelve `null`: la ficha muestra las coordenadas como respaldo.
 *
 * No lleva `server-only` porque no maneja secretos y lo importa también el script
 * `scripts/geocodificacion/completar-direcciones.mjs`; igual sólo se llama desde el
 * servidor para no exponer el User-Agent ni cargar Nominatim desde cada navegador.
 */

/** Endpoint público de Nominatim. */
const URL_NOMINATIM = "https://nominatim.openstreetmap.org/reverse"

/** Nominatim exige un User-Agent que identifique a la aplicación. */
const AGENTE = "Reporty/1.0 (+https://reporty.com.ar)"

/** Tiempo máximo de espera: crear un reporte no se demora por la dirección. */
const TIEMPO_MAXIMO_MS = 3000

/** Campos de `address` de Nominatim que usa Reporty. */
export type DireccionNominatim = {
  road?: string
  house_number?: string
  city?: string
  town?: string
  village?: string
}

/**
 * Arma la dirección visible a partir de la respuesta de Nominatim.
 *
 * @param direccion - Objeto `address` de la respuesta.
 * @returns «Calle altura, Localidad», o `null` si Nominatim no conoce la calle.
 */
export function formatearDireccion(direccion: DireccionNominatim): string | null {
  const calle = direccion.road?.trim()
  if (!calle) return null
  const conAltura = direccion.house_number ? `${calle} ${direccion.house_number.trim()}` : calle
  // En Misiones Nominatim nombra la ciudad por su municipio («Municipio de Posadas»).
  const localidad = (direccion.city ?? direccion.town ?? direccion.village)?.replace(/^Municipio de\s+/i, "").trim()
  return localidad ? `${conAltura}, ${localidad}` : conAltura
}

/**
 * Busca la dirección de unas coordenadas. Nunca lanza.
 *
 * @param lat - Latitud del reporte.
 * @param lon - Longitud del reporte.
 * @param fetchImpl - Implementación de `fetch` (inyectable para pruebas y scripts).
 * @returns La dirección legible, o `null` si el servicio falla, tarda o no la encuentra.
 */
export async function obtenerDireccion(
  lat: number,
  lon: number,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  const parametros = new URLSearchParams({
    format: "jsonv2",
    lat: String(lat),
    lon: String(lon),
    zoom: "18",
    addressdetails: "1",
    "accept-language": "es",
  })

  try {
    const respuesta = await fetchImpl(`${URL_NOMINATIM}?${parametros}`, {
      headers: { "User-Agent": AGENTE },
      signal: AbortSignal.timeout(TIEMPO_MAXIMO_MS),
    })
    if (!respuesta.ok) return null
    const cuerpo = (await respuesta.json()) as { address?: DireccionNominatim }
    return cuerpo.address ? formatearDireccion(cuerpo.address) : null
  } catch {
    return null
  }
}
