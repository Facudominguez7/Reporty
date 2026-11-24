"use client"

/**
 * Contenido del mapa por zona (#281): arranca con lo que cargó el servidor y, cada vez que el
 * mapa termina de moverse, pide la zona visible con los filtros de la página.
 */
import { useCallback, useEffect, useRef, useState } from "react"

import type { ContenidoZonaMapa, FiltrosMapa } from "@/database/queries/reportes/mapa-por-zona"
import { alVolverALaApp, crearCargadorZona, obtenerZonaMapa, type EstadoCargaZona } from "@/lib/map/cargador-zona"
import type { ZonaMapa } from "@/lib/map/zona"

/**
 * Mantiene lo que el mapa muestra en la zona visible.
 *
 * @param inicial - Contenido que cargó el servidor para la primera vista.
 * @param filtros - Filtros de la URL; al cambiar se vuelve a pedir la zona actual.
 * @returns `contenido` para dibujar, `alCambiarZona` para pasarle al mapa, `estado` de la
 *   carga (para avisar si está cargando o falló) y `reintentar`.
 */
export function useContenidoZonaMapa(inicial: ContenidoZonaMapa, filtros: FiltrosMapa) {
  const [contenido, setContenido] = useState(inicial)
  const [inicialMostrado, setInicialMostrado] = useState(inicial)
  // Una nueva carga del servidor (por ejemplo, al cambiar filtros) reemplaza lo dibujado.
  if (inicialMostrado !== inicial) {
    setInicialMostrado(inicial)
    setContenido(inicial)
  }

  const [estadoCarga, setEstadoCarga] = useState<EstadoCargaZona>("listo")
  const [cargador] = useState(() =>
    crearCargadorZona({ obtener: obtenerZonaMapa, alCargar: setContenido, alCambiarEstado: setEstadoCarga }),
  )
  // Datos nuevos del servidor: lo recordado de antes puede estar viejo.
  useEffect(() => {
    cargador.olvidar()
  }, [cargador, inicial])
  const ultimaZonaRef = useRef<{ zona: ZonaMapa; zoom: number } | null>(null)
  // `alCambiarZona` es estable y lee los filtros vigentes desde esta ref.
  const filtrosRef = useRef(filtros)
  useEffect(() => {
    filtrosRef.current = filtros
  })

  useEffect(() => () => cargador.cancelar(), [cargador])

  // Con el mapa quieto la zona no se vuelve a pedir: al volver a la app se revalida si venció.
  useEffect(() => alVolverALaApp(cargador.revalidar), [cargador])

  // Con otros filtros, la zona que se está viendo se vuelve a pedir.
  const { search, categoria, estado, prioridad } = filtros
  useEffect(() => {
    const ultima = ultimaZonaRef.current
    if (ultima) cargador.pedir(ultima.zona, ultima.zoom, { search, categoria, estado, prioridad })
  }, [cargador, search, categoria, estado, prioridad])

  const alCambiarZona = useCallback(
    (zona: ZonaMapa, zoom: number) => {
      ultimaZonaRef.current = { zona, zoom }
      cargador.pedir(zona, zoom, filtrosRef.current)
    },
    [cargador],
  )

  return { contenido, alCambiarZona, estado: estadoCarga, reintentar: cargador.reintentar }
}
