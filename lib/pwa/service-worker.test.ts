import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { beforeEach, describe, expect, it, vi } from "vitest"

const ORIGEN = "https://reporty.com.ar"
const codigoServiceWorker = readFileSync(
  fileURLToPath(new URL("../../public/sw.js", import.meta.url)),
  "utf8",
)

type Escucha = (evento: any) => void

/**
 * Almacén de caché en memoria que imita la Cache API del navegador.
 */
class CacheFalsa {
  entradas = new Map<string, Response>()

  /** Guarda las URLs indicadas como respuestas vacías. */
  async addAll(urls: string[]) {
    for (const url of urls) this.entradas.set(new URL(url, ORIGEN).href, new Response(`precache:${url}`))
  }

  /** Guarda una respuesta asociada a la petición. */
  async put(peticion: Request | string, respuesta: Response) {
    this.entradas.set(typeof peticion === "string" ? new URL(peticion, ORIGEN).href : peticion.url, respuesta)
  }

  /** Devuelve la respuesta guardada para la petición, si existe. */
  async match(peticion: Request | string) {
    const clave = typeof peticion === "string" ? new URL(peticion, ORIGEN).href : peticion.url
    return this.entradas.get(clave)?.clone()
  }

  /** Lista las peticiones guardadas en orden de inserción. */
  async keys() {
    return [...this.entradas.keys()].map((url) => new Request(url))
  }

  /** Borra la entrada de la petición. */
  async delete(peticion: Request) {
    return this.entradas.delete(peticion.url)
  }
}

/**
 * Carga `public/sw.js` sobre un `self` falso y devuelve sus escuchas y cachés.
 *
 * @param red - Implementación de `fetch` que simula la red.
 * @returns Escuchas registradas, cachés creadas y helpers para despachar eventos.
 */
function cargarServiceWorker(red: (peticion: Request) => Promise<Response>) {
  const escuchas = new Map<string, Escucha>()
  const cachesAbiertas = new Map<string, CacheFalsa>()
  const almacenCaches = {
    async open(nombre: string) {
      if (!cachesAbiertas.has(nombre)) cachesAbiertas.set(nombre, new CacheFalsa())
      return cachesAbiertas.get(nombre)!
    },
    async keys() {
      return [...cachesAbiertas.keys()]
    },
    async delete(nombre: string) {
      return cachesAbiertas.delete(nombre)
    },
  }
  const selfFalso = {
    location: { origin: ORIGEN },
    addEventListener: (tipo: string, escucha: Escucha) => escuchas.set(tipo, escucha),
    skipWaiting: vi.fn(async () => {}),
    clients: { claim: vi.fn(async () => {}) },
  }
  new Function("self", "caches", "fetch", codigoServiceWorker)(selfFalso, almacenCaches, red)

  /** Despacha un evento con `waitUntil` y espera la promesa registrada. */
  async function despacharCicloDeVida(tipo: "install" | "activate") {
    let pendiente: Promise<unknown> = Promise.resolve()
    escuchas.get(tipo)!({ waitUntil: (promesa: Promise<unknown>) => (pendiente = promesa) })
    await pendiente
  }

  /**
   * Despacha un evento `fetch` y devuelve la respuesta, o `undefined` si el worker no la toma.
   */
  async function despacharFetch(peticion: Request) {
    let respuesta: Promise<Response> | undefined
    escuchas.get("fetch")!({ request: peticion, respondWith: (r: Promise<Response>) => (respuesta = r) })
    return respuesta ? await respuesta : undefined
  }

  return { selfFalso, cachesAbiertas, almacenCaches, despacharCicloDeVida, despacharFetch }
}

/** Crea una petición de navegación de documento, como la que dispara abrir una URL. */
function navegacion(ruta: string) {
  const peticion = new Request(`${ORIGEN}${ruta}`)
  Object.defineProperty(peticion, "mode", { value: "navigate" })
  return peticion
}

describe("service worker de Reporty", () => {
  let red: ReturnType<typeof vi.fn<(peticion: Request) => Promise<Response>>>

  beforeEach(() => {
    red = vi.fn(async (peticion: Request) => new Response(`red:${new URL(peticion.url).pathname}`))
  })

  it("precachea la página offline al instalarse y toma el control enseguida", async () => {
    const sw = cargarServiceWorker(red)
    await sw.despacharCicloDeVida("install")

    const [cache] = sw.cachesAbiertas.values()
    expect(await cache.match("/offline.html")).toBeDefined()
    expect(sw.selfFalso.skipWaiting).toHaveBeenCalled()
  })

  it("al activarse borra las cachés de versiones anteriores y conserva las ajenas", async () => {
    const sw = cargarServiceWorker(red)
    await sw.almacenCaches.open("reporty-paginas-v0")
    await sw.almacenCaches.open("otra-app")
    await sw.despacharCicloDeVida("install")
    await sw.despacharCicloDeVida("activate")

    const nombres = await sw.almacenCaches.keys()
    expect(nombres).not.toContain("reporty-paginas-v0")
    expect(nombres).toContain("otra-app")
    expect(sw.selfFalso.clients.claim).toHaveBeenCalled()
  })

  it("una navegación con red devuelve la respuesta de la red y no la guarda", async () => {
    const sw = cargarServiceWorker(red)
    await sw.despacharCicloDeVida("install")

    const respuesta = await sw.despacharFetch(navegacion("/reportes"))

    expect(await respuesta!.text()).toBe("red:/reportes")
    for (const cache of sw.cachesAbiertas.values()) {
      expect(await cache.match(`${ORIGEN}/reportes`)).toBeUndefined()
    }
  })

  it("una navegación sin red devuelve la página offline", async () => {
    const sw = cargarServiceWorker(red)
    await sw.despacharCicloDeVida("install")
    red.mockRejectedValue(new TypeError("Failed to fetch"))

    const respuesta = await sw.despacharFetch(navegacion("/mapa"))

    expect(await respuesta!.text()).toBe("precache:/offline.html")
  })

  it("los recursos de /_next/static se sirven desde caché después de la primera descarga", async () => {
    const sw = cargarServiceWorker(red)
    const url = `${ORIGEN}/_next/static/chunks/app-abc123.js`

    const primera = await sw.despacharFetch(new Request(url))
    red.mockRejectedValue(new TypeError("Failed to fetch"))
    const segunda = await sw.despacharFetch(new Request(url))

    expect(await primera!.text()).toBe("red:/_next/static/chunks/app-abc123.js")
    expect(await segunda!.text()).toBe("red:/_next/static/chunks/app-abc123.js")
    expect(red).toHaveBeenCalledTimes(1)
  })

  it("no toma peticiones POST, de otros orígenes ni de la API", async () => {
    const sw = cargarServiceWorker(red)

    expect(await sw.despacharFetch(new Request(`${ORIGEN}/reportes`, { method: "POST" }))).toBeUndefined()
    expect(await sw.despacharFetch(new Request("https://proyecto.supabase.co/rest/v1/reportes"))).toBeUndefined()
    expect(await sw.despacharFetch(new Request(`${ORIGEN}/api/reportes`))).toBeUndefined()
    expect(red).not.toHaveBeenCalled()
  })
})
