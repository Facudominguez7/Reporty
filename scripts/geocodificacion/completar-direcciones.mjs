/**
 * Completa `reportes.direccion` en los reportes creados antes de guardar la calle.
 *
 * Uso:
 *   node --env-file=.env.development.local scripts/geocodificacion/completar-direcciones.mjs           # sólo muestra
 *   node --env-file=.env.development.local scripts/geocodificacion/completar-direcciones.mjs --aplicar # escribe
 *
 * Lee NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY del entorno. Respeta la
 * política de Nominatim: una consulta cada 1,1 s. Sólo toca reportes vivos, con
 * coordenadas y sin dirección; si no se encuentra la calle, el reporte queda igual.
 */
import { setTimeout as esperar } from "node:timers/promises"
import { createClient } from "@supabase/supabase-js"

import { obtenerDireccion } from "../../lib/geocodificacion/direccion-inversa.ts"

const PAUSA_MS = 1100
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

/** Recorre los reportes sin dirección y la completa (o la muestra en modo prueba). */
async function principal() {
  const supabase = createClient(requerida("NEXT_PUBLIC_SUPABASE_URL"), requerida("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  })

  const { data: reportes, error } = await supabase
    .from("reportes")
    .select("id, lat, lon")
    .is("direccion", null)
    .is("deleted_at", null)
    .not("lat", "is", null)
    .not("lon", "is", null)
    .order("id")

  if (error) throw error
  console.log(`${reportes.length} reportes sin dirección${aplicar ? "" : " (modo prueba: agregá --aplicar para guardar)"}`)

  let guardados = 0
  for (const [indice, reporte] of reportes.entries()) {
    if (indice > 0) await esperar(PAUSA_MS)
    const direccion = await obtenerDireccion(reporte.lat, reporte.lon)
    console.log(`#${reporte.id}: ${direccion ?? "(sin calle)"}`)
    if (!aplicar || !direccion) continue

    const { error: errorUpdate } = await supabase
      .from("reportes")
      .update({ direccion })
      .eq("id", reporte.id)
      .is("direccion", null)
    if (errorUpdate) console.error(`#${reporte.id}: no se pudo guardar`, errorUpdate.message)
    else guardados += 1
  }

  if (aplicar) console.log(`Listo: ${guardados} direcciones guardadas.`)
}

await principal()
