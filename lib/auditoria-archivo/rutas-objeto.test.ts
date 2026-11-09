import { describe, expect, it } from "vitest"

import { construirRutaArchivo, esRutaArchivoValida, hashCorto, validarRutaArchivo } from "./rutas-objeto"

const hash = "a".repeat(64)

describe("construirRutaArchivo", () => {
  it("arma la ruta versionada por año y mes del primer evento", () => {
    expect(construirRutaArchivo({
      primerId: 1201,
      ultimoId: 1500,
      primeraFecha: "2025-11-30T23:59:59.000Z",
      hash,
    })).toBe("audit/v1/2025/11/audit-1201-1500-aaaaaaaaaaaaaaaa.jsonl.gz")
  })

  it("es determinística: el mismo contenido y rango producen la misma ruta", () => {
    const entrada = { primerId: 7, ultimoId: 9, primeraFecha: "2026-01-05T10:00:00.000Z", hash }
    expect(construirRutaArchivo(entrada)).toBe(construirRutaArchivo({ ...entrada }))
  })

  it("rechaza rangos invertidos, identificadores inválidos y hashes que no son SHA-256", () => {
    expect(() => construirRutaArchivo({ primerId: 9, ultimoId: 7, primeraFecha: "2026-01-05T10:00:00.000Z", hash })).toThrow()
    expect(() => construirRutaArchivo({ primerId: 0, ultimoId: 7, primeraFecha: "2026-01-05T10:00:00.000Z", hash })).toThrow()
    expect(() => construirRutaArchivo({ primerId: 1, ultimoId: 7, primeraFecha: "2026-01-05T10:00:00.000Z", hash: "abc" })).toThrow()
    expect(() => construirRutaArchivo({ primerId: 1, ultimoId: 7, primeraFecha: "no-es-fecha", hash })).toThrow()
  })
})

describe("validarRutaArchivo", () => {
  it("acepta solo la forma exacta del archivo del archivo de auditoría", () => {
    expect(validarRutaArchivo("audit/v1/2025/11/audit-1201-1500-aaaaaaaaaaaaaaaa.jsonl.gz"))
      .toBe("audit/v1/2025/11/audit-1201-1500-aaaaaaaaaaaaaaaa.jsonl.gz")
    expect(esRutaArchivoValida("audit/v1/2026/01/audit-1-2-bbbbbbbbbbbbbbbb.jsonl.gz")).toBe(true)
  })

  it("rechaza traversal, barras absolutas, otro bucket y extensiones ajenas", () => {
    for (const ruta of [
      "../audit/v1/2025/11/audit-1-2-aaaaaaaaaaaaaaaa.jsonl.gz",
      "/audit/v1/2025/11/audit-1-2-aaaaaaaaaaaaaaaa.jsonl.gz",
      "audit/v1/2025/11/../../secret/audit-1-2-aaaaaaaaaaaaaaaa.jsonl.gz",
      "audit/v1/2025/11/audit-1-2-aaaaaaaaaaaaaaaa.jsonl",
      "audit/v1/2025/11/audit-1-2-AAAAAAAAAAAAAAAA.jsonl.gz",
      "otro/v1/2025/11/audit-1-2-aaaaaaaaaaaaaaaa.jsonl.gz",
      "audit/v1/2025/11/audit-1-2-aaaaaaaaaaaaaaaa.jsonl.gz?x=1",
      "audit/v1/2025/11/audit-1-2-aaaaaaaaaaaaaaaa.jsonl.gz\n",
      "",
    ]) {
      expect(esRutaArchivoValida(ruta)).toBe(false)
      expect(() => validarRutaArchivo(ruta)).toThrow(/ruta/i)
    }
  })
})

describe("hashCorto", () => {
  it("usa los primeros 16 caracteres hexadecimales del hash", () => {
    expect(hashCorto("0123456789abcdef".padEnd(64, "f"))).toBe("0123456789abcdef")
    expect(() => hashCorto("xyz")).toThrow()
  })
})
