import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { GET } from "./route"

const mocks = vi.hoisted(() => ({ cargarZonaMapa: vi.fn() }))
vi.mock("@/database/queries/reportes/mapa-por-zona", () => ({ cargarZonaMapa: mocks.cargarZonaMapa }))

/** Arma un pedido al endpoint con los parámetros dados. */
function pedir(parametros: string) {
  return GET(new NextRequest(`http://localhost/api/mapa/reportes?${parametros}`))
}

beforeEach(() => {
  mocks.cargarZonaMapa.mockReset().mockResolvedValue({ data: { tipo: "puntos", reportes: [{ id: 7 }] }, error: null })
})

describe("GET /api/mapa/reportes", () => {
  it("ajusta la zona a la grilla y a Posadas, pasa los filtros y responde con caché pública", async () => {
    const respuesta = await pedir("zona=-57,-28,-55,-27&zoom=13&search=bache&categoria=Bache&estado=Pendiente&prioridad=Alta")

    expect(mocks.cargarZonaMapa).toHaveBeenCalledWith({
      zona: { oeste: -56.06, sur: -27.59, este: -55.6, norte: -27.32 },
      zoom: 13,
      filtros: { search: "bache", categoria: "Bache", estado: "Pendiente", prioridad: "Alta" },
    })
    expect(respuesta.status).toBe(200)
    // El navegador no recibe stale-while-revalidate: con esa directiva devolvía la copia vieja
    // y el mapa no veía reportes nuevos al revalidar. La CDN sí la usa.
    expect(respuesta.headers.get("Cache-Control")).toBe("public, s-maxage=30")
    expect(respuesta.headers.get("CDN-Cache-Control")).toBe("public, max-age=30, stale-while-revalidate=60")
    expect(await respuesta.json()).toEqual({ tipo: "puntos", reportes: [{ id: 7 }] })
  })

  it("devuelve los grupos tal como llegan", async () => {
    const grupos = [{ lat: -27.37, lon: -55.9, cantidad: 412, limites: { oeste: -55.91, sur: -27.38, este: -55.89, norte: -27.36 } }]
    mocks.cargarZonaMapa.mockResolvedValue({ data: { tipo: "grupos", grupos }, error: null })

    const respuesta = await pedir("zona=-55.95,-27.40,-55.85,-27.35&zoom=13")

    expect(await respuesta.json()).toEqual({ tipo: "grupos", grupos })
  })

  it.each([
    ["sin zona", "zoom=15"],
    ["con zona inválida", "zona=a,b,c,d&zoom=15"],
    ["con zoom menor que el mínimo del mapa", "zona=-55.95,-27.40,-55.85,-27.35&zoom=12"],
    ["con zoom mayor que el máximo", "zona=-55.95,-27.40,-55.85,-27.35&zoom=19"],
    ["con zoom no entero", "zona=-55.95,-27.40,-55.85,-27.35&zoom=15.5"],
    ["con una búsqueda demasiado larga", `zona=-55.95,-27.40,-55.85,-27.35&zoom=15&search=${"a".repeat(101)}`],
  ])("responde 400 %s, sin consultar", async (_caso, parametros) => {
    const respuesta = await pedir(parametros)

    expect(respuesta.status).toBe(400)
    expect(respuesta.headers.get("Cache-Control")).toBe("no-store")
    expect(mocks.cargarZonaMapa).not.toHaveBeenCalled()
  })

  it("responde 400 si la zona queda fuera de Posadas", async () => {
    const respuesta = await pedir("zona=-58,-30,-57.5,-29.5&zoom=15")

    expect(respuesta.status).toBe(400)
    expect(mocks.cargarZonaMapa).not.toHaveBeenCalled()
  })

  it("responde 500 sin cachear ni exponer el detalle si la consulta falla", async () => {
    mocks.cargarZonaMapa.mockResolvedValue({ data: { tipo: "puntos", reportes: [] }, error: new Error("detalle interno") })

    const respuesta = await pedir("zona=-55.95,-27.40,-55.85,-27.35&zoom=15")

    expect(respuesta.status).toBe(500)
    expect(respuesta.headers.get("Cache-Control")).toBe("no-store")
    expect(JSON.stringify(await respuesta.json())).not.toContain("detalle interno")
  })
})
