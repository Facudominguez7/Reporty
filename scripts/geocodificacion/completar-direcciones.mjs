/**
 * Completa la calle (`direccion`) de los reportes y de las mascotas publicadas antes
 * de que se guardara al crearlos.
 *
 * Uso:
 *   node --env-file=.env.development.local scripts/geocodificacion/completar-direcciones.mjs           # sólo muestra
 *   node --env-file=.env.development.local scripts/geocodificacion/completar-direcciones.mjs --aplicar # escribe
 *
 * Lee NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY del entorno. Respeta la
 * política de Nominatim: una consulta cada 1,1 s. Sólo toca reportes vivos y mascotas
 * no retiradas, con coordenadas y sin dirección; si no se encuentra la calle, la fila
 * queda igual.
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

/** Tablas a completar: nombre, filtro de filas vivas y etiqueta para el log. */
const TABLAS = [
  { tabla: "reportes", columnaViva: "deleted_at", etiqueta: "reportes" },
  { tabla: "mascotas_perdidas", columnaViva: "retirada_at", etiqueta: "mascotas" },
]

/** Recorre las filas sin dirección de cada tabla y la completa (o la muestra en modo prueba). */
async function principal() {
  const supabase = createClient(requerida("NEXT_PUBLIC_SUPABASE_URL"), requerida("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  })

  let consultas = 0
  for (const { tabla, columnaViva, etiqueta } of TABLAS) {
    const { data: filas, error } = await supabase
      .from(tabla)
      .select("id, lat, lon")
      .is("direccion", null)
      .is(columnaViva, null)
      .not("lat", "is", null)
      .not("lon", "is", null)
      .order("id")

    if (error) throw error
    console.log(`${filas.length} ${etiqueta} sin dirección${aplicar ? "" : " (modo prueba: agregá --aplicar para guardar)"}`)

    let guardados = 0
    for (const fila of filas) {
      if (consultas++ > 0) await esperar(PAUSA_MS)
      const direccion = await obtenerDireccion(fila.lat, fila.lon)
      console.log(`${etiqueta} #${fila.id}: ${direccion ?? "(sin calle)"}`)
      if (!aplicar || !direccion) continue

      const { error: errorUpdate } = await supabase
        .from(tabla)
        .update({ direccion })
        .eq("id", fila.id)
        .is("direccion", null)
      if (errorUpdate) console.error(`${etiqueta} #${fila.id}: no se pudo guardar`, errorUpdate.message)
      else guardados += 1
    }

    if (aplicar) console.log(`Listo: ${guardados} direcciones de ${etiqueta} guardadas.`)
  }
}

await principal()
