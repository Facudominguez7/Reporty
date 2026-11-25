import { beforeEach, describe, expect, it, vi, type Mock } from "vitest"

import type { UbicacionPrecisa } from "@/lib/geolocalizacion/ubicacion-precisa"

import {
  CLAVE_AVISO_UBICACION_DENEGADA,
  CLAVE_UBICACION_SIN_RESPUESTA,
  debeCentrarAlVolver,
  debeCentrarEnPersona,
  debeActualizarCercanos,
  debeEncuadrarRadio,
  iniciarUbicacionAlAbrir,
  pedirCercanos,
  seguirUbicacion,
} from "./ubicacion-al-abrir"

/** Almacenamiento en memoria con la forma de `Storage` que usa el flujo. */
function almacen() {
  const datos = new Map<string, string>()
  return {
    getItem: (clave: string) => datos.get(clave) ?? null,
    setItem: (clave: string, valor: string) => void datos.set(clave, valor),
  }
}

/** Geolocalización falsa que responde una lectura o un error en `watchPosition`. */
function geolocalizacion(respuesta: { lat: number; lon: number; precision: number } | { codigo: number }) {
  return {
    watchPosition: vi.fn((exito: PositionCallback, fallo?: PositionErrorCallback | null, _opciones?: PositionOptions) => {
      if ("codigo" in respuesta) fallo?.({ code: respuesta.codigo, message: "", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError)
      else exito({ coords: { latitude: respuesta.lat, longitude: respuesta.lon, accuracy: respuesta.precision } } as GeolocationPosition)
      return 1
    }),
    clearWatch: vi.fn(),
    getCurrentPosition: vi.fn(),
  }
}

/** Navegador falso con el estado de permiso dado (o sin Permissions API). */
function navegador(permiso: PermissionState | "sin-api", geo: ReturnType<typeof geolocalizacion>) {
  return {
    geolocation: geo as unknown as Geolocation,
    permissions: permiso === "sin-api" ? undefined : ({ query: vi.fn().mockResolvedValue({ state: permiso }) } as unknown as Permissions),
  }
}

const EN_POSADAS = { lat: -27.367891, lon: -55.896449, precision: 18 }

let sesion: ReturnType<typeof almacen>
let local: ReturnType<typeof almacen>
let alUbicar: Mock<(ubicacion: UbicacionPrecisa) => void>
let alAvisarDenegado: Mock<() => void>

beforeEach(() => {
  sesion = almacen()
  local = almacen()
  alUbicar = vi.fn<(ubicacion: UbicacionPrecisa) => void>()
  alAvisarDenegado = vi.fn<() => void>()
})

/** Corre el flujo de apertura con el navegador dado. */
const abrir = (nav: Parameters<typeof iniciarUbicacionAlAbrir>[0]["navegador"]) =>
  iniciarUbicacionAlAbrir({ navegador: nav, almacenSesion: sesion, almacenLocal: local, alUbicar, alAvisarDenegado })

describe("ubicación al abrir el mapa", () => {
  it("con permiso dado, lee una sola vez sin preguntar y entrega la ubicación", async () => {
    const geo = geolocalizacion(EN_POSADAS)

    await abrir(navegador("granted", geo))

    expect(geo.watchPosition).toHaveBeenCalledTimes(1)
    // Tiempo máximo de 6 s, sin seguimiento continuo: la lectura termina y se limpia.
    expect(geo.watchPosition.mock.calls[0][2]).toMatchObject({ timeout: 6000 })
    expect(geo.clearWatch).toHaveBeenCalled()
    expect(alUbicar).toHaveBeenCalledWith(EN_POSADAS)
    expect(alAvisarDenegado).not.toHaveBeenCalled()
  })

  it("sin respuesta todavía, pide el permiso al abrir y, si se acepta, entrega la ubicación", async () => {
    const geo = geolocalizacion(EN_POSADAS)

    await abrir(navegador("prompt", geo))

    expect(geo.watchPosition).toHaveBeenCalledTimes(1)
    expect(alUbicar).toHaveBeenCalledWith(EN_POSADAS)
  })

  it("si la persona tarda más de 6 s en aceptar el permiso, lee apenas lo acepta", async () => {
    vi.useFakeTimers()
    try {
      // El diálogo sigue abierto: la primera lectura no recibe nada y vence a los 6 s.
      const lecturas: PositionCallback[] = []
      const geo = {
        watchPosition: vi.fn((exito: PositionCallback) => { lecturas.push(exito); return lecturas.length }),
        clearWatch: vi.fn(),
        getCurrentPosition: vi.fn(),
      }
      const estado = Object.assign(new EventTarget(), { state: "prompt" as PermissionState })
      const nav = { geolocation: geo as unknown as Geolocation, permissions: { query: vi.fn().mockResolvedValue(estado) } as unknown as Permissions }

      const flujo = abrir(nav)
      await vi.advanceTimersByTimeAsync(6000)
      expect(alUbicar).not.toHaveBeenCalled()

      // A los 9 s acepta: se lee una vez más y llega la ubicación.
      await vi.advanceTimersByTimeAsync(3000)
      estado.state = "granted"
      estado.dispatchEvent(new Event("change"))
      await vi.advanceTimersByTimeAsync(0)
      expect(geo.watchPosition).toHaveBeenCalledTimes(2)
      lecturas[1]({ coords: { latitude: EN_POSADAS.lat, longitude: EN_POSADAS.lon, accuracy: EN_POSADAS.precision } } as GeolocationPosition)
      await flujo

      expect(alUbicar).toHaveBeenCalledWith(EN_POSADAS)
      expect(sesion.getItem(CLAVE_UBICACION_SIN_RESPUESTA)).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it("si después de vencer el tiempo la persona niega el permiso, no vuelve a leer", async () => {
    vi.useFakeTimers()
    try {
      const geo = { watchPosition: vi.fn(() => 1), clearWatch: vi.fn(), getCurrentPosition: vi.fn() }
      const estado = Object.assign(new EventTarget(), { state: "prompt" as PermissionState })
      const nav = { geolocation: geo as unknown as Geolocation, permissions: { query: vi.fn().mockResolvedValue(estado) } as unknown as Permissions }

      const flujo = abrir(nav)
      await vi.advanceTimersByTimeAsync(6000)
      estado.state = "denied"
      estado.dispatchEvent(new Event("change"))
      await flujo

      expect(geo.watchPosition).toHaveBeenCalledTimes(1)
      expect(alUbicar).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it("si se cierra el diálogo sin responder, no vuelve a pedirlo en esa sesión", async () => {
    await abrir(navegador("prompt", geolocalizacion({ codigo: 1 })))
    expect(sesion.getItem(CLAVE_UBICACION_SIN_RESPUESTA)).toBe("1")
    expect(alUbicar).not.toHaveBeenCalled()

    const otraVisita = geolocalizacion(EN_POSADAS)
    await abrir(navegador("prompt", otraVisita))
    expect(otraVisita.watchPosition).not.toHaveBeenCalled()
  })

  it("con permiso dado, lee aunque antes se haya cerrado el diálogo en la sesión", async () => {
    sesion.setItem(CLAVE_UBICACION_SIN_RESPUESTA, "1")
    const geo = geolocalizacion(EN_POSADAS)

    await abrir(navegador("granted", geo))

    expect(alUbicar).toHaveBeenCalledWith(EN_POSADAS)
  })

  it("con permiso negado, no lee y avisa una sola vez", async () => {
    const geo = geolocalizacion(EN_POSADAS)

    await abrir(navegador("denied", geo))
    await abrir(navegador("denied", geo))

    expect(geo.watchPosition).not.toHaveBeenCalled()
    expect(alAvisarDenegado).toHaveBeenCalledTimes(1)
    expect(local.getItem(CLAVE_AVISO_UBICACION_DENEGADA)).toBe("1")
  })

  it("sin Permissions API, llama directo a la geolocalización", async () => {
    const geo = geolocalizacion(EN_POSADAS)

    await abrir(navegador("sin-api", geo))

    expect(geo.watchPosition).toHaveBeenCalledTimes(1)
    expect(alUbicar).toHaveBeenCalledWith(EN_POSADAS)
  })

  it("si la Permissions API falla, también llama directo a la geolocalización", async () => {
    const geo = geolocalizacion(EN_POSADAS)
    const nav = { geolocation: geo as unknown as Geolocation, permissions: { query: vi.fn().mockRejectedValue(new TypeError("geolocation")) } as unknown as Permissions }

    await abrir(nav)

    expect(alUbicar).toHaveBeenCalledWith(EN_POSADAS)
  })

  it("fuera de Posadas no entrega la ubicación: el mapa no se mueve ni dibuja el punto", async () => {
    await abrir(navegador("granted", geolocalizacion({ lat: -34.6037, lon: -58.3816, precision: 10 })))

    expect(alUbicar).not.toHaveBeenCalled()
  })

  it("sin señal no entrega nada ni marca la sesión", async () => {
    await abrir(navegador("granted", geolocalizacion({ codigo: 2 })))

    expect(alUbicar).not.toHaveBeenCalled()
    expect(sesion.getItem(CLAVE_UBICACION_SIN_RESPUESTA)).toBeNull()
  })

  it("sin geolocalización en el navegador no hace nada", async () => {
    await abrir({ geolocation: undefined, permissions: undefined })

    expect(alUbicar).not.toHaveBeenCalled()
    expect(alAvisarDenegado).not.toHaveBeenCalled()
  })
})

describe("debeCentrarEnPersona", () => {
  it("al cargar el mapa siempre centra en la persona, aunque el mapa se haya movido antes de la lectura", () => {
    expect(debeCentrarEnPersona({ hayFocoReporte: false })).toBe(true)
  })

  it("no centra si se llegó desde un reporte, para mostrar ese reporte", () => {
    expect(debeCentrarEnPersona({ hayFocoReporte: true })).toBe(false)
  })
})

describe("debeCentrarAlVolver", () => {
  const antes = { lat: -27.3671, lon: -55.8961 }

  it("centra en la persona si al volver a la app está a más de 100 m de donde la dejó", () => {
    // 0,0015° de latitud son unos 167 m.
    expect(debeCentrarAlVolver(antes, { lat: -27.3686, lon: -55.8961 })).toBe(true)
  })

  it("no mueve el mapa si al volver sigue cerca, para no pisar lo que estaba mirando", () => {
    // 0,0005° de latitud son unos 56 m.
    expect(debeCentrarAlVolver(antes, { lat: -27.3676, lon: -55.8961 })).toBe(false)
  })
})

describe("pedirCercanos", () => {
  it("manda la coordenada redondeada a 4 decimales en el cuerpo, nunca en la URL", async () => {
    const fetchFalso = vi.fn().mockResolvedValue(new Response(JSON.stringify({ cercanos: [{ tipo: "reporte", id: 7, titulo: "Bache", metros: 90 }] })))

    const cercanos = await pedirCercanos({ lat: -27.367891, lon: -55.896449, radio: 500 }, undefined, fetchFalso)

    const [url, opciones] = fetchFalso.mock.calls[0]
    expect(url).toBe("/api/mapa/cerca")
    expect(opciones.method).toBe("POST")
    expect(JSON.parse(opciones.body)).toEqual({ lat: -27.3679, lon: -55.8964, radio: 500 })
    expect(cercanos).toEqual([{ tipo: "reporte", id: 7, titulo: "Bache", metros: 90 }])
  })

  it("lanza si el servidor responde con error", async () => {
    const fetchFalso = vi.fn().mockResolvedValue(new Response("{}", { status: 500 }))

    await expect(pedirCercanos({ lat: -27.37, lon: -55.9, radio: 500 }, undefined, fetchFalso)).rejects.toThrow()
  })
})

describe("debeEncuadrarRadio", () => {
  it("al elegir otro radio, encuadra el círculo: con uno más chico se acerca y con uno más grande se aleja", () => {
    expect(debeEncuadrarRadio({ radioAnterior: 500, radio: 300 })).toBe(true)
    expect(debeEncuadrarRadio({ radioAnterior: 500, radio: 1000 })).toBe(true)
  })

  it("con la primera ubicación decide debeCentrarEnPersona, y si el radio no cambió no se mueve", () => {
    expect(debeEncuadrarRadio({ radioAnterior: null, radio: 500 })).toBe(false)
    expect(debeEncuadrarRadio({ radioAnterior: 500, radio: 500 })).toBe(false)
  })
})

describe("seguirUbicacion", () => {
  /** Geolocalización falsa que guarda el callback del seguimiento para emitir lecturas. */
  function geoSeguimiento() {
    let emitir: PositionCallback = () => {}
    const geo = {
      watchPosition: vi.fn((exito: PositionCallback) => {
        emitir = exito
        return 7
      }),
      clearWatch: vi.fn(),
      getCurrentPosition: vi.fn(),
    }
    const leer = (lat: number, lon: number, precision = 10) =>
      emitir({ coords: { latitude: lat, longitude: lon, accuracy: precision } } as GeolocationPosition)
    return { geo, leer }
  }

  it("avisa cada lectura dentro de Posadas con alta precisión, sin seguir lecturas viejas", () => {
    const { geo, leer } = geoSeguimiento()
    const alMover = vi.fn()

    seguirUbicacion(geo as unknown as Geolocation, alMover)
    leer(-27.3679, -55.8964, 12)
    leer(-27.369, -55.897, 8)

    expect(geo.watchPosition).toHaveBeenCalledWith(expect.any(Function), expect.any(Function), expect.objectContaining({ enableHighAccuracy: true }))
    expect(alMover).toHaveBeenNthCalledWith(1, { lat: -27.3679, lon: -55.8964, precision: 12 })
    expect(alMover).toHaveBeenNthCalledWith(2, { lat: -27.369, lon: -55.897, precision: 8 })
  })

  it("ignora las lecturas fuera de Posadas", () => {
    const { geo, leer } = geoSeguimiento()
    const alMover = vi.fn()

    seguirUbicacion(geo as unknown as Geolocation, alMover)
    leer(-34.6, -58.38)

    expect(alMover).not.toHaveBeenCalled()
  })

  it("al detenerlo deja de usar el GPS", () => {
    const { geo } = geoSeguimiento()

    const detener = seguirUbicacion(geo as unknown as Geolocation, vi.fn())
    detener()

    expect(geo.clearWatch).toHaveBeenCalledWith(7)
  })
})

describe("debeActualizarCercanos", () => {
  const BUSQUEDA = { lat: -27.3679, lon: -55.8964 }

  it("vuelve a buscar cuando la persona se alejó más de 100 m del punto de la última búsqueda", () => {
    // 0,001° de latitud son unos 111 m.
    expect(debeActualizarCercanos(BUSQUEDA, { lat: -27.3689, lon: -55.8964 })).toBe(true)
  })

  it("no vuelve a buscar con movimientos chicos", () => {
    // Unos 56 m.
    expect(debeActualizarCercanos(BUSQUEDA, { lat: -27.36840, lon: -55.8964 })).toBe(false)
  })
})
