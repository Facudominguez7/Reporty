import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { getGruposEnZona, getReportCardData, getReportMapData } from "./get-reportes"

const mocks = vi.hoisted(() => {
  const calls: unknown[][] = []
  const rows: unknown[] = []
  const tablasConsultadas: string[] = []
  // Records every query builder call and resolves like a Supabase query when awaited.
  const builder: object = new Proxy(
    {},
    {
      get(_target, method) {
        if (method === "then") {
          return (resolve: (value: unknown) => void) => resolve({ data: rows, error: null })
        }
        return (...args: unknown[]) => {
          calls.push([method, ...args])
          return builder
        }
      },
    },
  )
  return { calls, rows, tablasConsultadas, builder, obtenerEstadoOperativo: vi.fn(), getPublicProfiles: vi.fn() }
})

vi.mock("next/cache", () => ({ unstable_cache: (load: unknown) => load }))
/** Cliente falso: registra la tabla o la RPC consultada y devuelve el builder que graba llamadas. */
function clienteFalso(origen: string) {
  return {
    from: (tabla: string) => { mocks.tablasConsultadas.push(`${origen}:${tabla}`); return mocks.builder },
    rpc: (funcion: string, ...args: unknown[]) => {
      mocks.tablasConsultadas.push(`${origen}:rpc:${funcion}`)
      mocks.calls.push(["rpc", funcion, ...args])
      return mocks.builder
    },
  }
}
vi.mock("@/utils/supabase/server", () => ({ createClient: async () => clienteFalso("sesion") }))
vi.mock("@/utils/supabase/public", () => ({ createPublicClient: () => clienteFalso("publico") }))
vi.mock("@/database/queries/profiles", () => ({
  getPublicProfilesByIds: mocks.getPublicProfiles,
  indexPublicProfilesById: (profiles: Array<{ id: string; username: string }> | null) => new Map((profiles ?? []).map((profile) => [profile.id, profile])),
}))
vi.mock("@/database/queries/cuadrillas", () => ({
  obtenerEstadoOperativoPublicoPorReporte: mocks.obtenerEstadoOperativo,
}))

const PENDIENTE_ID = 1

const pendingRow = {
  id: 7,
  usuario_id: null,
  titulo: "Bache",
  descripcion: null,
  created_at: "2026-10-01T00:00:00Z",
  lat: -27.4,
  lon: -55.9,
  categoria: null,
  prioridad: null,
  estado: { nombre: "Pendiente" },
  fotos: null,
}

