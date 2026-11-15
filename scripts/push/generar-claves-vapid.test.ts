import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { buildPushPayload } from "@block65/webcrypto-web-push"

import { generarClavesVapid, guardarClavesVapid } from "./generar-claves-vapid.mjs"

const directorios: string[] = []
afterEach(() => directorios.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })))

/**
 * Crea una suscripción de navegador real para probar que las claves firman un envío.
 *
 * @returns Endpoint y claves del dispositivo en base64url.
 */
async function suscripcionDePrueba() {
  const par = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])
  const p256dh = Buffer.from(await crypto.subtle.exportKey("raw", par.publicKey)).toString("base64url")
  const auth = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64url")
  return { endpoint: "https://fcm.googleapis.com/prueba", expirationTime: null, keys: { p256dh, auth } }
}

describe("generar claves VAPID", () => {
  it("genera una pública de 65 bytes y una privada de 32 en base64url que la librería acepta", async () => {
    const claves = await generarClavesVapid()

    expect(Buffer.from(claves.publicKey, "base64url")).toHaveLength(65)
    expect(Buffer.from(claves.privateKey, "base64url")).toHaveLength(32)
    expect(claves.publicKey).toMatch(/^[A-Za-z0-9_-]+$/)
    const pedido = await buildPushPayload({ data: "hola" }, await suscripcionDePrueba(), { ...claves, subject: "mailto:contacto@reporty.com.ar" })
    expect(pedido.headers.authorization).toMatch(new RegExp(`^vapid t=.+, k=${claves.publicKey}$`))
  })

  it("guarda la privada en un archivo solo legible por su dueño y devuelve la pública", async () => {
    const dir = mkdtempSync(join(tmpdir(), "vapid-"))
    directorios.push(dir)
    const claves = await generarClavesVapid()

    const destino = guardarClavesVapid(claves, dir)

    expect(readFileSync(join(dir, "VAPID_PRIVATE_KEY"), "utf8")).toBe(claves.privateKey)
    expect(readFileSync(join(dir, "VAPID_PUBLIC_KEY"), "utf8")).toBe(claves.publicKey)
    expect(statSync(join(dir, "VAPID_PRIVATE_KEY")).mode & 0o777).toBe(0o600)
    expect(destino).toBe(dir)
  })

  it("no pisa claves existentes", async () => {
    const dir = mkdtempSync(join(tmpdir(), "vapid-"))
    directorios.push(dir)
    const primeras = await generarClavesVapid()
    const segundas = await generarClavesVapid()
    guardarClavesVapid(primeras, dir)

    expect(() => guardarClavesVapid(segundas, dir)).toThrow(/ya existe/)
    expect(readFileSync(join(dir, "VAPID_PRIVATE_KEY"), "utf8")).toBe(primeras.privateKey)
  })
})
