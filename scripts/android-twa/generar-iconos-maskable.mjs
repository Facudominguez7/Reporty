/**
 * Genera los iconos maskable (192 y 512) a partir del favicon PNG existente.
 *
 * Des-mezcla el favicon (composición sobre negro) para obtener el glyph (pin + «R») y lo
 * dibuja en blanco sobre un fondo sólido verde de marca, de borde a borde. El fondo tiene
 * que ser opaco: el ícono adaptativo que arma Bubblewrap pone blanco detrás, así que un
 * maskable transparente dejaba el pin blanco invisible en el escritorio de Android.
 * El mismo PNG se usa como ícono del splash de la TWA, sobre el mismo verde, así que el
 * logo aparece sin recuadro. El glyph queda centrado dentro de la zona segura maskable
 * (círculo central del 80 % del lienzo).
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

/** Verde de marca del splash y del theme color de la TWA (#2e7d5b). */
const FONDO = { r: 0x2e, g: 0x7d, b: 0x5b, alpha: 1 };

/** Lee el favicon como RGBA crudo a resolución nativa (512x512). */
const { data, info } = await sharp(origen).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: ancho, height: alto, channels } = info;

/** Glyph des-mezclado en blanco: mismo tamaño que el origen, canal alfa = canal máximo. */
const glyph = Buffer.alloc(ancho * alto * 4);
for (let p = 0; p < ancho * alto; p++) {
  const i = p * channels;
  const o = p * 4;
  glyph[o] = glyph[o + 1] = glyph[o + 2] = 255;
  glyph[o + 3] = Math.max(data[i], data[i + 1], data[i + 2]);
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

/** Lienzo 512 verde opaco con el glyph centrado, escalado después a 192. */
const lienzo512 = await sharp({
  create: { width: 512, height: 512, channels: 4, background: FONDO },
})
  .composite([{ input: contenido, gravity: "center" }])
  .png()
  .toBuffer();

await sharp(lienzo512).png().toFile(path.join(destinoDir, "maskable-icon-512x512.png"));
await sharp(lienzo512).resize(192, 192).png().toFile(path.join(destinoDir, "maskable-icon-192x192.png"));
console.log("Generado maskable-icon-512x512.png");
console.log("Generado maskable-icon-192x192.png");
