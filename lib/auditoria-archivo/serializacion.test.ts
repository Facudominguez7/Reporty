import { describe, expect, it } from "vitest"

import {
  ErrorFormatoArchivado,
  LIMITE_LINEAS_JSONL,
  calcularHashSha256,
  comprimirGzip,
  descomprimirGzip,
  leerEventosJsonl,
  serializarJsonl,
  verificarHash,
} from "./serializacion"

const eventos = [
  {
    id: 41,
    occurred_at: "2025-11-01T10:00:00.123456+00:00",
    actor_id: "00000000-0000-4000-8000-0000000000a1",
    report_id: 9001,
    report_title: "Bache en Ruta 8",
    action: "report_created",
  },
  {
    id: 42,
    occurred_at: "2025-11-01T10:05:00+00:00",
    actor_id: null,
    report_id: null,
    report_title: null,
    action: "vote_not_exists",
  },
]

describe("serializarJsonl", () => {
  it("escribe una línea JSON por evento con la versión del formato y termina en salto de línea", () => {
    const texto = serializarJsonl(eventos)
    const lineas = texto.split("\n")

    expect(texto.endsWith("\n")).toBe(true)
    expect(lineas).toHaveLength(3)
    expect(JSON.parse(lineas[0])).toEqual({
      version: 1,
      id: 41,
      occurred_at: "2025-11-01T10:00:00.123456+00:00",
      actor_id: "00000000-0000-4000-8000-0000000000a1",
      report_id: 9001,
      report_title: "Bache en Ruta 8",
      action: "report_created",
    })
    expect(Object.keys(JSON.parse(lineas[0]))).toEqual([
      "version", "id", "occurred_at", "actor_id", "report_id", "report_title", "action",
    ])
  })

  it("es determinística y conserva el orden recibido", () => {
    expect(serializarJsonl(eventos)).toBe(serializarJsonl(eventos))
    expect(serializarJsonl(eventos).indexOf('"id":41')).toBeLessThan(serializarJsonl(eventos).indexOf('"id":42'))
  })

  it("rechaza un lote vacío o con identificadores repetidos", () => {
    expect(() => serializarJsonl([])).toThrow(ErrorFormatoArchivado)
    expect(() => serializarJsonl([eventos[0], { ...eventos[0] }])).toThrow(/repetido/i)
  })
})

describe("leerEventosJsonl", () => {
  it("reconstruye los eventos serializados con la versión del formato", () => {
    expect(leerEventosJsonl(serializarJsonl(eventos))).toEqual([
      { ...eventos[0], version: 1 },
      { ...eventos[1], version: 1 },
    ])
  })

  it("rechaza líneas incompletas, versiones desconocidas y acciones vacías", () => {
    expect(() => leerEventosJsonl("")).toThrow(ErrorFormatoArchivado)
    expect(() => leerEventosJsonl('{"version":1,"id":1}\n')).toThrow(ErrorFormatoArchivado)
    expect(() => leerEventosJsonl(serializarJsonl(eventos).replace('"version":1', '"version":2'))).toThrow(/versión/i)
    expect(() => leerEventosJsonl(serializarJsonl(eventos).replace('"action":"report_created"', '"action":""'))).toThrow(ErrorFormatoArchivado)
    expect(() => leerEventosJsonl("no es json\n")).toThrow(ErrorFormatoArchivado)
  })

  it("acota la cantidad de líneas para no aceptar archivos arbitrarios", () => {
    const muchas = Array.from({ length: LIMITE_LINEAS_JSONL + 1 }, (_, indice) => ({
      ...eventos[0],
      id: indice + 1,
    }))
    expect(() => leerEventosJsonl(serializarJsonl(muchas))).toThrow(/límite/i)
  })
})

describe("compresión e integridad", () => {
  it("comprime con GZIP de forma determinística y descomprime el mismo contenido", async () => {
    const texto = Buffer.from(serializarJsonl(eventos), "utf8")
    const comprimido = await comprimirGzip(texto)
    const otraVez = await comprimirGzip(texto)

    expect(comprimido.subarray(0, 2)).toEqual(Buffer.from([0x1f, 0x8b]))
    expect(comprimido.equals(otraVez)).toBe(true)
    expect((await descomprimirGzip(comprimido)).toString("utf8")).toBe(texto.toString("utf8"))
  })

  it("calcula SHA-256 estable y verifica sin aceptar otra huella", () => {
    const contenido = Buffer.from("hola")

    expect(calcularHashSha256(contenido)).toBe("b221d9dbb083a7f33428d7c2a3c3198ae925614d70210e28716ccaa7cd4ddb79")
    expect(verificarHash(contenido, calcularHashSha256(contenido))).toBe(true)
    expect(verificarHash(contenido, "0".repeat(64))).toBe(false)
    expect(verificarHash(contenido, "no-es-un-hash")).toBe(false)
  })

  it("rechaza un GZIP corrupto y una descompresión fuera del límite", async () => {
    await expect(descomprimirGzip(Buffer.from("no es gzip"))).rejects.toThrow(ErrorFormatoArchivado)

    const grande = Buffer.alloc(2 * 1024 * 1024, 0x61)
    const comprimido = await comprimirGzip(grande)
    await expect(descomprimirGzip(comprimido, 1024)).rejects.toThrow(ErrorFormatoArchivado)
  })
})
