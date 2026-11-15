#!/usr/bin/env node
/**
 * Genera el par de claves VAPID de las notificaciones push.
 *
 * La clave privada se guarda en un archivo con permisos 600 y nunca se imprime, para que no
 * quede en la terminal ni en logs. Uso:
 *
 *   node scripts/push/generar-claves-vapid.mjs <directorio-fuera-del-repo>
 *
 * Después se cargan en Cloudflare desde esos archivos (ver `docs/notificaciones-push.md`).
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * Crea un par ECDSA P-256 en el formato que espera `@block65/webcrypto-web-push`.
 *
 * @returns `publicKey`: punto sin comprimir (65 bytes) y `privateKey`: escalar `d` (32 bytes),
 *   ambos en base64url.
 */
export async function generarClavesVapid() {
  const par = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])
  const publica = new Uint8Array(await crypto.subtle.exportKey("raw", par.publicKey))
  const jwk = await crypto.subtle.exportKey("jwk", par.privateKey)
  return { publicKey: Buffer.from(publica).toString("base64url"), privateKey: jwk.d }
}

/**
 * Guarda cada clave en su propio archivo (`VAPID_PUBLIC_KEY` y `VAPID_PRIVATE_KEY`), solo
 * legibles por el dueño. Nunca pisa claves existentes: rotarlas invalida todas las suscripciones.
 *
 * @param claves - Par generado por `generarClavesVapid`.
 * @param directorio - Carpeta de destino; se crea si no existe.
 * @returns La carpeta donde quedaron los archivos.
 */
export function guardarClavesVapid(claves, directorio) {
  mkdirSync(directorio, { recursive: true, mode: 0o700 })
  for (const nombre of ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY"]) {
    if (existsSync(join(directorio, nombre))) {
      throw new Error(`${join(directorio, nombre)} ya existe; no se pisan claves VAPID.`)
    }
  }
  writeFileSync(join(directorio, "VAPID_PUBLIC_KEY"), claves.publicKey, { mode: 0o600 })
  writeFileSync(join(directorio, "VAPID_PRIVATE_KEY"), claves.privateKey, { mode: 0o600, flag: "wx" })
  return directorio
}

/** Punto de entrada por línea de comandos. */
async function principal() {
  const destino = process.argv[2]
  if (!destino) {
    console.error("Uso: node scripts/push/generar-claves-vapid.mjs <directorio-fuera-del-repo>")
    process.exit(1)
  }
  const directorio = guardarClavesVapid(await generarClavesVapid(), resolve(destino))
  console.log(`Claves VAPID guardadas en ${directorio} (la privada no se muestra).`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await principal()
}
