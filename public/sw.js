/**
 * Service worker de Reporty.
 *
 * Estrategias:
 * - Navegaciones: siempre red; si no hay conexión, se muestra /offline.html. El HTML nunca se
 *   guarda porque depende de la sesión del usuario.
 * - /_next/static: caché primero (los archivos llevan hash de contenido y son inmutables).
 * - Todo lo demás (API, POST, Supabase, otros orígenes) pasa directo a la red sin intervenir.
 *
 * Para invalidar las cachés de todos los clientes, subir VERSION.
 */
const VERSION = "v1"
const CACHE_PAGINAS = `reporty-paginas-${VERSION}`
const CACHE_ESTATICOS = `reporty-estaticos-${VERSION}`
const PAGINA_OFFLINE = "/offline.html"
const MAXIMO_ESTATICOS = 150

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    caches
      .open(CACHE_PAGINAS)
      .then((cache) => cache.addAll([PAGINA_OFFLINE]))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener("activate", (evento) => {
  const vigentes = [CACHE_PAGINAS, CACHE_ESTATICOS]
  evento.waitUntil(
    caches
      .keys()
      .then((nombres) =>
        Promise.all(
          nombres
            .filter((nombre) => nombre.startsWith("reporty-") && !vigentes.includes(nombre))
            .map((nombre) => caches.delete(nombre)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener("fetch", (evento) => {
  const peticion = evento.request
  if (peticion.method !== "GET") return

  const url = new URL(peticion.url)
  if (url.origin !== self.location.origin) return

  if (peticion.mode === "navigate") {
    evento.respondWith(navegarConRespaldoOffline(peticion))
    return
  }

  if (url.pathname.startsWith("/_next/static/")) {
    evento.respondWith(servirEstaticoDesdeCache(peticion))
  }
})

/**
 * Pide la página a la red y, si falla la conexión, devuelve la página offline precacheada.
 *
 * @param {Request} peticion - Navegación de documento.
 * @returns {Promise<Response>} La respuesta de la red o la página offline.
 */
async function navegarConRespaldoOffline(peticion) {
  try {
    return await fetch(peticion)
  } catch {
    const cache = await caches.open(CACHE_PAGINAS)
    const offline = await cache.match(PAGINA_OFFLINE)
    return offline ?? Response.error()
  }
}

/**
 * Devuelve el recurso estático desde caché; si no está, lo descarga y lo guarda.
 *
 * @param {Request} peticion - Petición a un archivo de /_next/static.
 * @returns {Promise<Response>} La respuesta cacheada o la de la red.
 */
async function servirEstaticoDesdeCache(peticion) {
  const cache = await caches.open(CACHE_ESTATICOS)
  const cacheada = await cache.match(peticion)
  if (cacheada) return cacheada

  const respuesta = await fetch(peticion)
  if (respuesta.ok) {
    await cache.put(peticion, respuesta.clone())
    await recortarCache(cache)
  }
  return respuesta
}

/**
 * Borra las entradas más antiguas para que la caché no crezca sin límite entre deploys.
 *
 * @param {Cache} cache - Caché de estáticos.
 * @returns {Promise<void>}
 */
async function recortarCache(cache) {
  const claves = await cache.keys()
  const sobrantes = claves.slice(0, Math.max(0, claves.length - MAXIMO_ESTATICOS))
  await Promise.all(sobrantes.map((clave) => cache.delete(clave)))
}
