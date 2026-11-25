"use client"

/**
 * Ubicación de la persona y lo que tiene cerca, al abrir el mapa (#297).
 *
 * Corre el flujo de `iniciarUbicacionAlAbrir` una sola vez por visita y, con la ubicación, pide
 * los cercanos del radio elegido. Al cambiar el radio cancela el pedido anterior.
 */
import { useCallback, useEffect, useRef, useState } from "react"

import type { EstadoCercanos } from "@/components/map/panel-cercanos"
import { RADIO_CERCANOS_INICIAL, type ElementoCercano } from "@/lib/map/cercanos"
import { iniciarUbicacionAlAbrir, pedirCercanos } from "@/lib/map/ubicacion-al-abrir"
import { esUbicacionAproximada, type UbicacionPrecisa } from "@/lib/geolocalizacion/ubicacion-precisa"

/**
 * Mantiene la ubicación de la persona, el radio elegido y los cercanos.
 *
 * @returns `ubicacion` (o `null` si no hay), `aproximada`, `avisoDenegado` y `cerrarAviso`,
 *   `radio` y `setRadio`, `estado` y `cercanos` de la búsqueda, y `reintentar`.
 */
export function useUbicacionCercana() {
  const [ubicacion, setUbicacion] = useState<UbicacionPrecisa | null>(null)
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
  const clave = ubicacion ? `${ubicacion.lat},${ubicacion.lon},${radio},${intento}` : ""

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
      alUbicar: setUbicacion,
      alAvisarDenegado: () => setAvisoDenegado(true),
    })
  }, [])

  useEffect(() => {
    if (!ubicacion) return
    const control = new AbortController()
    pedirCercanos({ lat: ubicacion.lat, lon: ubicacion.lon, radio }, control.signal)
      .then((cercanos) => setBusqueda({ clave, estado: "listo", cercanos }))
      .catch(() => {
        if (!control.signal.aborted) setBusqueda({ clave, estado: "error", cercanos: [] })
      })
    return () => control.abort()
  }, [ubicacion, radio, clave])

  const reintentar = useCallback(() => setIntento((valor) => valor + 1), [])
  const cerrarAviso = useCallback(() => setAvisoDenegado(false), [])

  return {
    ubicacion,
    aproximada: ubicacion ? esUbicacionAproximada(ubicacion.precision) : false,
    avisoDenegado,
    cerrarAviso,
    radio,
    setRadio,
    estado: busqueda.clave === clave ? busqueda.estado : ("cargando" as const),
    cercanos: busqueda.cercanos,
    reintentar,
  }
}
