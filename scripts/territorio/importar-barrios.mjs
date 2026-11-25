/**
 * Importa los barrios de Posadas desde el WFS de la IDE a `territorio.barrios` (#299).
 *
 * Uso:
 *   node --env-file=.env.development.local scripts/territorio/importar-barrios.mjs           # sólo muestra
 *   node --env-file=.env.development.local scripts/territorio/importar-barrios.mjs --aplicar # importa
 *
 * Lee NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY del entorno. Pide el GeoJSON una sola
 * vez y la fecha de la capa al catálogo de la IDE. La base transforma de EPSG:5348 a 4326,
 * reemplaza todos los barrios y registra fuente, versión, fecha, licencia y atribución
 * (`public.importar_barrios`). Es repetible: correrlo de nuevo deja la versión vigente de la IDE.
 */
import { createClient } from "@supabase/supabase-js"

import {
  ATRIBUCION_BARRIOS,
  CAPA_BARRIOS,
  CSW_BARRIOS,
  LICENCIA_BARRIOS,
  URL_BARRIOS_WFS,
  WFS_IDE_POSADAS,
  leerMetadatosFuente,
  validarBarriosWfs,
} from "../../lib/territorio/barrios.ts"

const TIEMPO_MAXIMO_MS = 60_000
const aplicar = process.argv.includes("--aplicar")

/** Lee una variable obligatoria del entorno o corta con un mensaje claro. */
function requerida(nombre) {
  const valor = process.env[nombre]
  if (!valor) {
    console.error(`Falta ${nombre}. Pasá el archivo con --env-file.`)
    process.exit(1)
  }
  return valor
}

/** Pide una URL de la IDE y corta si responde con error o tarda demasiado. */
async function pedir(url) {
  const respuesta = await fetch(url, { signal: AbortSignal.timeout(TIEMPO_MAXIMO_MS) })
  if (!respuesta.ok) throw new Error(`La IDE respondió ${respuesta.status} a ${url}`)
  return respuesta
}

/** Descarga los barrios y su fecha, y los importa (o muestra qué importaría). */
async function principal() {
  const url = requerida("NEXT_PUBLIC_SUPABASE_URL")
  const clave = requerida("SUPABASE_SERVICE_ROLE_KEY")

  const { version, fecha } = leerMetadatosFuente(await (await pedir(CSW_BARRIOS)).text())
  const barrios = validarBarriosWfs(await (await pedir(URL_BARRIOS_WFS)).json())
  console.log(`${barrios.length} barrios de «${version}», modificada el ${fecha}`)

  if (!aplicar) {
    console.log(`Modo prueba: agregá --aplicar para importarlos en ${new URL(url).host}.`)
    return
  }

  const supabase = createClient(url, clave, { auth: { persistSession: false } })
  const { data: cargados, error } = await supabase.rpc("importar_barrios", {
    barrios,
    fuente: `${WFS_IDE_POSADAS}#${CAPA_BARRIOS}`,
    version,
    fecha_fuente: fecha,
    licencia: LICENCIA_BARRIOS,
    atribucion: ATRIBUCION_BARRIOS,
  })
  if (error) throw error
  console.log(`Importados ${cargados} barrios en ${new URL(url).host}.`)
}

principal().catch((error) => {
  console.error(error)
  process.exit(1)
})
