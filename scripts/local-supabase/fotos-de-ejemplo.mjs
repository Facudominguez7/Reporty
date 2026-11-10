/**
 * Completa las fotos de los reportes y de las mascotas en el Supabase LOCAL con
 * imágenes de ejemplo.
 *
 * La base local es una copia de producción, pero los archivos del Storage no vienen
 * con ella: las filas de `fotos_reporte` apuntan a objetos que no existen y la ficha
 * no muestra la foto. Este script:
 *   - sube una imagen de ejemplo (y su miniatura) en la ruta de cada foto existente;
 *   - agrega una foto a los reportes vivos que no tienen ninguna;
 *   - sube la foto de cada mascota publicada en su `foto_path`.
 *
 * Sólo completa archivos que faltan: si una foto real está en el Storage, no la toca.
 * Las imágenes dicen «Imagen de ejemplo» para que nunca se confundan con una foto real.
 * Se niega a correr si la URL de Supabase no es local.
 *
 * Uso: NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 node --env-file=.env.development.local scripts/local-supabase/fotos-de-ejemplo.mjs
 * (la URL explícita hace falta si `.env.development.local` apunta a la tailnet).
 */
import { createClient } from "@supabase/supabase-js"
import sharp from "sharp"

const URL_SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
const CLAVE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
const BUCKET = "reportes"

if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(URL_SUPABASE)) {
  console.error(`Sólo corre contra Supabase local; NEXT_PUBLIC_SUPABASE_URL es «${URL_SUPABASE || "(vacía)"}».`)
  process.exit(1)
}
if (!CLAVE) {
  console.error("Falta SUPABASE_SERVICE_ROLE_KEY.")
  process.exit(1)
}

/** Colores de fondo por categoría (tonos suaves de la paleta de la app). */
const TONOS = {
  Bache: ["#5C5A55", "#8C8A84"],
  "Arbol caido": ["#278C5A", "#6FB48F"],
  Perro: ["#EF852E", "#F5B77F"],
  Gato: ["#5E5A9A", "#9A96CC"],
  Agua: ["#297CAE", "#7CB3D6"],
  Basura: ["#77756F", "#A8A6A0"],
  Luminaria: ["#CA9D33", "#E6C878"],
}
const TONO_POR_DEFECTO = ["#5E5A9A", "#9A96CC"]

/** Escapa texto para meterlo en el SVG. */
function escapar(texto) {
  return texto.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c])
}

