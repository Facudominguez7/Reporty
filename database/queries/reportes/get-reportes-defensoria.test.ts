import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ selecciones: [] as string[], reportes: [] as object[], operaciones: [] as [string, ...unknown[]][] }))

vi.mock("next/cache", () => ({ unstable_cache: (cargar: unknown) => cargar }))
vi.mock("@/utils/supabase/public", () => ({ createPublicClient: vi.fn() }))
vi.mock("@/database/queries/profiles", () => ({
  getPublicProfilesByIds: async () => ({ data: [] }),
  indexPublicProfilesById: () => new Map(),
}))
vi.mock("@/database/queries/cuadrillas", () => ({ obtenerEstadoOperativoPublicoPorReporte: async () => new Map() }))
vi.mock("@/lib/features", () => ({ cuadrillasHabilitadas: () => false }))
vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({
    from: (tabla: string) => {
      let seleccion = ""
      const consulta: object = new Proxy({}, {
        get(_objetivo, metodo) {
          if (metodo === "then") return (resolver: (valor: unknown) => void) => resolver({
            data: tabla === "reportes" ? mocks.reportes.map((reporte) => {
              const fila = { ...reporte } as Record<string, unknown>
              if (!/\bdireccion\b/.test(seleccion)) delete fila.direccion
              return fila
            }) : [], error: null,
          })
          return (...argumentos: unknown[]) => {
            if (tabla === "reportes") mocks.operaciones.push([String(metodo), ...argumentos])
            if (metodo === "select") { seleccion = String(argumentos[0]); mocks.selecciones.push(`${tabla}:${seleccion}`) }
            return consulta
          }
        },
      })
      return consulta
    },
  }),
}))

import { getReportesDefensoria, getReportMapData } from "./get-reportes"

const fila = {
  id: 7, usuario_id: null, titulo: "Bache", descripcion: null, created_at: "2026-10-01T00:00:00Z",
  lat: -27.4, lon: -55.9, categoria: null, prioridad: null, estado: { nombre: "Pendiente" }, fotos: null,
}

describe("direcciones en Defensoría", () => {
  beforeEach(() => { mocks.reportes.length = 0; mocks.selecciones.length = 0; mocks.operaciones.length = 0 })

  it("filtra estado y búsqueda literal antes del rango, con desempate estable", async () => {
    await getReportesDefensoria(20, 20, { vista: "tomados", busqueda: 'a.*,\\"(b)' })
    const operaciones = mocks.operaciones
    expect(operaciones).toContainEqual(["eq", "estado_id", 4])
    const filtro = operaciones.find((op) => op[0] === "or")?.[1]
    expect(filtro).toBe('titulo.imatch."a\\\\.\\\\*,\\\\\\\\\\\"\\\\(b\\\\)",direccion.imatch."a\\\\.\\\\*,\\\\\\\\\\\"\\\\(b\\\\)"')
    expect(operaciones.findIndex((op) => op[0] === "or")).toBeLessThan(operaciones.findIndex((op) => op[0] === "range"))
    expect(operaciones.filter(([operacion]) => operacion === "order")).toEqual([
      ["order", "created_at", { ascending: true }],
      ["order", "id", { ascending: true }],
    ])
  })

  it.each(["2", "#2", "reporte 2"])("busca %s por ID exacto en ambos estados de Defensoría", async (busqueda) => {
    await getReportesDefensoria(20, 0, { vista: "pendientes", busqueda })
    expect(mocks.operaciones).toContainEqual(["in", "estado_id", [1, 4]])
    expect(mocks.operaciones).toContainEqual(["eq", "id", 2])
    expect(mocks.operaciones).not.toContainEqual(["eq", "estado_id", 1])
    expect(mocks.operaciones.some(([operacion]) => operacion === "or")).toBe(false)
  })

  it("recupera la dirección persistida y conserva la ausencia sin usar coordenadas", async () => {
    mocks.reportes.push({ ...fila, direccion: "Av. Freyre 123, Santa Fe" }, { ...fila, id: 8, direccion: null })
    const resultado = await getReportesDefensoria()
    expect(resultado.error).toBeNull()
    expect(resultado.data).toMatchObject([{ direccion: "Av. Freyre 123, Santa Fe" }, { direccion: null }])
    expect(mocks.selecciones.some((seleccion) => seleccion.startsWith("reportes:") && /\bdireccion\b/.test(seleccion))).toBe(true)
  })

  it("conserva las coordenadas del mapa público sin consultar direcciones", async () => {
    mocks.reportes.push({ ...fila, direccion: "Av. Freyre 123, Santa Fe" })
    const resultado = await getReportMapData({ soloDefensoria: true, limite: 100 })
    expect(mocks.operaciones).toContainEqual(["in", "estado_id", [1, 4]])
    expect(mocks.operaciones).toContainEqual(["range", 0, 100])
    expect(resultado.data[0].location).toBe("Lat -27.4000, Lon -55.9000")
    expect(mocks.operaciones.filter(([operacion]) => operacion === "order")).toEqual([
      ["order", "created_at", { ascending: false }],
    ])
    expect(mocks.selecciones.some((seleccion) => /\bdireccion\b/.test(seleccion))).toBe(false)
  })
})
