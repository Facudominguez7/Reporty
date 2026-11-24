import { beforeEach, describe, expect, it, vi } from "vitest"

import { cargarZonaMapa } from "./mapa-por-zona"

const mocks = vi.hoisted(() => ({ getReportMapData: vi.fn(), getGruposEnZona: vi.fn() }))
vi.mock("@/database/queries/reportes/get-reportes", () => ({
  getReportMapData: mocks.getReportMapData,
  getGruposEnZona: mocks.getGruposEnZona,
}))

const zona = { oeste: -55.95, sur: -27.4, este: -55.85, norte: -27.35 }

beforeEach(() => {
  mocks.getReportMapData.mockReset().mockResolvedValue({ data: [{ id: 7 }], error: null, hasMore: false })
  mocks.getGruposEnZona.mockReset().mockResolvedValue({ data: [{ cantidad: 400 }], error: null })
})

describe("cargarZonaMapa", () => {
  it("hasta 300 reportes responde puntos con una sola consulta pública", async () => {
    const resultado = await cargarZonaMapa({ zona, zoom: 16, filtros: { categoria: "Bache" } })

    expect(mocks.getReportMapData).toHaveBeenCalledWith(
      { search: undefined, categoria: "Bache", prioridad: undefined, zona, estadosPermitidos: [1, 4, 2], limite: 300 },
      { publico: true },
    )
    expect(mocks.getGruposEnZona).not.toHaveBeenCalled()
    expect(resultado).toEqual({ data: { tipo: "puntos", reportes: [{ id: 7 }] }, error: null })
  })

  it("con más de 300 responde grupos con los mismos filtros y la celda del zoom", async () => {
    mocks.getReportMapData.mockResolvedValue({ data: [], error: null, hasMore: true })

    const resultado = await cargarZonaMapa({ zona, zoom: 13, filtros: { search: "luz", estado: "Reparado", prioridad: "Alta" } })

    expect(mocks.getGruposEnZona).toHaveBeenCalledWith({
      search: "luz",
      categoria: undefined,
      prioridad: "Alta",
      zona,
      celda: 360 / 2 ** 13 / 2,
      estados: [2],
    })
    expect(resultado).toEqual({ data: { tipo: "grupos", grupos: [{ cantidad: 400 }] }, error: null })
  })

  it("en el zoom máximo no agrupa: devuelve los puntos, así siempre se llega a cada reporte", async () => {
    mocks.getReportMapData.mockResolvedValue({ data: [{ id: 7 }], error: null, hasMore: true })

    const resultado = await cargarZonaMapa({ zona, zoom: 18, filtros: {} })

    expect(mocks.getReportMapData).toHaveBeenCalledWith(expect.objectContaining({ limite: 1000 }), { publico: true })
    expect(mocks.getGruposEnZona).not.toHaveBeenCalled()
    expect(resultado).toEqual({ data: { tipo: "puntos", reportes: [{ id: 7 }] }, error: null })
  })

  it("pedir Rechazado no consulta nada y no devuelve reportes", async () => {
    const resultado = await cargarZonaMapa({ zona, zoom: 16, filtros: { estado: "Rechazado" } })

    expect(mocks.getReportMapData).not.toHaveBeenCalled()
    expect(resultado).toEqual({ data: { tipo: "puntos", reportes: [] }, error: null })
  })

  it("propaga el error de la consulta de puntos o de grupos", async () => {
    const fallo = new Error("fallo")
    mocks.getReportMapData.mockResolvedValueOnce({ data: [], error: fallo, hasMore: false })
    expect((await cargarZonaMapa({ zona, zoom: 16, filtros: {} })).error).toBe(fallo)

    mocks.getReportMapData.mockResolvedValueOnce({ data: [], error: null, hasMore: true })
    mocks.getGruposEnZona.mockResolvedValueOnce({ data: [], error: fallo })
    expect((await cargarZonaMapa({ zona, zoom: 16, filtros: {} })).error).toBe(fallo)
  })
})
