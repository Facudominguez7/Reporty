#!/usr/bin/env node
/**
 * Lanzador de la prueba de carga de las páginas públicas (issue #144).
 *
 *   npm run test:load                         build + servidor local + k6
 *   USUARIOS=50 DURACION=2m npm run test:load  otra intensidad
 *
 * Compila la app y la sirve en el puerto 3100 contra el Supabase local, con la misma
 * configuración que las pruebas E2E (sin correos reales ni Google Analytics). Si el puerto ya
 * está ocupado, corta: no reutiliza servidores ajenos, que podrían apuntar a producción o a una
 * build vieja. Después corre k6 con Docker (`grafana/k6`), así que no
 * agrega dependencias npm, y deja el resumen en `test-results/carga/resumen.json`.
 * Nunca apunta a producción.
 */
import { execSync, spawn, spawnSync } from "node:child_process"
import { mkdirSync } from "node:fs"
import path from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const PUERTO = 3100
const URL_LOCAL = `http://127.0.0.1:${PUERTO}`
const IMAGEN_K6 = "grafana/k6:1.3.0"
const DIR_RESULTADOS = path.join(RAIZ, "test-results", "carga")

/**
 * Lee las claves del Supabase local; corta con un mensaje claro si no está levantado.
 *
 * @returns {{ API_URL: string, ANON_KEY: string, SERVICE_ROLE_KEY: string }}
 */
function supabaseLocal() {
  try {
    const salida = execSync("npx supabase status -o json", { cwd: RAIZ, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
    return JSON.parse(salida.slice(salida.indexOf("{")))
  } catch {
    console.error("El Supabase local no está levantado. Inicialo con `npm run db:start` (ver supabase/README.md).")
    process.exit(1)
  }
}

/**
 * Corta la prueba si la API del Supabase local no responde.
 *
 * Sin API, las páginas igual devuelven 200 pero sin datos, y la carga mediría páginas vacías.
 *
 * @param {string} apiUrl URL de la API del Supabase local.
 * @returns {Promise<void>}
 */
async function exigirApiSupabase(apiUrl) {
  try {
    await fetch(`${apiUrl}/rest/v1/`)
  } catch {
    console.error(`La API del Supabase local no responde en ${apiUrl}. Reinicialo con \`npm run db:stop\` y \`npm run db:start\`.`)
    process.exit(1)
  }
}

/**
 * Indica si la app ya responde en el puerto de la prueba.
 *
 * @returns {Promise<boolean>}
 */
async function appResponde() {
  try {
    return (await fetch(`${URL_LOCAL}/robots.txt`)).ok
  } catch {
    return false
  }
}

/**
 * Compila la app y la sirve en el puerto de la prueba contra el Supabase local.
 *
 * Las variables definidas acá ganan sobre `.env`, que apunta a producción.
 *
 * @param {{ API_URL: string, ANON_KEY: string, SERVICE_ROLE_KEY: string }} supabase Claves del Supabase local.
 * @returns {Promise<import("node:child_process").ChildProcess>} Proceso del servidor.
 */
async function levantarApp(supabase) {
  const env = {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: supabase.API_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: supabase.ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: supabase.SERVICE_ROLE_KEY,
    NEXT_PUBLIC_APP_URL: URL_LOCAL,
    // Clave y destino falsos: la carga no recorre flujos que manden correos, y si alguno lo
    // hiciera, el pedido falla contra un puerto cerrado en vez de salir a Resend.
    RESEND_API_KEY: "re_carga_falsa",
    RESEND_BASE_URL: "http://127.0.0.1:9",
    NEXT_PUBLIC_GA_ID: "",
  }
  const build = spawnSync("npm", ["run", "build"], { cwd: RAIZ, env, stdio: "inherit", shell: process.platform === "win32" })
  if (build.status !== 0) {
    console.error("Falló la build de la app.")
    process.exit(1)
  }
  const servidor = spawn("npx", ["next", "start", "-H", "127.0.0.1", "-p", String(PUERTO)], {
    cwd: RAIZ,
    env,
    stdio: "ignore",
    shell: process.platform === "win32",
    // Grupo propio, para cerrar también el proceso de Next que lanza npx.
    detached: process.platform !== "win32",
  })
  for (let intento = 0; intento < 60; intento++) {
    if (await appResponde()) return servidor
    await new Promise((resolver) => setTimeout(resolver, 1000))
  }
  detenerApp(servidor)
  console.error(`La app no respondió en ${URL_LOCAL} después de 60 s.`)
  process.exit(1)
}

/**
 * Detiene el servidor de la app junto con sus procesos hijos.
 *
 * @param {import("node:child_process").ChildProcess} servidor Proceso devuelto por `levantarApp()`.
 */
function detenerApp(servidor) {
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(servidor.pid), "/T", "/F"], { stdio: "ignore" })
  } else {
    process.kill(-servidor.pid, "SIGTERM")
  }
}

/**
 * Corre el script de k6 en Docker contra la app local.
 *
 * En Linux el contenedor usa la red del host para llegar a 127.0.0.1; en Docker Desktop
 * (Windows y macOS) llega por `host.docker.internal`.
 *
 * @returns {number} Código de salida de k6 (99 si no se cumplió algún umbral).
 */
function correrK6() {
  mkdirSync(DIR_RESULTADOS, { recursive: true })
  const enLinux = process.platform === "linux"
  const baseUrl = enLinux ? URL_LOCAL : `http://host.docker.internal:${PUERTO}`
  const args = [
    "run",
    "--rm",
    ...(enLinux ? ["--network", "host", "--user", `${process.getuid()}:${process.getgid()}`] : []),
    "-v",
    `${path.join(RAIZ, "scripts", "carga")}:/scripts:ro`,
    "-v",
    `${DIR_RESULTADOS}:/resultados`,
    "-e",
    `BASE_URL=${baseUrl}`,
    "-e",
    `USUARIOS=${process.env.USUARIOS || 20}`,
    "-e",
    `DURACION=${process.env.DURACION || "1m"}`,
    IMAGEN_K6,
    "run",
    "--summary-export",
    "/resultados/resumen.json",
    "/scripts/paginas-publicas.js",
  ]
  return spawnSync("docker", args, { stdio: "inherit" }).status ?? 1
}

const supabase = supabaseLocal()
await exigirApiSupabase(supabase.API_URL)
if (await appResponde()) {
  console.error(`El puerto ${PUERTO} ya está ocupado. Cerrá ese servidor: la prueba levanta su propia build contra el Supabase local.`)
  process.exit(1)
}
const servidor = await levantarApp(supabase)
let codigo = 1
try {
  codigo = correrK6()
} finally {
  detenerApp(servidor)
}
console.log(`Resumen guardado en ${path.relative(RAIZ, path.join(DIR_RESULTADOS, "resumen.json"))}.`)
process.exit(codigo)
