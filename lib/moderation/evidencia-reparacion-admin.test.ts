import { beforeEach, describe, expect, it, vi } from "vitest"

const autorizar = vi.hoisted(() => vi.fn())
vi.mock("server-only", () => ({}))
vi.mock("./administracion.server", () => ({ autorizarAdministracion: autorizar }))

import {
  listarEvidenciasEnVerificacion,
  listarEvidenciasValidadas,
  listarImpugnacionesPendientes,
} from "./evidencia-reparacion-admin.server"

type Registro = {
  tabla: string
  seleccion: string
  eq: unknown[][]
  in: unknown[][]
  is: unknown[][]
  orden: unknown[][]
  rango: [number, number] | null
}

type Respuesta = { contiene: string; datos: unknown[] | null; error?: unknown }

/**
 * Servicio falso que resuelve cada consulta por una marca textual de su `select`,
 * así el test no depende del orden de las llamadas ni de la tabla consultada.
 */
function crearServicio(respuestas: Respuesta[]) {
  const registros: Registro[] = []
  const from = vi.fn((tabla: string) => {
    const registro: Registro = { tabla, seleccion: "", eq: [], in: [], is: [], orden: [], rango: null }
    registros.push(registro)
    const consulta = {
      select: vi.fn((columnas: string) => { registro.seleccion = columnas; return consulta }),
      eq: vi.fn((columna: string, valor: unknown) => { registro.eq.push([columna, valor]); return consulta }),
      in: vi.fn((columna: string, valores: unknown) => { registro.in.push([columna, valores]); return consulta }),
      is: vi.fn((columna: string, valor: unknown) => { registro.is.push([columna, valor]); return consulta }),
      order: vi.fn((columna: string, opciones: unknown) => { registro.orden.push([columna, opciones]); return consulta }),
      range: vi.fn(async (desde: number, hasta: number) => {
        registro.rango = [desde, hasta]
        const respuesta = respuestas.find((candidata) => registro.seleccion.includes(candidata.contiene))
        if (!respuesta) throw new Error(`consulta inesperada en ${tabla}: ${registro.seleccion}`)
        return { data: respuesta.datos, error: respuesta.error ?? null }
      }),
    }
    return consulta
  })
  return { servicio: { from }, registros }
}

/** Devuelve la consulta que incluye la marca textual pedida. */
function registroCon(registros: Registro[], marca: string) {
  const registro = registros.find((candidato) => candidato.seleccion.includes(marca))
  if (!registro) throw new Error(`no se consultó la marca ${marca}`)
  return registro
}

const IMPUGNACION_ID = "11111111-1111-4111-8111-111111111111"
const EVIDENCIA_ID = "22222222-2222-4222-8222-222222222222"
const OTRA_EVIDENCIA_ID = "33333333-3333-4333-8333-333333333333"

type FilaReporte = { id: number; titulo: string; estado_id: number; deleted_at: string | null }

const reporte: FilaReporte = { id: 9, titulo: "Bache en Av. Uruguay y Bolívar", estado_id: 1, deleted_at: null }

function impugnacionPendiente(extra: { estadoEvidencia?: string; reporte?: FilaReporte } = {}) {
  return {
    id: IMPUGNACION_ID,
    motivo: "La vereda sigue rota",
    created_at: "2026-11-01T10:00:00Z",
    evidencias_reparacion: {
      id: EVIDENCIA_ID,
      reporte_id: 9,
      comentario: "Ya lo arreglaron",
      estado: extra.estadoEvidencia ?? "en_verificacion",
      reportes: extra.reporte ?? reporte,
    },
  }
}

function contadores() {
  return [
    { evidencia_id: EVIDENCIA_ID, tipo: "confirmacion", estado: "pendiente" },
    { evidencia_id: EVIDENCIA_ID, tipo: "confirmacion", estado: "pendiente" },
    { evidencia_id: EVIDENCIA_ID, tipo: "impugnacion", estado: "pendiente" },
    { evidencia_id: EVIDENCIA_ID, tipo: "impugnacion", estado: "aceptada" },
    { evidencia_id: OTRA_EVIDENCIA_ID, tipo: "confirmacion", estado: "pendiente" },
  ]
}

function evidenciaFila(estado: string) {
  return {
    id: EVIDENCIA_ID,
    reporte_id: 9,
    comentario: "Ya lo arreglaron",
    estado,
    publicada_at: "2026-11-02T10:00:00Z",
    reportes: reporte,
  }
}

beforeEach(() => vi.resetAllMocks())