describe("getReportMapData", () => {
  beforeEach(() => {
    mocks.calls.length = 0
    mocks.rows.length = 0
    mocks.tablasConsultadas.length = 0
    mocks.obtenerEstadoOperativo.mockReset().mockResolvedValue(new Map())
    mocks.getPublicProfiles.mockReset().mockResolvedValue({ data: [{ id: "user-1", username: "Author" }] })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("skips author profiles only when compact cards explicitly opt out", async () => {
    mocks.rows.push({ ...pendingRow, usuario_id: "user-1" })

    const result = await getReportCardData({}, { includeAuthors: false })

    expect(mocks.getPublicProfiles).not.toHaveBeenCalled()
    expect(result.data).toMatchObject([{ id: 7, title: "Bache" }])
  })

  it("trae el autor en la misma consulta, sin un segundo viaje a public_profiles", async () => {
    mocks.rows.push({ ...pendingRow, usuario_id: "user-1", autor: { username: "Author" } })

    const cards = await getReportCardData()
    const map = await getReportMapData()

    const selects = mocks.calls.filter(([metodo]) => metodo === "select").map(([, columnas]) => String(columnas))
    expect(selects).toHaveLength(2)
    for (const columnas of selects) expect(columnas).toContain("autor:public_profiles(username)")
    expect(mocks.getPublicProfiles).not.toHaveBeenCalled()
    expect(cards.data[0].author).toBe("Author")
    expect(map.data[0].author).toBe("Author")
  })

  it("muestra «Anónimo» si el reporte no tiene perfil público", async () => {
    mocks.rows.push({ ...pendingRow, usuario_id: "user-1", autor: null })

    const map = await getReportMapData()

    expect(map.data[0].author).toBe("Anónimo")
  })

  it("no pide el autor cuando las tarjetas lo descartan", async () => {
    await getReportCardData({}, { includeAuthors: false })

    const columnas = mocks.calls.find(([metodo]) => metodo === "select")?.[1]
    expect(String(columnas)).not.toContain("public_profiles")
  })

  it("keeps only pending reports in the query when asked to", async () => {
    mocks.rows.push(pendingRow)

    const { data, error } = await getReportMapData({ soloPendientes: true })

    expect(mocks.calls).toContainEqual(["eq", "estado_id", PENDIENTE_ID])
    expect(error).toBeNull()
    expect(data.map((report) => report.id)).toEqual([7])
  })

  it("aplica la lista de estados del mapa antes del límite y entrega los reparados", async () => {
    mocks.rows.push(pendingRow, { ...pendingRow, id: 8, estado: { nombre: "Reparado" } })

    const { data, error } = await getReportMapData({ estadosPermitidos: [1, 2] })

    const indiceEstados = mocks.calls.findIndex(([metodo, columna]) => metodo === "in" && columna === "estado_id")
    expect(mocks.calls[indiceEstados]).toEqual(["in", "estado_id", [1, 2]])
    expect(indiceEstados).toBeLessThan(mocks.calls.findIndex(([metodo]) => metodo === "range"))
    expect(error).toBeNull()
    expect(data).toMatchObject([{ id: 7, status: "Pendiente" }, { id: 8, status: "Reparado" }])
  })

  it("keeps every state when only pending reports are not requested", async () => {
    await getReportMapData({ categoria: "Bache" })

    expect(mocks.calls.some(([, column]) => column === "estado_id")).toBe(false)
  })

  it("filters Agua by category ID 8", async () => {
    await getReportMapData({ categoria: "Agua" })

    expect(mocks.calls).toContainEqual(["eq", "categoria_id", 8])
  })

  it("skips the crew status lookup while crews are turned off", async () => {
    vi.stubEnv("CUADRILLAS_ENABLED", undefined)
    mocks.rows.push(pendingRow)

    const { data } = await getReportMapData()

    expect(mocks.obtenerEstadoOperativo).not.toHaveBeenCalled()
    expect(data).toMatchObject([{ id: 7, estadoOperativo: null, cuadrillaNombre: null }])
  })

  it("attaches the crew status when crews are turned on", async () => {
    vi.stubEnv("CUADRILLAS_ENABLED", "true")
    mocks.rows.push(pendingRow)
    mocks.obtenerEstadoOperativo.mockResolvedValue(
      new Map([[7, { estadoOperativo: "en_progreso", cuadrillaNombre: "Cuadrilla Norte" }]]),
    )

    const { data } = await getReportMapData()

    expect(mocks.obtenerEstadoOperativo).toHaveBeenCalledWith(expect.anything(), [7])
    expect(data).toMatchObject([{ id: 7, estadoOperativo: "en_progreso", cuadrillaNombre: "Cuadrilla Norte" }])
  })

  it("nunca consulta reclamos de Defensoría ni adjunta el número en los datos del mapa", async () => {
    // Reporte ya tomado por la Defensoría (estado 4): el popup y el pin del mapa no
    // deben revelar el número, que solo ve el autor en su ficha (S9).
    mocks.rows.push({ ...pendingRow, id: 8, estado_id: 4, estado: { nombre: "Tomado por Defensoría" } })

    const { data } = await getReportMapData()

    expect(data).toContainEqual(expect.objectContaining({ id: 8, estadoId: 4 }))
    expect(mocks.tablasConsultadas).not.toContain("reclamos_defensoria")
    expect(mocks.tablasConsultadas).not.toContain("reclamos_defensoria_publico")
    for (const item of data) {
      expect(item).not.toHaveProperty("numeroReclamo")
    }
  })
})

describe("mapa por zona (#281)", () => {
  const zona = { oeste: -55.95, sur: -27.4, este: -55.85, norte: -27.35 }

  beforeEach(() => {
    mocks.calls.length = 0
    mocks.rows.length = 0
    mocks.tablasConsultadas.length = 0
    mocks.obtenerEstadoOperativo.mockReset().mockResolvedValue(new Map())
    mocks.getPublicProfiles.mockReset().mockResolvedValue({ data: [] })
  })

  it("con zona consulta reportes_en_zona y encadena el mismo select, filtros y límite", async () => {
    mocks.rows.push(pendingRow)

    const { data } = await getReportMapData({ zona, categoria: "Bache", estadosPermitidos: [1, 4, 2], limite: 300 })

    expect(mocks.tablasConsultadas).toEqual(["sesion:rpc:reportes_en_zona"])
    expect(mocks.calls[0]).toEqual(["rpc", "reportes_en_zona", zona, { get: true }])
    expect(mocks.calls).toContainEqual(["eq", "categoria_id", 1])
    expect(mocks.calls).toContainEqual(["in", "estado_id", [1, 4, 2]])
    expect(mocks.calls).toContainEqual(["is", "deleted_at", null])
    expect(mocks.calls).toContainEqual(["range", 0, 300])
    expect(data.map((report) => report.id)).toEqual([7])
  })

  it("sin zona sigue leyendo la tabla, como antes", async () => {
    await getReportMapData({})

    expect(mocks.tablasConsultadas).toEqual(["sesion:reportes"])
  })

  it("informa si había más reportes que el límite", async () => {
    mocks.rows.push(pendingRow, { ...pendingRow, id: 8 })

    const { data, hasMore } = await getReportMapData({ zona, limite: 1 })

    expect(hasMore).toBe(true)
    expect(data).toHaveLength(1)
  })

  it("con publico lee sin la sesión del visitante", async () => {
    await getReportMapData({ zona }, { publico: true })

    expect(mocks.tablasConsultadas).toEqual(["publico:rpc:reportes_en_zona"])
  })

  it("los grupos usan los mismos filtros traducidos a IDs y devuelven límites", async () => {
    mocks.rows.push({ lat: -27.37, lon: -55.9, cantidad: 12, oeste: -55.91, sur: -27.38, este: -55.89, norte: -27.36 })

    const { data, error } = await getGruposEnZona({
      zona,
      celda: 0.01,
      estados: [1, 4, 2],
      categoria: "Bache",
      prioridad: "Alta",
      search: "luz",
    })

    expect(mocks.tablasConsultadas).toEqual(["publico:rpc:reportes_agrupados_en_zona"])
    expect(mocks.calls[0]).toEqual(["rpc", "reportes_agrupados_en_zona", {
      ...zona,
      celda: 0.01,
      estados: [1, 4, 2],
      categoria: 1,
      prioridad: 1,
      busqueda: "luz",
    }])
    expect(error).toBeNull()
    expect(data).toEqual([{ lat: -27.37, lon: -55.9, cantidad: 12, limites: { oeste: -55.91, sur: -27.38, este: -55.89, norte: -27.36 } }])
  })

  it("sin filtros los grupos mandan nulos, no textos vacíos", async () => {
    await getGruposEnZona({ zona, celda: 0.01, estados: [1], search: "  " })

    expect(mocks.calls[0]).toEqual(["rpc", "reportes_agrupados_en_zona", {
      ...zona, celda: 0.01, estados: [1], categoria: null, prioridad: null, busqueda: null,
    }])
  })
})
