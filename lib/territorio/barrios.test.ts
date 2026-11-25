import { describe, expect, it } from "vitest"

import { ATRIBUCION_BARRIOS, leerMetadatosFuente, validarBarriosWfs } from "./barrios"

/** Registro CSW con la forma que devuelve el catálogo de la IDE. */
const registroCsw = `<?xml version="1.0"?>
<csw:GetRecordByIdResponse xmlns:csw="http://www.opengis.net/cat/csw/2.0.2" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dct="http://purl.org/dc/terms/">
  <csw:Record>
    <dc:title>Barrios Posadas SMU (USO ACTUAL)</dc:title>
    <dct:modified>2026-06-17T15:24:00Z</dct:modified>
    <dc:date>2026-06-17T15:24:00Z</dc:date>
  </csw:Record>
</csw:GetRecordByIdResponse>`

/** Respuesta del WFS con `cantidad` barrios en EPSG:5348. */
function respuestaWfs(cantidad: number, extra: Record<string, unknown> = {}) {
  const features = Array.from({ length: cantidad }, (_, i) => ({
    type: "Feature",
    properties: { id: String(i + 1), _Barrio: `Barrio ${i + 1}` },
    geometry: { type: "MultiPolygon", coordinates: [] },
  }))
  return {
    type: "FeatureCollection",
    crs: { type: "name", properties: { name: "urn:ogc:def:crs:EPSG::5348" } },
    numberMatched: cantidad,
    numberReturned: cantidad,
    features,
    ...extra,
  }
}

describe("ATRIBUCION_BARRIOS", () => {
  it("es el texto exacto que pide la licencia", () => {
    expect(ATRIBUCION_BARRIOS).toBe("Secretaría de Movilidad Urbana, Dirección SIG-IDE, Municipalidad de Posadas (ODbL)")
  })
})

describe("leerMetadatosFuente", () => {
  it("lee el título y la fecha de modificación que declara el catálogo", () => {
    expect(leerMetadatosFuente(registroCsw)).toEqual({
      version: "Barrios Posadas SMU (USO ACTUAL)",
      fecha: "2026-06-17T15:24:00.000Z",
    })
  })

  it("falla si el catálogo no declara una fecha válida", () => {
    expect(() => leerMetadatosFuente(registroCsw.replaceAll("2026-06-17T15:24:00Z", "sin fecha"))).toThrow(/fecha/)
  })
})

describe("validarBarriosWfs", () => {
  it("devuelve los barrios si llegaron todos, en EPSG:5348", () => {
    expect(validarBarriosWfs(respuestaWfs(3))).toHaveLength(3)
  })

  it("falla si el WFS cortó la respuesta (llegaron menos de los que hay)", () => {
    expect(() => validarBarriosWfs(respuestaWfs(3, { numberMatched: 263 }))).toThrow(/3 de 263/)
  })

  it("falla si las coordenadas no vienen en EPSG:5348", () => {
    expect(() =>
      validarBarriosWfs(respuestaWfs(3, { crs: { type: "name", properties: { name: "urn:ogc:def:crs:EPSG::4326" } } })),
    ).toThrow(/5348/)
  })

  it("falla si no llegó ningún barrio", () => {
    expect(() => validarBarriosWfs(respuestaWfs(0))).toThrow(/ningún barrio/)
  })
})
