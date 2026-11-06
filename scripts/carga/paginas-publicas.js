/**
 * Prueba de carga de las páginas públicas de Reporty con k6 (issue #144).
 *
 * Recorre `/`, `/mapa`, `/reportes`, el detalle de un reporte y `/sitemap.xml` con usuarios
 * virtuales concurrentes. Debe correr solo contra la build de producción local que levanta
 * `npm run test:load`; nunca contra producción.
 *
 * Variables de entorno (las pasa `scripts/carga/ejecutar.mjs`):
 * - `BASE_URL`: origen de la app, por ejemplo `http://127.0.0.1:3100`.
 * - `USUARIOS`: usuarios virtuales en la meseta (por defecto 20).
 * - `DURACION`: duración de la meseta (por defecto `1m`).
 */
import http from "k6/http"
import { check, fail, sleep } from "k6"

const BASE_URL = __ENV.BASE_URL || "http://127.0.0.1:3100"
const USUARIOS = Number(__ENV.USUARIOS || 20)
const DURACION = __ENV.DURACION || "1m"

export const options = {
  stages: [
    { duration: "20s", target: USUARIOS },
    { duration: DURACION, target: USUARIOS },
    { duration: "10s", target: 0 },
  ],
  thresholds: {
    // Umbrales generales de aceptación de la build local.
    http_req_failed: ["rate<0.01"],
    checks: ["rate>0.99"],
    http_req_duration: ["p(95)<2000"],
    // Umbrales por página, para que el resumen muestre la latencia de cada una.
    "http_req_duration{pagina:inicio}": ["p(95)<2000"],
    "http_req_duration{pagina:mapa}": ["p(95)<2000"],
    "http_req_duration{pagina:reportes}": ["p(95)<2000"],
    "http_req_duration{pagina:detalle}": ["p(95)<2000"],
    "http_req_duration{pagina:sitemap}": ["p(95)<2000"],
  },
}

/**
 * Prepara la prueba: confirma que la app responde y elige un reporte para el detalle.
 *
 * Toma el primer `/reportes/<id>` del sitemap y usa solo su ruta, porque el sitemap publica
 * las URL con el dominio de producción.
 *
 * @returns {{ rutaDetalle: string }} Ruta del detalle a cargar.
 */
export function setup() {
  const respuesta = http.get(`${BASE_URL}/sitemap.xml`)
  if (respuesta.status !== 200) {
    fail(`La app no responde en ${BASE_URL} (sitemap.xml devolvió ${respuesta.status}).`)
  }
  const coincidencia = String(respuesta.body).match(/\/reportes\/[^<\s"/]+/)
  if (!coincidencia) {
    fail("El sitemap no tiene reportes: la base local necesita datos (`npm run db:setup`).")
  }
  return { rutaDetalle: coincidencia[0] }
}

/**
 * Pide una página, la etiqueta para el resumen y verifica que respondió bien.
 *
 * @param {string} ruta Ruta relativa a `BASE_URL`.
 * @param {string} pagina Nombre de la etiqueta `pagina` en las métricas.
 */
function visitar(ruta, pagina) {
  const respuesta = http.get(`${BASE_URL}${ruta}`, { tags: { pagina } })
  check(respuesta, { [`${pagina}: estado 200`]: (r) => r.status === 200 })
}

/**
 * Iteración de cada usuario virtual: recorre las páginas públicas con una pausa entre cada una,
 * como una visita real.
 *
 * @param {{ rutaDetalle: string }} datos Resultado de `setup()`.
 */
export default function recorrerPaginas(datos) {
  visitar("/", "inicio")
  sleep(1)
  visitar("/mapa", "mapa")
  sleep(1)
  visitar("/reportes", "reportes")
  sleep(1)
  visitar(datos.rutaDetalle, "detalle")
  sleep(1)
  visitar("/sitemap.xml", "sitemap")
  sleep(1)
}
