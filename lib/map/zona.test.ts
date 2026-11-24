import { describe, expect, it } from "vitest"

import {
  ESTADOS_MAPA,
  ajustarZonaAlMapa,
  leerZona,
  resolverEstadosMapa,
  tamanoCeldaGrupos,
  zonaATexto,
} from "./zona"

describe("leerZona", () => {
  it("lee oeste,sur,este,norte", () => {
    expect(leerZona("-55.95,-27.40,-55.85,-27.35")).toEqual({ oeste: -55.95, sur: -27.4, este: -55.85, norte: -27.35 })
  })

  it.each([
    ["vacía", ""],
    ["con tres valores", "-55.95,-27.40,-55.85"],
    ["con texto", "a,b,c,d"],
    ["invertida en longitud", "-55.85,-27.40,-55.95,-27.35"],
    ["invertida en latitud", "-55.95,-27.35,-55.85,-27.40"],
    ["fuera del planeta", "-200,-27.40,-55.85,-27.35"],
  ])("rechaza una zona %s", (_caso, texto) => {
    expect(leerZona(texto)).toBeNull()
  })
})

describe("ajustarZonaAlMapa", () => {
  it("recorta la zona a Posadas", () => {
    const zona = ajustarZonaAlMapa({ oeste: -57, sur: -28, este: -55, norte: -27 }, 13)
    expect(zona).toEqual({ oeste: -56.06, sur: -27.59, este: -55.6, norte: -27.32 })
  })

  it("devuelve null si la zona queda fuera de Posadas", () => {
    expect(ajustarZonaAlMapa({ oeste: -58, sur: -30, este: -57.5, norte: -29.5 }, 13)).toBeNull()
  })

  it("agranda los bordes hasta la grilla de teselas, así dos vistas casi iguales piden la misma zona", () => {
    const a = ajustarZonaAlMapa({ oeste: -55.9001, sur: -27.3801, este: -55.8901, norte: -27.3701 }, 16)
    const b = ajustarZonaAlMapa({ oeste: -55.9003, sur: -27.3803, este: -55.8903, norte: -27.3703 }, 16)
    expect(a).toEqual(b)
    expect(a!.oeste).toBeLessThanOrEqual(-55.9003)
    expect(a!.este).toBeGreaterThanOrEqual(-55.8901)
    expect(a!.sur).toBeLessThanOrEqual(-27.3803)
    expect(a!.norte).toBeGreaterThanOrEqual(-27.3701)
  })

  it("es idempotente: ajustar una zona ya ajustada la deja igual (el navegador y el servidor ajustan los dos)", () => {
    for (let zoom = 13; zoom <= 18; zoom++) {
      for (const [oeste, sur] of [[-55.9, -27.38], [-55.95, -27.4123], [-55.8701, -27.3555]]) {
        const una = ajustarZonaAlMapa({ oeste, sur, este: oeste + 0.01, norte: sur + 0.01 }, zoom)!
        expect(ajustarZonaAlMapa(una, zoom)).toEqual(una)
      }
    }
  })
})

describe("tamanoCeldaGrupos", () => {
  it("usa media tesela: 360 / 2^zoom / 2", () => {
    expect(tamanoCeldaGrupos(13)).toBeCloseTo(360 / 8192 / 2)
    expect(tamanoCeldaGrupos(16)).toBeCloseTo(360 / 65536 / 2)
  })
})

describe("resolverEstadosMapa", () => {
  it("sin filtro muestra pendientes, tomados por Defensoría y reparados", () => {
    expect(resolverEstadosMapa(undefined)).toEqual([...ESTADOS_MAPA])
    expect(resolverEstadosMapa("all")).toEqual([...ESTADOS_MAPA])
  })

  it("un estado del mapa achica la lista", () => {
    expect(resolverEstadosMapa("Pendiente")).toEqual([1])
    expect(resolverEstadosMapa("reparado")).toEqual([2])
    expect(resolverEstadosMapa("seguimiento")).toEqual([4])
  })

  it("Rechazado nunca entra, aunque se pida", () => {
    expect(resolverEstadosMapa("Rechazado")).toEqual([])
  })

  it("un estado desconocido no filtra, como en el listado", () => {
    expect(resolverEstadosMapa("cualquiera")).toEqual([...ESTADOS_MAPA])
  })
})

describe("zonaATexto", () => {
  it("es el formato que lee leerZona", () => {
    const zona = { oeste: -55.95, sur: -27.4, este: -55.85, norte: -27.35 }
    expect(leerZona(zonaATexto(zona))).toEqual(zona)
  })
})
