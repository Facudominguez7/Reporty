/**
 * Genera `public/.well-known/assetlinks.json` con huellas SHA-256 REALES.
 *
 * Nunca inventa huellas: las lee de un keystore con `keytool` o acepta huellas
 * pasadas por argumento (por ejemplo, copiadas de Google Play Console).
 *
 * Uso:
 *   # Desde un keystore local (upload key):
 *   node scripts/android-twa/generar-assetlinks.mjs \
 *     --keystore ruta/al/keystore.jks --alias reporty [--keystore-pass ENV:NOMBRE_VAR]
 *
 *   # Desde huellas conocidas (una o varias, hex con dos puntos):
 *   node scripts/android-twa/generar-assetlinks.mjs \
 *     --huella AA:BB:... --huella CC:DD:...
 *
 *   # Para la app publicada en Play hacen falta DOS huellas: la de la clave de firma
 *   # de Google (Play Console → Integridad de la app) y la de la upload key.
 *
 * Opcional: --salida ruta/archivo.json para escribir en otro lugar (lo usan las pruebas).
 *
 * El archivo se escribe solo si hay al menos una huella válida. Con el paquete
 * por defecto `com.reporty.app` (definitivo tras la primera publicación,
 * ver docs/android-twa.md).
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raizRepo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** Paquete Android de Reporty (definitivo: no se puede cambiar tras la primera subida a Play). */
const PAQUETE = "com.reporty.app";

/** Dominio verificado que sirve el archivo. */
const DOMINIO = "reporty.com.ar";

/**
 * Lee argumentos de línea de comandos en pares --clave valor / --bandera.
 *
 * Una clave repetida (por ejemplo, varias --huella) acumula sus valores en un arreglo
 * en vez de pisar el anterior.
 *
 * @param {string[]} argv Argumentos de proceso.
 * @returns {Map<string, string | boolean | Array<string | boolean>>} Mapa clave → valor.
 */
function parsearArgs(argv) {
  const args = new Map();
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      const clave = argv[i].slice(2);
      const valor = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
      if (!args.has(clave)) args.set(clave, valor);
      else args.set(clave, [].concat(args.get(clave), valor));
    }
  }
  return args;
}

/**
 * Extrae las huellas SHA-256 de un keystore con keytool (sin imprimir la clave).
 *
 * @param {string} keystore Ruta al archivo .jks/.keystore.
 * @param {string} alias Alias del certificado.
 * @returns {string[]} Huellas SHA-256 en formato hexadecimal con dos puntos.
 */
function huellasDesdeKeystore(keystore, alias) {
  const jdk17 = path.join(process.env.HOME ?? "", "tools/jdk17/bin");
  const keytool = fs.existsSync(path.join(jdk17, "keytool"))
    ? path.join(jdk17, "keytool")
    : "keytool";
  const salida = execFileSync(
    keytool,
    ["-list", "-v", "-keystore", keystore, "-alias", alias],
    { encoding: "utf8", env: { ...process.env } },
  );
  return [...salida.matchAll(/SHA256:\s*([0-9A-F:]{95})/g)].map((m) => m[1]);
}

/**
 * Valida el formato de una huella hex (32 bytes, con o sin dos puntos).
 *
 * @param {string} huella Huella a validar.
 * @returns {boolean} true si tiene formato válido.
 */
function esHuellaValida(huella) {
  return /^[0-9a-fA-F:]{94,95}$/.test(huella) && huella.replace(/:/g, "").length === 64;
}

const args = parsearArgs(process.argv.slice(2));
const huellas = new Set();

if (typeof args.get("keystore") === "string") {
  const alias = typeof args.get("alias") === "string" ? args.get("alias") : "reporty";
  const encontradas = huellasDesdeKeystore(args.get("keystore"), alias);
  if (encontradas.length === 0) {
    console.error("No se encontró huella SHA-256 en el keystore indicado.");
    process.exit(1);
  }
  encontradas.forEach((h) => huellas.add(h));
}

if (args.get("huella")) {
  const lista = Array.isArray(args.get("huella")) ? args.get("huella") : [args.get("huella")];
  for (const h of lista) {
    if (!esHuellaValida(h)) {
      console.error(`Huella con formato inválido: ${h}`);
      process.exit(1);
    }
    huellas.add(h.toUpperCase());
  }
}

if (huellas.size === 0) {
  console.error(
    "Sin huellas no se genera assetlinks.json. Usá --keystore/--alias o --huella. " +
      "Nunca se publican valores ficticios.",
  );
  process.exit(1);
}

// Una sola declaración con todas las huellas: Android acepta el certificado si coincide con cualquiera.
const assetlinks = [
  {
    relation: ["delegate_permission/common.handle_all_urls"],
    target: {
      namespace: "android_app",
      package_name: PAQUETE,
      sha256_cert_fingerprints: [...huellas],
    },
  },
];

const destino =
  typeof args.get("salida") === "string"
    ? path.resolve(args.get("salida"))
    : path.join(raizRepo, "public/.well-known/assetlinks.json");
fs.mkdirSync(path.dirname(destino), { recursive: true });
fs.writeFileSync(destino, JSON.stringify(assetlinks, null, 2) + "\n");
console.log(`Escrito ${destino} con ${huellas.size} huella(s) para ${PAQUETE}.`);
console.log(`Verificá luego: https://${DOMINIO}/.well-known/assetlinks.json`);
