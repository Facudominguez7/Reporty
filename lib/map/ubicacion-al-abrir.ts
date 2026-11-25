/**
 * Ubicación de la persona al abrir el mapa (#297), sin botón.
 *
 * Según el estado del permiso: si ya lo dio, se lee sin preguntar; si nunca respondió, se pide en
 * ese momento (y si cierra el diálogo sin responder, no se vuelve a pedir en esa sesión); si lo
 * negó, se avisa una sola vez cómo activarlo. Sin Permissions API se llama directo a la
 * geolocalización. Hay una sola lectura por visita, de 6 s como máximo, sin seguimiento continuo.
 *
 * La lectura exacta solo se usa en el teléfono para dibujar el punto; al servidor sale redondeada
 * (`pedirCercanos`).
 */
import type { ElementoCercano } from "@/lib/map/cercanos"
import {
  TIEMPO_UBICACION_CERCANOS_MS,
  dentroDePosadas,
  redondearCoordenada,
} from "@/lib/map/cercanos"
import { buscarUbicacionPrecisa, type UbicacionPrecisa } from "@/lib/geolocalizacion/ubicacion-precisa"

/** sessionStorage: la persona cerró el diálogo de permiso sin responder en esta sesión. */
export const CLAVE_UBICACION_SIN_RESPUESTA = "reporty_ubicacion_sin_respuesta"

/** localStorage: ya se mostró el aviso de ubicación negada (se muestra una sola vez). */
export const CLAVE_AVISO_UBICACION_DENEGADA = "reporty_aviso_ubicacion_denegada"

/** Código de `GeolocationPositionError` cuando no hay permiso (o se cerró el diálogo). */
const ERROR_SIN_PERMISO = 1

/** Lo que el flujo usa de `window.localStorage` y `window.sessionStorage`. */
type Almacen = Pick<Storage, "getItem" | "setItem">

/** Lo que el flujo usa de `navigator`; las dos APIs pueden faltar. */
type NavegadorUbicacion = {
  geolocation?: Geolocation
  permissions?: Permissions
}

/** Estado del permiso de ubicación, o `sin-api` si el navegador no lo informa. */
type EstadoPermiso = PermissionState | "sin-api"

/**
 * Consulta el estado del permiso de ubicación sin pedirlo.
 *
 * @param permisos - `navigator.permissions`, si existe.
 * @returns El estado, o `sin-api` si no hay Permissions API o la consulta falla.
 */
async function leerEstadoPermiso(permisos: Permissions | undefined): Promise<EstadoPermiso> {
  if (!permisos?.query) return "sin-api"
  try {
    const { state } = await permisos.query({ name: "geolocation" })
    return state
  } catch {
    return "sin-api"
  }
}

/**
 * Lee el almacenamiento sin fallar (Safari en modo privado o cookies bloqueadas lo impiden).
 *
 * @param almacen - Almacenamiento a leer.
 * @param clave - Clave a buscar.
 * @returns `true` si la clave está marcada.
 */
function estaMarcado(almacen: Almacen, clave: string): boolean {
  try {
    return almacen.getItem(clave) === "1"
  } catch {
    return false
  }
}

/**
 * Marca una clave en el almacenamiento sin fallar.
 *
 * @param almacen - Almacenamiento a escribir.
 * @param clave - Clave a marcar.
 */
function marcar(almacen: Almacen, clave: string) {
  try {
    almacen.setItem(clave, "1")
  } catch {
    // Sin almacenamiento, el aviso o el pedido pueden repetirse: no rompe el mapa.
  }
}

/**
 * Corre el flujo de ubicación al abrir el mapa.
 *
 * @param opciones.navegador - `navigator` (inyectable en pruebas).
 * @param opciones.almacenSesion - `sessionStorage`, para no volver a pedir el permiso en la sesión.
 * @param opciones.almacenLocal - `localStorage`, para avisar del permiso negado una sola vez.
 * @param opciones.alUbicar - Recibe la lectura, solo si cae dentro de Posadas.
 * @param opciones.alAvisarDenegado - Se llama la única vez que hay que avisar del permiso negado.
 */
export async function iniciarUbicacionAlAbrir({
  navegador,
  almacenSesion,
  almacenLocal,
  alUbicar,
  alAvisarDenegado,
}: {
  navegador: NavegadorUbicacion
  almacenSesion: Almacen
  almacenLocal: Almacen
  alUbicar: (ubicacion: UbicacionPrecisa) => void
  alAvisarDenegado: () => void
}): Promise<void> {
  const geolocalizacion = navegador.geolocation
  if (!geolocalizacion) return

  const permiso = await leerEstadoPermiso(navegador.permissions)

  if (permiso === "denied") {
    if (estaMarcado(almacenLocal, CLAVE_AVISO_UBICACION_DENEGADA)) return
    marcar(almacenLocal, CLAVE_AVISO_UBICACION_DENEGADA)
    alAvisarDenegado()
    return
  }

  // Si ya cerró el diálogo sin responder en esta sesión, no se insiste.
  if (permiso !== "granted" && estaMarcado(almacenSesion, CLAVE_UBICACION_SIN_RESPUESTA)) return

  let ubicacion: UbicacionPrecisa
  try {
    ubicacion = await buscarUbicacionPrecisa(geolocalizacion, { tiempoMaximoMs: TIEMPO_UBICACION_CERCANOS_MS })
  } catch (error) {
    const sinPermiso = (error as GeolocationPositionError | undefined)?.code === ERROR_SIN_PERMISO
    if (sinPermiso && permiso !== "granted") marcar(almacenSesion, CLAVE_UBICACION_SIN_RESPUESTA)
    return
  }

  // Fuera de Posadas el mapa no se mueve y no hay nada cerca que buscar.
  if (!dentroDePosadas(ubicacion.lat, ubicacion.lon)) return
  alUbicar(ubicacion)
}

/**
 * Indica si el mapa se centra solo en la persona al llegar su ubicación.
 *
 * @param estado.hayFocoReporte - Se llegó desde un reporte (`/mapa?reporte=…`).
 * @param estado.mapaMovidoPorPersona - La persona ya movió el mapa antes de la lectura.
 * @returns `true` si se puede mover el mapa.
 */
export function debeCentrarEnPersona({
  hayFocoReporte,
  mapaMovidoPorPersona,
}: {
  hayFocoReporte: boolean
  mapaMovidoPorPersona: boolean
}): boolean {
  return !hayFocoReporte && !mapaMovidoPorPersona
}

/**
 * Pide al servidor lo que hay cerca. La coordenada sale redondeada a 4 decimales y en el cuerpo.
 *
 * @param pedido.lat - Latitud de la persona.
 * @param pedido.lon - Longitud de la persona.
 * @param pedido.radio - Radio en metros.
 * @param signal - Para cancelar el pedido si cambia el radio.
 * @param hacerFetch - `fetch` (inyectable en pruebas).
 * @returns Los elementos cercanos, ordenados por distancia. Lanza si el servidor responde con error.
 */
export async function pedirCercanos(
  { lat, lon, radio }: { lat: number; lon: number; radio: number },
  signal?: AbortSignal,
  hacerFetch: typeof fetch = fetch,
): Promise<ElementoCercano[]> {
  const respuesta = await hacerFetch("/api/mapa/cerca", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ lat: redondearCoordenada(lat), lon: redondearCoordenada(lon), radio }),
    signal,
  })
  if (!respuesta.ok) throw new Error(`No se pudo buscar lo que hay cerca (${respuesta.status})`)
  const { cercanos } = (await respuesta.json()) as { cercanos: ElementoCercano[] }
  return cercanos
}
