"use client"

/**
 * Ubicación de la persona y lo que tiene cerca, al abrir el mapa (#297).
 *
 * Corre el flujo de `iniciarUbicacionAlAbrir` una sola vez por visita y, con la ubicación, pide
 * los cercanos del radio elegido. Después sigue a la persona mientras el mapa está a la vista: el
 * punto se mueve con cada lectura y los cercanos se vuelven a pedir cuando se alejó más de 100 m.
 * Si vuelve a la app después de moverse más de 100 m, pide que el mapa se centre otra vez en ella.
 * Al cambiar el radio o el punto de búsqueda cancela el pedido anterior.
 */
import { useCallback, useEffect, useRef, useState } from "react"

import type { EstadoCercanos } from "@/components/map/panel-cercanos"
import { RADIO_CERCANOS_INICIAL, type ElementoCercano } from "@/lib/map/cercanos"
import {
  debeActualizarCercanos,
  debeCentrarAlVolver,
  iniciarUbicacionAlAbrir,
  pedirCercanos,
  seguirUbicacion,
} from "@/lib/map/ubicacion-al-abrir"
import type { PuntoGeografico } from "@/lib/reportes/duplicados"
import { esUbicacionAproximada, type UbicacionPrecisa } from "@/lib/geolocalizacion/ubicacion-precisa"

/**
 * Mantiene la ubicación de la persona, el radio elegido y los cercanos.
 *
 * @returns `ubicacion` (o `null` si no hay), `aproximada`, `avisoDenegado` y `cerrarAviso`,
 *   `pedidoCentrar` (crece cuando el mapa debe volver a centrarse en la persona), `radio` y `setRadio`, `estado` y `cercanos` de la búsqueda, y `reintentar`.
 */
export function useUbicacionCercana() {
  const [ubicacion, setUbicacion] = useState<UbicacionPrecisa | null>(null)
  // Punto de la última búsqueda de cercanos: solo cambia cuando la persona se alejó más de 100 m.
  const [puntoBusqueda, setPuntoBusqueda] = useState<PuntoGeografico | null>(null)
  const [avisoDenegado, setAvisoDenegado] = useState(false)
  const [radio, setRadio] = useState<number>(RADIO_CERCANOS_INICIAL)
  // Resultado del último pedido que terminó, con la clave del pedido que lo trajo. Mientras la
  // clave vigente no coincide, la búsqueda está cargando (y se siguen mostrando los anteriores).
  const [busqueda, setBusqueda] = useState<{ clave: string; estado: EstadoCercanos; cercanos: ElementoCercano[] }>({
    clave: "",
    estado: "cargando",
    cercanos: [],
  })
  const [intento, setIntento] = useState(0)
  const clave = puntoBusqueda ? `${puntoBusqueda.lat},${puntoBusqueda.lon},${radio},${intento}` : ""

  // Última lectura conocida: al salir de la app queda como referencia para decidir si, al volver,
  // la persona se movió lo suficiente como para centrar el mapa en ella.
  const ultimaRef = useRef<UbicacionPrecisa | null>(null)

  /** Guarda una lectura nueva y mueve el punto de búsqueda si la persona se alejó lo suficiente. */
  const alUbicar = useCallback((nueva: UbicacionPrecisa) => {
    ultimaRef.current = nueva
    setUbicacion(nueva)
    setPuntoBusqueda((anterior) =>
      anterior && !debeActualizarCercanos(anterior, nueva) ? anterior : { lat: nueva.lat, lon: nueva.lon },
    )
  }, [])

  // Una sola corrida por montaje: StrictMode repite los efectos en desarrollo y, sin esto, la
  // primera corrida marcaba el aviso como mostrado y la segunda ya no lo mostraba. Las
  // respuestas no se descartan: si el componente ya no está, React ignora el cambio de estado.
  const iniciadoRef = useRef(false)
  useEffect(() => {
    if (iniciadoRef.current) return
    iniciadoRef.current = true
    void iniciarUbicacionAlAbrir({
      navegador: navigator,
      almacenSesion: window.sessionStorage,
      almacenLocal: window.localStorage,
      alUbicar,
      alAvisarDenegado: () => setAvisoDenegado(true),
    })
  }, [alUbicar])

  // Crece cada vez que el mapa tiene que volver a centrarse en la persona.
  const [pedidoCentrar, setPedidoCentrar] = useState(0)

  // Con la primera ubicación ya dada (el permiso está aceptado), se sigue a la persona. Se apaga al
  // pasar a otra app o pestaña, para no gastar batería, y se retoma al volver.
  const hayUbicacion = ubicacion !== null
  useEffect(() => {
    if (!hayUbicacion || !navigator.geolocation) return
    let detener: (() => void) | null = null
    // Ubicación con la que la persona salió de la app; `null` mientras no salió.
    let alSalir: UbicacionPrecisa | null = null

    /** Recibe cada lectura; la primera después de volver decide si el mapa se centra. */
    const alMover = (nueva: UbicacionPrecisa) => {
      if (alSalir) {
        if (debeCentrarAlVolver(alSalir, nueva)) setPedidoCentrar((valor) => valor + 1)
        alSalir = null
      }
      alUbicar(nueva)
    }

    const actualizar = () => {
      if (document.visibilityState === "visible") {
        detener ??= seguirUbicacion(navigator.geolocation, alMover)
      } else {
        if (detener) alSalir = ultimaRef.current
        detener?.()
        detener = null
      }
    }
    actualizar()
    document.addEventListener("visibilitychange", actualizar)
    return () => {
      document.removeEventListener("visibilitychange", actualizar)
      detener?.()
    }
  }, [hayUbicacion, alUbicar])

  useEffect(() => {
    if (!puntoBusqueda) return
    const control = new AbortController()
    pedirCercanos({ lat: puntoBusqueda.lat, lon: puntoBusqueda.lon, radio }, control.signal)
      .then((cercanos) => setBusqueda({ clave, estado: "listo", cercanos }))
      .catch(() => {
        if (!control.signal.aborted) setBusqueda({ clave, estado: "error", cercanos: [] })
      })
    return () => control.abort()
  }, [puntoBusqueda, radio, clave])

  const reintentar = useCallback(() => setIntento((valor) => valor + 1), [])
  const cerrarAviso = useCallback(() => setAvisoDenegado(false), [])

  return {
    ubicacion,
    aproximada: ubicacion ? esUbicacionAproximada(ubicacion.precision) : false,
    avisoDenegado,
    cerrarAviso,
    pedidoCentrar,
    radio,
    setRadio,
    estado: busqueda.clave === clave ? busqueda.estado : ("cargando" as const),
    cercanos: busqueda.cercanos,
    reintentar,
  }
}
