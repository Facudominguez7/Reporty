"use client"

import { useEffect, useRef } from "react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { MAP_TILE_ATTRIBUTION, MAP_TILE_URL } from "@/lib/map/initial-view"
import { TRAMOS_BARRIO, tramoDeBarrio, type BarrioConReportes } from "@/lib/metricas/metricas-barrios"

/**
 * Mapa de los barrios de Posadas pintados según cuántos reportes tienen, con el nombre y el total
 * de cada uno al pasar el puntero o tocarlo.
 *
 * @param barrios - Barrios con su geometría; los que no la tienen no se dibujan.
 */
export function MapaBarrios({ barrios }: { barrios: BarrioConReportes[] }) {
  const contenedorRef = useRef<HTMLDivElement>(null)
  const cantidadPorTramo = TRAMOS_BARRIO.map((_, indice) => barrios.filter((b) => tramoDeBarrio(b.total) === indice).length)
  const masReportes = barrios[0]

  useEffect(() => {
    const contenedor = contenedorRef.current
    if (!contenedor) return
    let mapa: import("leaflet").Map | null = null
    let cancelado = false

    import("leaflet").then((L) => {
      if (cancelado) return

      mapa = L.map(contenedor, { scrollWheelZoom: false, zoomControl: true, zoomSnap: 0.25 })
      L.tileLayer(MAP_TILE_URL, { attribution: MAP_TILE_ATTRIBUTION, maxZoom: 19, opacity: 0.55 }).addTo(mapa)

      const capa = L.featureGroup()
      // Encuadra los barrios con reportes: con los 263 el mapa queda demasiado lejos de la ciudad.
      const conReportes = L.featureGroup()
      for (const barrio of barrios) {
        if (!barrio.geometria) continue
        const poligono = L.geoJSON(barrio.geometria as Parameters<typeof L.geoJSON>[0], {
          // El color lo pone la clase `mapa-barrio-<tramo>` de globals.css, que sigue al tema aunque
          // la hoja de estilos llegue después de dibujar; el atributo es el respaldo.
          style: {
            className: `mapa-barrio mapa-barrio-${tramoDeBarrio(barrio.total)}`,
            fillColor: TRAMOS_BARRIO[tramoDeBarrio(barrio.total)].respaldo,
            fillOpacity: 0.85,
            color: "#ffffff",
            weight: 1,
          },
        })
        // El nombre viene de datos externos: se arma con nodos de texto, nunca como HTML.
        const etiqueta = document.createElement("span")
        const nombre = document.createElement("strong")
        nombre.textContent = barrio.nombre
        etiqueta.append(nombre, document.createTextNode(` · ${barrio.total} ${barrio.total === 1 ? "reporte" : "reportes"}`))
        poligono.bindTooltip(etiqueta, { sticky: true })
        capa.addLayer(poligono)
        if (barrio.total > 0) conReportes.addLayer(poligono)
      }
      capa.addTo(mapa)
      const limites = conReportes.getLayers().length > 0 ? conReportes.getBounds() : capa.getBounds()
      if (limites.isValid()) mapa.fitBounds(limites, { padding: [4, 4] })
    })

    return () => {
      cancelado = true
      mapa?.remove()
    }
  }, [barrios])

  return (
    <Card className="min-w-0 flex-[1_1_420px]">
      <CardHeader className="space-y-1">
        <CardTitle className="text-lg">Mapa por barrio</CardTitle>
        <CardDescription>Cada barrio pintado según cuántos reportes tiene.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* El ranking de al lado es la versión en texto; este resumen la acompaña para lectores de pantalla. */}
        <p className="sr-only">
          {masReportes && masReportes.total > 0
            ? `El barrio con más reportes es ${masReportes.nombre}, con ${masReportes.total}; ${cantidadPorTramo[0]} barrios no tienen reportes.`
            : "Todavía no hay reportes dentro de los barrios."}
        </p>
        <div ref={contenedorRef} className="relative z-0 h-[420px] w-full overflow-hidden rounded-[var(--radius)] bg-muted" />
        <div className="space-y-2">
          <div className="grid grid-cols-5 gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
            {TRAMOS_BARRIO.map((tramo) => (
              <span key={tramo.etiqueta} className="h-2.5" style={{ background: `var(${tramo.color.slice(4, -1)}, ${tramo.respaldo})` }} />
            ))}
          </div>
          <ul className="grid grid-cols-5 gap-0.5 text-xs text-muted-foreground">
            {TRAMOS_BARRIO.map((tramo, indice) => (
              <li key={tramo.etiqueta}>
                {tramo.etiqueta}
                <br />
                {cantidadPorTramo[indice]} {cantidadPorTramo[indice] === 1 ? "barrio" : "barrios"}
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  )
}
