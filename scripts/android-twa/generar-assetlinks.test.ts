import { execFileSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

const SCRIPT = path.resolve(__dirname, "generar-assetlinks.mjs")
const HUELLA_GOOGLE = "BB:74:CA:DE:D5:89:32:C8:AA:EC:35:70:D9:18:1A:4C:FA:38:54:33:D5:04:46:94:79:6C:25:23:D7:12:42:32"
const HUELLA_SUBIDA = "B0:87:2A:EC:25:DB:75:EF:1F:75:C1:B2:E5:F2:A1:BF:F3:7F:FD:42:A5:47:5B:6F:2E:EE:EB:B5:F9:83:4A:BF"

let directorio: string
let salida: string

/**
 * Ejecuta el generador con los argumentos dados, escribiendo en un archivo temporal.
 *
 * @param args - Argumentos adicionales del script.
 * @returns El contenido JSON escrito.
 */
function generar(...args: string[]) {
  execFileSync("node", [SCRIPT, "--salida", salida, ...args], { encoding: "utf8" })
  return JSON.parse(fs.readFileSync(salida, "utf8"))
}

describe("generar-assetlinks", () => {
  beforeEach(() => {
    directorio = fs.mkdtempSync(path.join(os.tmpdir(), "assetlinks-"))
    salida = path.join(directorio, "assetlinks.json")
  })

  afterEach(() => fs.rmSync(directorio, { recursive: true, force: true }))

  it("conserva todas las huellas pasadas con --huella repetido, en una sola declaración", () => {
    expect(generar("--huella", HUELLA_GOOGLE, "--huella", HUELLA_SUBIDA)).toEqual([
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: "com.reporty.app",
          sha256_cert_fingerprints: [HUELLA_GOOGLE, HUELLA_SUBIDA],
        },
      },
    ])
  })

  it("con una sola huella sigue generando el archivo", () => {
    expect(generar("--huella", HUELLA_GOOGLE)[0].target.sha256_cert_fingerprints).toEqual([HUELLA_GOOGLE])
  })

  it("normaliza las huellas a mayúsculas y no repite una huella duplicada", () => {
    expect(
      generar("--huella", HUELLA_GOOGLE.toLowerCase(), "--huella", HUELLA_GOOGLE)[0].target.sha256_cert_fingerprints,
    ).toEqual([HUELLA_GOOGLE])
  })

  it("rechaza una huella con formato inválido y no escribe nada", () => {
    expect(() => generar("--huella", "AA:BB")).toThrow()
    expect(fs.existsSync(salida)).toBe(false)
  })
})
