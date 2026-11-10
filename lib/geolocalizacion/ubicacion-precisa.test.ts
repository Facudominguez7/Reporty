import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { buscarUbicacionPrecisa, esUbicacionAproximada, PRECISION_SUFICIENTE_M } from "./ubicacion-precisa"

/** Geolocalización falsa: guarda los callbacks para emitir lecturas a mano. */
function geolocalizacionFalsa() {
  let exito: PositionCallback = () => {}
  let fallo: PositionErrorCallback | null | undefined
  const geo = {
    watchPosition: vi.fn((ok: PositionCallback, err?: PositionErrorCallback | null) => {
      exito = ok
      fallo = err
      return 7
    }),
    clearWatch: vi.fn(),
    getCurrentPosition: vi.fn(),
  }
  const emitir = (lat: number, lon: number, accuracy: number) =>
    exito({ coords: { latitude: lat, longitude: lon, accuracy } } as GeolocationPosition)
  const fallar = (code = 1) => fallo?.({ code } as GeolocationPositionError)
  return { geo: geo as unknown as Geolocation, espia: geo, emitir, fallar }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe("buscarUbicacionPrecisa", () => {
  it("pide lecturas nuevas en alta precisión, nunca una posición en caché", () => {
    const { geo, espia } = geolocalizacionFalsa()
    void buscarUbicacionPrecisa(geo)

    expect(espia.watchPosition).toHaveBeenCalledWith(expect.any(Function), expect.any(Function), {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: expect.any(Number),
    })
  })

  it("termina apenas una lectura alcanza la precisión suficiente y deja de escuchar", async () => {
    const { geo, espia, emitir } = geolocalizacionFalsa()
    const resultado = buscarUbicacionPrecisa(geo)

    emitir(-27.36, -55.89, 150)
    emitir(-27.3671, -55.8961, PRECISION_SUFICIENTE_M)

    await expect(resultado).resolves.toEqual({ lat: -27.3671, lon: -55.8961, precision: PRECISION_SUFICIENTE_M })
    expect(espia.clearWatch).toHaveBeenCalledWith(7)
  })

  it("al vencer el tiempo devuelve la lectura más precisa de las que llegaron", async () => {
    const { geo, espia, emitir } = geolocalizacionFalsa()
    const resultado = buscarUbicacionPrecisa(geo, { tiempoMaximoMs: 12_000 })

    emitir(-27.1, -55.1, 300)
    emitir(-27.2, -55.2, 45)
    emitir(-27.3, -55.3, 90)
    vi.advanceTimersByTime(12_000)

    await expect(resultado).resolves.toEqual({ lat: -27.2, lon: -55.2, precision: 45 })
    expect(espia.clearWatch).toHaveBeenCalledWith(7)
  })

  it("falla si vence el tiempo sin ninguna lectura", async () => {
    const { geo } = geolocalizacionFalsa()
    const resultado = buscarUbicacionPrecisa(geo, { tiempoMaximoMs: 5_000 })
    vi.advanceTimersByTime(5_000)

    await expect(resultado).rejects.toThrow()
  })

  it("falla enseguida si la persona no da permiso", async () => {
    const { geo, espia, fallar } = geolocalizacionFalsa()
    const resultado = buscarUbicacionPrecisa(geo)
    fallar(1)

    await expect(resultado).rejects.toThrow()
    expect(espia.clearWatch).toHaveBeenCalledWith(7)
  })

  it("si ya hubo una lectura, un error posterior devuelve la mejor en vez de fallar", async () => {
    const { geo, emitir, fallar } = geolocalizacionFalsa()
    const resultado = buscarUbicacionPrecisa(geo)
    emitir(-27.2, -55.2, 70)
    fallar(3)

    await expect(resultado).resolves.toEqual({ lat: -27.2, lon: -55.2, precision: 70 })
  })
})

describe("esUbicacionAproximada", () => {
  it("marca como aproximada una lectura con más de 50 m de margen", () => {
    expect(esUbicacionAproximada(51)).toBe(true)
    expect(esUbicacionAproximada(50)).toBe(false)
  })
})
