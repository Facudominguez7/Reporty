/**
 * Ubicación de la persona al abrir el mapa (#297), sin botón.
 *
 * Según el estado del permiso: si ya lo dio, se lee sin preguntar; si nunca respondió, se pide en
 * ese momento (y si cierra el diálogo sin responder, no se vuelve a pedir en esa sesión); si lo
 * negó, se avisa una sola vez cómo activarlo. Sin Permissions API se llama directo a la
 * geolocalización. La primera lectura tarda 6 s como máximo; si vencen con el diálogo de permiso
 * abierto, se lee una vez más cuando la persona acepta. Con la ubicación ya dada, `seguirUbicacion`
 * la sigue mientras el mapa está a la vista, y lo cercano se vuelve a buscar cada 100 m.
 *
 * La lectura exacta solo se usa en el teléfono para dibujar el punto; al servidor sale redondeada
 * (`pedirCercanos`).
 */
import type { ElementoCercano } from "@/lib/map/cercanos"
import {
  DISTANCIA_ACTUALIZAR_CERCANOS_M,
  TIEMPO_UBICACION_CERCANOS_MS,
  dentroDePosadas,
  redondearCoordenada,
} from "@/lib/map/cercanos"
import { distanciaEnMetros, type PuntoGeografico } from "@/lib/reportes/duplicados"
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
 * @returns El estado y el objeto que avisa sus cambios, o `sin-api` si no hay Permissions API o
 *   la consulta falla.
 */
async function leerEstadoPermiso(
  permisos: Permissions | undefined,
): Promise<{ estado: EstadoPermiso; seguimiento: PermissionStatus | null }> {
  if (!permisos?.query) return { estado: "sin-api", seguimiento: null }
  try {
    const seguimiento = await permisos.query({ name: "geolocation" })
    return { estado: seguimiento.state, seguimiento }
  } catch {
    return { estado: "sin-api", seguimiento: null }
  }
}

/**
 * Espera a que la persona responda el diálogo de permiso.
 *
 * @param seguimiento - Estado del permiso, que avisa con el evento `change`.
 * @returns `true` si lo aceptó y `false` si lo negó. Si nunca responde, no termina.
 */
function esperarRespuestaAlPermiso(seguimiento: PermissionStatus): Promise<boolean> {
  if (seguimiento.state !== "prompt") return Promise.resolve(seguimiento.state === "granted")
  return new Promise((resolver) => {
    const alCambiar = () => {
      if (seguimiento.state === "prompt") return
      seguimiento.removeEventListener("change", alCambiar)
      resolver(seguimiento.state === "granted")
    }
    seguimiento.addEventListener("change", alCambiar)
  })
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

  const { estado: permiso, seguimiento } = await leerEstadoPermiso(navegador.permissions)

  if (permiso === "denied") {
    if (estaMarcado(almacenLocal, CLAVE_AVISO_UBICACION_DENEGADA)) return
    marcar(almacenLocal, CLAVE_AVISO_UBICACION_DENEGADA)
    alAvisarDenegado()
    return
  }

  // Si ya cerró el diálogo sin responder en esta sesión, no se insiste.
  if (permiso !== "granted" && estaMarcado(almacenSesion, CLAVE_UBICACION_SIN_RESPUESTA)) return

  const leer = () => buscarUbicacionPrecisa(geolocalizacion, { tiempoMaximoMs: TIEMPO_UBICACION_CERCANOS_MS })
  let ubicacion: UbicacionPrecisa
  try {
    ubicacion = await leer()
  } catch (error) {
    const codigo = (error as GeolocationPositionError | undefined)?.code
    if (codigo === ERROR_SIN_PERMISO && permiso !== "granted") marcar(almacenSesion, CLAVE_UBICACION_SIN_RESPUESTA)
    // Los 6 s corren desde que se abre el diálogo: si vencieron sin respuesta (sin código de
    // error), se lee una vez más apenas la persona acepta, para que igual vea su punto.
    if (codigo !== undefined || permiso !== "prompt" || !seguimiento) return
    if (!(await esperarRespuestaAlPermiso(seguimiento))) return
    try {
      ubicacion = await leer()
    } catch {
      return
    }
  }

  // Fuera de Posadas el mapa no se mueve y no hay nada cerca que buscar.
  if (!dentroDePosadas(ubicacion.lat, ubicacion.lon)) return
  alUbicar(ubicacion)
}

