import { createElement, type ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

// El mapa real es Leaflet en el navegador; acá alcanza con ver qué datos lo acompañan.
vi.mock("next/dynamic", () => ({
  default: () => ({ lat, lon }: { lat: number; lon: number }) =>
    createElement("div", { "data-mini-mapa": `${lat},${lon}` }),
}))
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) =>
    createElement("a", { href, ...props }, children),
}))

import { ContenidoUbicacion, FranjaUbicacion, formatearCoordenadas } from "./ubicacion-reporte"

const LAT = -27.36708
const LON = -55.8961

describe("coordenadas legibles", () => {
  it("usa coma decimal y cinco decimales, sin inventar una dirección", () => {
    expect(formatearCoordenadas(LAT, LON)).toBe("-27,36708 · -55,89610")
  })
})

describe("franja de ubicación", () => {
  it("resume la ubicación real del reporte sobre el contenido", () => {
    const html = renderToStaticMarkup(createElement(FranjaUbicacion, { lat: LAT, lon: LON, onVerUbicacion: () => {} }))

    expect(html).toContain("Ubicación")
    expect(html).toContain("-27,36708 · -55,89610")
    expect(html).not.toContain("Av. Costanera")
  })

  it("muestra el mapa real del reporte en miniatura, sin inventar una dirección", () => {
    const html = renderToStaticMarkup(createElement(FranjaUbicacion, { lat: LAT, lon: LON, onVerUbicacion: () => {} }))

    expect(html).toContain(`data-mini-mapa="${LAT},${LON}"`)
    expect(html).toContain("data-vista-previa-ubicacion")
  })

  it("deja la miniatura fuera del alcance del puntero y del lector de pantalla", () => {
    const html = renderToStaticMarkup(createElement(FranjaUbicacion, { lat: LAT, lon: LON, onVerUbicacion: () => {} }))
    const vista = html.slice(html.indexOf("data-vista-previa-ubicacion"), html.indexOf("<button"))

    expect(vista).toContain("pointer-events-none")
    expect(vista).toContain('aria-hidden="true"')
  })

  it("saca del recorrido con Tab los enlaces internos de la miniatura decorativa", () => {
    const html = renderToStaticMarkup(createElement(FranjaUbicacion, { lat: LAT, lon: LON, onVerUbicacion: () => {} }))
    const apertura = html.slice(html.lastIndexOf("<div", html.indexOf("data-vista-previa-ubicacion")), html.indexOf(">", html.indexOf("data-vista-previa-ubicacion")))

    // `aria-hidden` y `pointer-events-none` no impiden el foco por teclado: `inert` sí.
    expect(apertura).toContain('inert=""')
  })

  it("ofrece una única entrada directa al mapa, sin anidar la vista previa dentro del botón", () => {
    const html = renderToStaticMarkup(createElement(FranjaUbicacion, { lat: LAT, lon: LON, onVerUbicacion: () => {} }))

    expect(html.split("<button").length - 1).toBe(1)
    expect(html).toContain('type="button"')
    expect(html).toContain("Ver en mapa")
    // La vista previa aparece antes del botón: el mapa nunca queda anidado en el control.
    expect(html.indexOf("data-vista-previa-ubicacion")).toBeLessThan(html.indexOf("<button"))
    expect(html.slice(html.indexOf("<button"))).not.toContain("data-mini-mapa")
  })

  it("dice que no hay ubicación y no ofrece mapa cuando faltan las coordenadas", () => {
    const html = renderToStaticMarkup(createElement(FranjaUbicacion, { lat: null, lon: null, onVerUbicacion: () => {} }))

    expect(html).toContain("Ubicación no disponible")
    expect(html).not.toContain("data-mini-mapa")
    expect(html).not.toContain("<button")
  })
})

describe("contenido de la hoja de ubicación", () => {
  it("muestra el mapa del reporte y el acceso al mapa completo", () => {
    const html = renderToStaticMarkup(createElement(ContenidoUbicacion, { lat: LAT, lon: LON }))

    expect(html).toContain(`data-mini-mapa="${LAT},${LON}"`)
    expect(html).toContain("-27,36708 · -55,89610")
    expect(html).toContain('href="/mapa"')
    expect(html).toContain("Ver en mapa completo")
  })

  it("no pinta un mapa vacío cuando faltan las coordenadas", () => {
    const html = renderToStaticMarkup(createElement(ContenidoUbicacion, { lat: null, lon: null }))

    expect(html).not.toContain("data-mini-mapa")
    expect(html).toContain("no tiene coordenadas")
  })
})