describe("cola administrativa de reparaciones: impugnaciones pendientes", () => {
  it("lista solo impugnaciones pendientes de evidencias en verificación, de la más antigua a la más reciente", async () => {
    const { servicio, registros } = crearServicio([
      { contiene: "motivo", datos: [impugnacionPendiente()] },
      { contiene: "tipo,estado", datos: contadores() },
    ])
    autorizar.mockResolvedValue({ servicio })

    expect(await listarImpugnacionesPendientes(0)).toEqual([{
      verificacionId: IMPUGNACION_ID,
      evidenciaId: EVIDENCIA_ID,
      reporteId: 9,
      titulo: "Bache en Av. Uruguay y Bolívar",
      comentario: "Ya lo arreglaron",
      motivo: "La vereda sigue rota",
      creadoAt: "2026-11-01T10:00:00Z",
      confirmaciones: 2,
      impugnaciones: 2,
      impugnacionesPendientes: 1,
    }])

    const consulta = registroCon(registros, "motivo")
    expect(consulta.tabla).toBe("verificaciones_reparacion")
    expect(consulta.eq).toEqual(expect.arrayContaining([
      ["tipo", "impugnacion"],
      ["estado", "pendiente"],
      ["evidencias_reparacion.estado", "en_verificacion"],
    ]))
    expect(consulta.orden[0]).toEqual(["created_at", { ascending: true }])
    expect(consulta.rango).toEqual([0, 19])
  })

  it("oculta la impugnación de un reporte retirado o ya cerrado aunque la base todavía la tenga pendiente", async () => {
    const { servicio } = crearServicio([
      {
        contiene: "motivo",
        datos: [
          impugnacionPendiente({ reporte: { ...reporte, deleted_at: "2026-11-03T10:00:00Z" } }),
          impugnacionPendiente({ reporte: { ...reporte, estado_id: 2 } }),
        ],
      },
    ])
    autorizar.mockResolvedValue({ servicio })

    expect(await listarImpugnacionesPendientes(0)).toEqual([])
  })

  it("nunca pide ni devuelve identidades de quien impugnó", async () => {
    const { servicio, registros } = crearServicio([
      { contiene: "motivo", datos: [impugnacionPendiente()] },
      { contiene: "tipo,estado", datos: [] },
    ])
    autorizar.mockResolvedValue({ servicio })

    const [fila] = await listarImpugnacionesPendientes(0)
    expect(Object.keys(fila)).toEqual([
      "verificacionId", "evidenciaId", "reporteId", "titulo", "comentario", "motivo", "creadoAt",
      "confirmaciones", "impugnaciones", "impugnacionesPendientes",
    ])
    for (const registro of registros) expect(registro.seleccion).not.toMatch(/usuario|autor|email|profiles/)
  })
})

describe("cola administrativa de reparaciones: evidencias", () => {
  it("lista solo las evidencias en verificación de reportes abiertos, de la más antigua a la más reciente", async () => {
    const { servicio, registros } = crearServicio([
      { contiene: "publicada_at", datos: [evidenciaFila("en_verificacion")] },
      { contiene: "tipo,estado", datos: contadores() },
    ])
    autorizar.mockResolvedValue({ servicio })

    expect(await listarEvidenciasEnVerificacion(0)).toEqual([{
      evidenciaId: EVIDENCIA_ID,
      reporteId: 9,
      titulo: "Bache en Av. Uruguay y Bolívar",
      comentario: "Ya lo arreglaron",
      publicadaAt: "2026-11-02T10:00:00Z",
      confirmaciones: 2,
      impugnaciones: 2,
      impugnacionesPendientes: 1,
    }])

    const consulta = registroCon(registros, "publicada_at")
    expect(consulta.tabla).toBe("evidencias_reparacion")
    expect(consulta.eq).toEqual(expect.arrayContaining([["reportes.estado_id", 1]]))
    expect(consulta.in).toContainEqual(["estado", ["en_verificacion"]])
    expect(consulta.is).toContainEqual(["reportes.deleted_at", null])
    expect(consulta.orden[0]).toEqual(["publicada_at", { ascending: true }])
    expect(consulta.rango).toEqual([0, 19])
  })

  it("pagina de veinte en veinte sin cambiar el filtro de elegibilidad", async () => {
    const { servicio, registros } = crearServicio([
      { contiene: "publicada_at", datos: [] },
    ])
    autorizar.mockResolvedValue({ servicio })

    expect(await listarEvidenciasEnVerificacion(2)).toEqual([])
    expect(registroCon(registros, "publicada_at").rango).toEqual([40, 59])
  })

  it("solo lista evidencias validadas para revertir, sin pedir identidades", async () => {
    const { servicio, registros } = crearServicio([
      { contiene: "publicada_at", datos: [evidenciaFila("validada")] },
      { contiene: "tipo,estado", datos: contadores() },
    ])
    autorizar.mockResolvedValue({ servicio })

    const [fila] = await listarEvidenciasValidadas(0)
    expect(fila).toMatchObject({ evidenciaId: EVIDENCIA_ID, confirmaciones: 2, impugnacionesPendientes: 1 })

    const consulta = registroCon(registros, "publicada_at")
    expect(consulta.in).toContainEqual(["estado", ["validada"]])
    expect(consulta.is).toContainEqual(["reportes.deleted_at", null])
    for (const registro of registros) expect(registro.seleccion).not.toMatch(/usuario|autor|email|profiles/)
  })
})

describe("cola administrativa de reparaciones: acceso", () => {
  it("no lee nada cuando la guarda administrativa rechaza la sesión", async () => {
    autorizar.mockRejectedValue(Object.assign(new Error("No disponible"), { estado: 403 }))

    await expect(listarImpugnacionesPendientes(0)).rejects.toMatchObject({ estado: 403 })
    await expect(listarEvidenciasEnVerificacion(0)).rejects.toMatchObject({ estado: 403 })
    await expect(listarEvidenciasValidadas(0)).rejects.toMatchObject({ estado: 403 })
  })

  it("falla explícitamente cuando la consulta de contadores devuelve error", async () => {
    const { servicio } = crearServicio([
      { contiene: "publicada_at", datos: [evidenciaFila("en_verificacion")] },
      { contiene: "tipo,estado", datos: null, error: { message: "boom" } },
    ])
    autorizar.mockResolvedValue({ servicio })

    await expect(listarEvidenciasEnVerificacion(0)).rejects.toThrow(
      "No se pudieron contar las verificaciones de las reparaciones.",
    )
  })
})
