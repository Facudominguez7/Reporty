import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import type { ElementoCercano } from "@/lib/map/cercanos"
import { PanelCercanos } from "./panel-cercanos"

const CERCANOS: ElementoCercano[] = [
  { tipo: "reporte", id: 7, titulo: "Bache en Uruguay", metros: 90 },
  { tipo: "mascota", id: 3, titulo: "perro", metros: 200 },
  { tipo: "reporte", id: 9, titulo: "Luminaria apagada", metros: 480 },
]

/** Dibuja el panel con los datos dados. */
const dibujar = (props: Partial<Parameters<typeof PanelCercanos>[0]> = {}) =>
  renderToStaticMarkup(
    createElement(PanelCercanos, {
      estado: "listo",
      cercanos: CERCANOS,
      radio: 500,
      aproximada: false,
      onCambiarRadio: vi.fn(),
      onReintentar: vi.fn(),
      ...props,
    }),
  )

describe("PanelCercanos", () => {
  it("cerrado, resume cuántos reportes y mascotas hay cerca", () => {
    const html = dibujar()

    expect(html).toContain("2 reportes cerca tuyo")
    expect(html).toContain("1 mascota perdida")
    expect(html).toContain('aria-expanded="false"')
    expect(html).not.toContain('href="/reportes/7"')
  })

  it("si llegaron 100 (el máximo del servidor), avisa que puede haber más", () => {
    const cien = Array.from({ length: 100 }, (_, i) => ({ tipo: "reporte" as const, id: i + 1, titulo: `R${i}`, metros: i }))

    expect(dibujar({ cercanos: cien })).toContain("100+ reportes cerca tuyo")
    expect(dibujar({ cercanos: cien.slice(0, 99) })).toContain("99 reportes cerca tuyo")
  })

  it("usa el singular con un solo reporte", () => {
    expect(dibujar({ cercanos: [CERCANOS[0]] })).toContain("1 reporte cerca tuyo")
  })

  it("abierto, ofrece los radios de 300 m, 500 m y 1 km y marca el elegido", () => {
    const html = dibujar({ abiertoInicial: true })

    expect(html).toContain('aria-expanded="true"')
    for (const radio of ["300 m", "500 m", "1 km"]) expect(html).toContain(`>${radio}</button>`)
    expect(html).toMatch(/aria-pressed="true"[^>]*>500 m</)
  })

  it("abierto, lista cada elemento con su enlace y su distancia, en orden", () => {
    const html = dibujar({ abiertoInicial: true })

    expect(html).toContain('href="/reportes/7"')
    expect(html).toContain('href="/mascotas/3"')
    expect(html).toContain("Perro perdido")
    expect(html).toContain("a 90 m")
    expect(html.indexOf("/reportes/7")).toBeLessThan(html.indexOf("/mascotas/3"))
    expect(html.indexOf("/mascotas/3")).toBeLessThan(html.indexOf("/reportes/9"))
  })

  it("avisa «Ubicación aproximada» si la precisión supera 50 m", () => {
    expect(dibujar({ aproximada: true })).toContain("Ubicación aproximada")
    expect(dibujar({ aproximada: false })).not.toContain("Ubicación aproximada")
  })

  it("sin nada cerca, lo dice con el radio elegido", () => {
    const html = dibujar({ cercanos: [], radio: 300, abiertoInicial: true })

    expect(html).toContain("0 reportes cerca tuyo")
    expect(html).toContain("No hay reportes ni mascotas perdidas a menos de 300 m")
  })

  it("mientras busca, avisa de forma accesible", () => {
    const html = dibujar({ estado: "cargando", cercanos: [] })

    expect(html).toContain('role="status"')
    expect(html).toContain("Buscando cerca tuyo")
  })

  it("si falló, lo dice y ofrece reintentar", () => {
    const html = dibujar({ estado: "error", cercanos: [], abiertoInicial: true })

    expect(html).toContain("No se pudo buscar cerca tuyo")
    expect(html).toContain(">Reintentar</button>")
  })
})