/** Imagen 1200×900 con degradé de la categoría y la leyenda de ejemplo. */
async function crearImagen(categoria, titulo, ancho = 1200, alto = 900) {
  const [oscuro, claro] = TONOS[categoria] ?? TONO_POR_DEFECTO
  const tituloCorto = titulo.length > 38 ? `${titulo.slice(0, 37)}…` : titulo
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${claro}"/>
      <stop offset="1" stop-color="${oscuro}"/>
    </linearGradient>
    <pattern id="p" width="60" height="60" patternUnits="userSpaceOnUse" patternTransform="rotate(30)">
      <rect width="30" height="60" fill="#ffffff" fill-opacity="0.06"/>
    </pattern>
  </defs>
  <rect width="1200" height="900" fill="url(#g)"/>
  <rect width="1200" height="900" fill="url(#p)"/>
  <circle cx="600" cy="330" r="110" fill="#ffffff" fill-opacity="0.18"/>
  <path d="M600 250c-44 0-80 36-80 80 0 60 80 140 80 140s80-80 80-140c0-44-36-80-80-80zm0 112a32 32 0 1 1 0-64 32 32 0 0 1 0 64z" fill="#ffffff" fill-opacity="0.9"/>
  <text x="600" y="560" font-family="Geist, Inter, Arial, sans-serif" font-size="64" font-weight="700" fill="#ffffff" text-anchor="middle">${escapar(categoria)}</text>
  <text x="600" y="630" font-family="Geist, Inter, Arial, sans-serif" font-size="38" fill="#ffffff" fill-opacity="0.9" text-anchor="middle">${escapar(tituloCorto)}</text>
  <rect x="420" y="700" width="360" height="60" rx="30" fill="#000000" fill-opacity="0.25"/>
  <text x="600" y="740" font-family="Geist, Inter, Arial, sans-serif" font-size="28" font-weight="600" fill="#ffffff" text-anchor="middle">Imagen de ejemplo</text>
</svg>`
  return sharp(Buffer.from(svg)).resize(ancho, alto).webp({ quality: 82 }).toBuffer()
}

/** Indica si el archivo ya está en el Storage (no sólo su fila en `storage.objects`). */
async function existe(supabase, ruta) {
  const { data, error } = await supabase.storage.from(BUCKET).download(ruta)
  return !error && data !== null && data.size > 0
}

/**
 * Sube un archivo sólo si falta: nunca pisa una foto real que sí esté en el Storage.
 *
 * @returns `true` si lo subió.
 */
async function subir(supabase, ruta, contenido) {
  if (await existe(supabase, ruta)) return false
  const { error } = await supabase.storage.from(BUCKET).upload(ruta, contenido, { contentType: "image/webp", upsert: true })
  if (error) throw new Error(`${ruta}: ${error.message}`)
  return true
}

const supabase = createClient(URL_SUPABASE, CLAVE, { auth: { persistSession: false } })

const { data: reportes, error } = await supabase
  .from("reportes")
  .select("id, titulo, categorias(nombre), fotos_reporte(id, path, thumbnail_path)")
  .is("deleted_at", null)
  .order("id")
if (error) throw error

let reemplazadas = 0
let agregadas = 0
for (const reporte of reportes) {
  const categoria = reporte.categorias?.nombre ?? "Reporte"
  const imagen = await crearImagen(categoria, reporte.titulo)
  const miniatura = await crearImagen(categoria, reporte.titulo, 400, 300)

  if (reporte.fotos_reporte.length > 0) {
    for (const foto of reporte.fotos_reporte) {
      if (foto.path && (await subir(supabase, foto.path, imagen))) reemplazadas += 1
      if (foto.thumbnail_path) await subir(supabase, foto.thumbnail_path, miniatura)
    }
    continue
  }

  const ruta = `ejemplo/${reporte.id}/foto.webp`
  const rutaMiniatura = `ejemplo/${reporte.id}/foto-miniatura.webp`
  await subir(supabase, ruta, imagen)
  await subir(supabase, rutaMiniatura, miniatura)
  const publica = (path) => supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
  const { error: errorFila } = await supabase.from("fotos_reporte").insert({
    reporte_id: reporte.id,
    url: publica(ruta),
    bucket: BUCKET,
    path: ruta,
    thumbnail_url: publica(rutaMiniatura),
    thumbnail_bucket: BUCKET,
    thumbnail_path: rutaMiniatura,
  })
  if (errorFila) throw new Error(`reporte ${reporte.id}: ${errorFila.message}`)
  agregadas += 1
}

const { data: mascotas, error: errorMascotas } = await supabase
  .from("mascotas_perdidas")
  .select("id, tipo_animal, estado, foto_path")
  .is("retirada_at", null)
  .not("foto_path", "is", null)
if (errorMascotas) throw errorMascotas

let mascotasCompletadas = 0
for (const mascota of mascotas) {
  const especie = mascota.tipo_animal === "perro" ? "Perro" : mascota.tipo_animal === "gato" ? "Gato" : "Mascota"
  const estado = mascota.estado === "encontrada" ? "encontrada" : "perdida"
  if (await subir(supabase, mascota.foto_path, await crearImagen(especie, `${especie} ${estado}`))) mascotasCompletadas += 1
}

console.log(`Listo: ${reemplazadas} fotos completadas y ${agregadas} reportes con foto nueva (de ${reportes.length}).`)
console.log(`Mascotas: ${mascotasCompletadas} fotos completadas (de ${mascotas.length}; las que ya tenían archivo quedaron igual).`)
