import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest"

import type { ContenidoZonaMapa } from "@/database/queries/reportes/mapa-por-zona"

import { crearCargadorZona, urlZonaMapa } from "./cargador-zona"

const zona = { oeste: -55.9003, sur: -27.3803, este: -55.8901, norte: -27.3701 }
const puntos = { tipo: "puntos" as const, reportes: [] }

describe("urlZonaMapa", () => {
  it("ajusta la zona a la grilla y agrega solo los filtros con valor", () => {
    const url = urlZonaMapa(zona, 16, { search: "luz", categoria: "", estado: undefined, prioridad: "Alta" })
    const parametros = new URL(url!, "http://x").searchParams

    expect(url!.startsWith("/api/mapa/reportes?")).toBe(true)
    expect(parametros.get("zoom")).toBe("16")
    expect(parametros.get("search")).toBe("luz")
    expect(parametros.get("prioridad")).toBe("Alta")
    expect(parametros.has("categoria")).toBe(false)
    expect(parametros.has("estado")).toBe(false)
    const [oeste, sur, este, norte] = parametros.get("zona")!.split(",").map(Number)
    expect(oeste).toBeLessThanOrEqual(zona.oeste)
    expect(norte).toBeGreaterThanOrEqual(zona.norte)
    expect(sur).toBeLessThanOrEqual(zona.sur)
    expect(este).toBeGreaterThanOrEqual(zona.este)
  })

  it("lleva el zoom a un entero dentro de los límites del mapa", () => {
    expect(new URL(urlZonaMapa(zona, 12.4, {})!, "http://x").searchParams.get("zoom")).toBe("13")
    expect(new URL(urlZonaMapa(zona, 20, {})!, "http://x").searchParams.get("zoom")).toBe("18")
  })

  it("devuelve null fuera de Posadas", () => {
    expect(urlZonaMapa({ oeste: -58, sur: -30, este: -57.5, norte: -29.5 }, 15, {})).toBeNull()
  })
})

