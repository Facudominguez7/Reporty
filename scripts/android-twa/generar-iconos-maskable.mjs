/**
 * Genera los iconos maskable (192 y 512) a partir del favicon PNG existente.
 *
 * Elije glyph transparente:192 y 512: al des-mezclar el favicon (composición sobre negro),
 * el trazo del pin pasa a blanco y la «R» toma el verde de marca muestreado; sin
 * fondo: el color del splash o del launcher se ve a través. El glyph queda centrado
 * dentro de la zona segura maskable (círculo central de ~66 % del lienzo).
 *
 * Uso: node scripts/android-twa/generar-iconos-maskable.mjs
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

const raizRepo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const origen = path.join(raizRepo, "public/favicon_io/android-chrome-512x512.png");
const destinoDir = path.join(raizRepo, "public/favicon_io");

let sharp;
try {
  sharp = (await import("sharp")).default;
} catch {
  console.error("sharp no disponible. Instalalo con: pnpm add -D sharp");
  process.exit(1);
}

/** Alto del glyph dentro del lienzo de 512: deja margen al recorte circular. */
const ALTO_GLYPH = 300;
/** Umbral de relación entre canales para considerar un píxel del trazo verde del pin. */
const UMBRAL_VERDE = 1.35;

/** Lee el favicon como RGBA crudo a resolución nativa (512x512). */
const { data, info } = await sharp(origen).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: ancho, height: alto, channels } = info;

/**
 * Devuelve el verde de marca muestreado del trazo del pin (des-mezclado sobre negro).
 *
 * @returns {number[]} Terna RGB del verde original.
 */
function muestrearVerde() {
  for (let y = 0; y < alto; y += 4) {
    for (let x = 0; x < ancho; x += 4) {
      const i = (y * ancho + x) * channels;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const alfaCanal = Math.max(r, g, b);
      if (g > 180 && g > r * 1.6 && g > b * 1.6 && alfaCanal > 0) {
        return [Math.round((r * 255) / alfaCanal), Math.round((g * 255) / alfaCanal), Math.round((b * 255) / alfaCanal)];
      }
    }
  }
  return [6, 255, 147];
}

const verde = muestrearVerde();

/** Glyph des-mezclado: mismo tamaño que el origen, canal alfa = canal máximo. */
const glyph = Buffer.alloc(ancho * alto * 4);
for (let p = 0; p < ancho * alto; p++) {
  const i = p * channels;
  const r = data[i];
  const g = data[i + 1];
  const b = data[i + 2];
  const alfa = Math.max(r, g, b);
  const o = p * 4;
  if (alfa === 0) {
    glyph[o] = glyph[o + 1] = glyph[o + 2] = glyph[o + 3] = 0;
    continue;
  }
  const esTrazoPin = g > (r * 255) / alfa * UMBRAL_VERDE && g > (b * 255) / alfa * UMBRAL_VERDE;
  if (esTrazoPin) {
    glyph[o] = 255;
    glyph[o + 1] = 255;
    glyph[o + 2] = 255;
  } else {
    glyph[o] = verde[0];
    glyph[o + 1] = verde[1];
    glyph[o + 2] = verde[2];
  }
  glyph[o + 3] = alfa;
}

/** Bounding box del glyph a partir del alfa. */
let minX = ancho, minY = alto, maxX = 0, maxY = 0;
for (let y = 0; y < alto; y++) {
  for (let x = 0; x < ancho; x++) {
    if (glyph[(y * ancho + x) * 4 + 3] > 0) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
}

const anchoCaja = maxX - minX + 1;
const altoCaja = maxY - minY + 1;
const anchoDestino = Math.max(1, Math.round((anchoCaja * ALTO_GLYPH) / altoCaja));

/** Glyph recortado y escalado a la zona segura. */
const contenido = await sharp(glyph, { raw: { width: ancho, height: alto, channels: 4 } })
  .extract({ left: minX, top: minY, width: anchoCaja, height: altoCaja })
  .resize(anchoDestino, ALTO_GLYPH)
  .png()
  .toBuffer();

/** Lienzo 512 transparente con el glyph centrado, escalado después a 192. */
const lienzo512 = await sharp({
  create: { width: 512, height: 512, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
})
  .composite([{ input: contenido, gravity: "center" }])
  .png()
  .toBuffer();

await sharp(lienzo512).png().toFile(path.join(destinoDir, "maskable-icon-512x512.png"));
await sharp(lienzo512).resize(192, 192).png().toFile(path.join(destinoDir, "maskable-icon-192x192.png"));
console.log("Generado maskable-icon-512x512.png");
console.log("Generado maskable-icon-192x192.png");