/**
 * Sigue la ubicación de la persona mientras camina. Solo se usa después de la primera lectura,
 * cuando el permiso ya está dado, así que no vuelve a abrir el diálogo.
 *
 * @param geolocalizacion - `navigator.geolocation` (inyectable en pruebas).
 * @param alMover - Recibe cada lectura dentro de Posadas; las de afuera se ignoran.
 * @returns Función que detiene el seguimiento y apaga el GPS.
 */
export function seguirUbicacion(geolocalizacion: Geolocation, alMover: (ubicacion: UbicacionPrecisa) => void): () => void {
  const id = geolocalizacion.watchPosition(
    ({ coords }) => {
      if (!dentroDePosadas(coords.latitude, coords.longitude)) return
      alMover({ lat: coords.latitude, lon: coords.longitude, precision: coords.accuracy })
    },
    // Un error suelto (sin señal un rato) no corta nada: el punto queda en la última lectura.
    () => {},
    { enableHighAccuracy: true, maximumAge: 5_000 },
  )
  return () => geolocalizacion.clearWatch(id)
}

/**
 * Indica si la persona se movió lo suficiente para volver a buscar lo que tiene cerca.
 *
 * @param busqueda - Punto de la última búsqueda.
 * @param actual - Ubicación actual.
 * @returns `true` si se alejó más de 100 m.
 */
export function debeActualizarCercanos(busqueda: PuntoGeografico, actual: PuntoGeografico): boolean {
  return distanciaEnMetros(busqueda, actual) > DISTANCIA_ACTUALIZAR_CERCANOS_M
}

/**
 * Indica si el mapa se centra en la persona al llegar su ubicación. Al cargar el mapa siempre se
 * centra, aunque se haya movido mientras se leía la ubicación; la única excepción es llegar desde
 * un reporte, porque ese enlace existe para mostrar el reporte.
 *
 * @param estado.hayFocoReporte - Se llegó desde un reporte (`/mapa?reporte=…`).
 * @returns `true` si se centra el mapa en la persona.
 */
export function debeCentrarEnPersona({ hayFocoReporte }: { hayFocoReporte: boolean }): boolean {
  return !hayFocoReporte
}

/**
 * Indica si el mapa se vuelve a centrar en la persona cuando regresa a la app (o a la pestaña) y
 * llega la primera lectura nueva. Solo si se movió más de 100 m mientras no la usaba: si sigue
 * cerca, el mapa queda donde lo dejó, para no pisar lo que estaba mirando.
 *
 * @param antes - Última ubicación conocida antes de salir de la app.
 * @param actual - Primera ubicación leída al volver.
 * @returns `true` si hay que centrar el mapa en la persona.
 */
export function debeCentrarAlVolver(antes: PuntoGeografico, actual: PuntoGeografico): boolean {
  return distanciaEnMetros(antes, actual) > DISTANCIA_ACTUALIZAR_CERCANOS_M
}

/**
 * Indica si la persona eligió otro radio: entonces el mapa vuelve a encuadrar el círculo, así el
 * zoom acompaña (más chico se acerca, más grande se aleja). La primera ubicación la decide
 * `debeCentrarEnPersona`.
 *
 * @param estado.radioAnterior - Radio del círculo ya dibujado, o `null` si todavía no hay.
 * @param estado.radio - Radio elegido, en metros.
 * @returns `true` si hay que encuadrar el círculo.
 */
export function debeEncuadrarRadio({ radioAnterior, radio }: { radioAnterior: number | null; radio: number }): boolean {
  return radioAnterior !== null && radioAnterior !== radio
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