describe("crearCargadorZona", () => {
  let obtener: Mock<(url: string, senal: AbortSignal) => Promise<ContenidoZonaMapa>>
  let alCargar: Mock<(contenido: ContenidoZonaMapa) => void>

  beforeEach(() => {
    vi.useFakeTimers()
    obtener = vi.fn<(url: string, senal: AbortSignal) => Promise<ContenidoZonaMapa>>().mockResolvedValue(puntos)
    alCargar = vi.fn<(contenido: ContenidoZonaMapa) => void>()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("espera 250 ms sin movimientos antes de pedir, y pide una sola vez", async () => {
    const cargador = crearCargadorZona({ obtener, alCargar })

    cargador.pedir(zona, 15, {})
    await vi.advanceTimersByTimeAsync(200)
    cargador.pedir({ ...zona, oeste: zona.oeste - 0.01 }, 15, {})
    await vi.advanceTimersByTimeAsync(249)
    expect(obtener).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(obtener).toHaveBeenCalledTimes(1)
    expect(alCargar).toHaveBeenCalledWith(puntos)
  })

  it("cancela el pedido anterior si llega otro y descarta su respuesta", async () => {
    let resolverPrimero: (valor: ContenidoZonaMapa) => void = () => {}
    obtener
      .mockImplementationOnce((_url: string, senal: AbortSignal) => new Promise<ContenidoZonaMapa>((resolver, rechazar) => {
        resolverPrimero = resolver
        senal.addEventListener("abort", () => rechazar(new DOMException("Abortado", "AbortError")))
      }))
      .mockResolvedValueOnce({ tipo: "grupos", grupos: [] })
    const cargador = crearCargadorZona({ obtener, alCargar })

    cargador.pedir(zona, 15, {})
    await vi.advanceTimersByTimeAsync(250)
    const senalPrimera = obtener.mock.calls[0][1] as AbortSignal
    cargador.pedir(zona, 16, {})
    await vi.advanceTimersByTimeAsync(250)
    resolverPrimero(puntos)
    await vi.advanceTimersByTimeAsync(0)

    expect(senalPrimera.aborted).toBe(true)
    expect(alCargar).toHaveBeenCalledTimes(1)
    expect(alCargar).toHaveBeenCalledWith({ tipo: "grupos", grupos: [] })
  })

  it("una zona ya pedida se responde desde memoria, sin volver a pedirla", async () => {
    const cargador = crearCargadorZona({ obtener, alCargar })

    cargador.pedir(zona, 15, {})
    await vi.advanceTimersByTimeAsync(250)
    cargador.pedir(zona, 15, {})
    await vi.advanceTimersByTimeAsync(250)

    expect(obtener).toHaveBeenCalledTimes(1)
    expect(alCargar).toHaveBeenCalledTimes(2)
  })

  it("una zona recordada vence a los 30 s: se muestra lo guardado y se vuelve a pedir", async () => {
    const nuevo = { tipo: "puntos" as const, reportes: [{ id: 9 }] as never[] }
    obtener.mockResolvedValueOnce(puntos).mockResolvedValueOnce(nuevo)
    const cargador = crearCargadorZona({ obtener, alCargar })

    cargador.pedir(zona, 15, {})
    await vi.advanceTimersByTimeAsync(250)
    await vi.advanceTimersByTimeAsync(30_000)
    cargador.pedir(zona, 15, {})
    await vi.advanceTimersByTimeAsync(250)

    expect(obtener).toHaveBeenCalledTimes(2)
    expect(alCargar.mock.calls.map(([c]) => c)).toEqual([puntos, puntos, nuevo])
  })

  it("olvidar borra las zonas recordadas", async () => {
    const cargador = crearCargadorZona({ obtener, alCargar })

    cargador.pedir(zona, 15, {})
    await vi.advanceTimersByTimeAsync(250)
    cargador.olvidar()
    cargador.pedir(zona, 15, {})
    await vi.advanceTimersByTimeAsync(250)

    expect(obtener).toHaveBeenCalledTimes(2)
  })

  it("avisa cuando empieza a pedir, cuando termina y cuando falla", async () => {
    const alCambiarEstado = vi.fn()
    obtener.mockResolvedValueOnce(puntos).mockRejectedValueOnce(new Error("sin red"))
    const cargador = crearCargadorZona({ obtener, alCargar, alCambiarEstado })

    cargador.pedir(zona, 15, {})
    await vi.advanceTimersByTimeAsync(250)
    cargador.pedir(zona, 16, {})
    await vi.advanceTimersByTimeAsync(250)

    expect(alCambiarEstado.mock.calls.map(([e]) => e)).toEqual(["cargando", "listo", "cargando", "error"])
  })

  it("reintentar vuelve a pedir la última zona sin esperar", async () => {
    obtener.mockRejectedValueOnce(new Error("sin red")).mockResolvedValueOnce(puntos)
    const cargador = crearCargadorZona({ obtener, alCargar })

    cargador.pedir(zona, 15, {})
    await vi.advanceTimersByTimeAsync(250)
    cargador.reintentar()
    await vi.advanceTimersByTimeAsync(0)

    expect(obtener).toHaveBeenCalledTimes(2)
    expect(alCargar).toHaveBeenCalledWith(puntos)
  })

  it("si falla, no cambia lo dibujado y avisa", async () => {
    const alFallar = vi.fn()
    obtener.mockRejectedValue(new Error("sin red"))
    const cargador = crearCargadorZona({ obtener, alCargar, alFallar })

    cargador.pedir(zona, 15, {})
    await vi.advanceTimersByTimeAsync(250)

    expect(alCargar).not.toHaveBeenCalled()
    expect(alFallar).toHaveBeenCalledTimes(1)
  })

  it("una zona fuera de Posadas no pide nada", async () => {
    const cargador = crearCargadorZona({ obtener, alCargar })

    cargador.pedir({ oeste: -58, sur: -30, este: -57.5, norte: -29.5 }, 15, {})
    await vi.advanceTimersByTimeAsync(250)

    expect(obtener).not.toHaveBeenCalled()
  })

  it("cancelar descarta lo pendiente", async () => {
    const cargador = crearCargadorZona({ obtener, alCargar })

    cargador.pedir(zona, 15, {})
    cargador.cancelar()
    await vi.advanceTimersByTimeAsync(300)

    expect(obtener).not.toHaveBeenCalled()
  })
})
