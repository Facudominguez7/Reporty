import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import { AvisoCargaZona } from "./aviso-carga-zona"

const dibujar = (estado: "cargando" | "listo" | "error") =>
  renderToStaticMarkup(createElement(AvisoCargaZona, { estado, onReintentar: vi.fn() }))

describe("AvisoCargaZona", () => {
  it("no muestra nada cuando la zona ya cargó", () => {
    expect(dibujar("listo")).toBe("")
  })

  it("mientras pide, avisa sin interrumpir y de forma accesible", () => {
    const html = dibujar("cargando")
    expect(html).toContain('role="status"')
    expect(html).toContain("Cargando reportes de esta zona")
    expect(html).not.toContain("<button")
  })

  it("si falló, lo dice y ofrece reintentar", () => {
    const html = dibujar("error")
    expect(html).toContain('role="alert"')
    expect(html).toContain("No se pudieron cargar los reportes de esta zona")
    expect(html).toContain(">Reintentar</button>")
  })
})
