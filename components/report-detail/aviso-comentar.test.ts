import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { Camera } from "lucide-react"
import { describe, expect, it, vi } from "vitest"

import { AccionesFlotantes, type AccionFlotante } from "./acciones-flotantes"
import { AvisoComentar, debeMostrarAvisoComentar } from "./aviso-comentar"

const acciones: AccionFlotante[] = [
  { clave: "reparacion", etiqueta: "¿Ya lo arreglaron?", icono: Camera, onSeleccionar: vi.fn() },
]

describe("aviso para informar una reparación", () => {
  it("sólo aparece la primera vez y cuando se puede comentar", () => {
    expect(debeMostrarAvisoComentar(["reparacion"], false)).toBe(true)
    expect(debeMostrarAvisoComentar(["reparacion"], true)).toBe(false)
    expect(debeMostrarAvisoComentar([], false)).toBe(false)
  })

  it("explica el botón de reparación y se cierra con «Entendido»", () => {
    const html = renderToStaticMarkup(createElement(AvisoComentar, { onCerrar: () => {} }))

    expect(html).toContain('aria-label="Cómo informar una reparación"')
    expect(html).toContain("informar una reparación")
    expect(html).toContain("Entendido")
  })

  it("se muestra junto al botón flotante cerrado y desaparece al abrir el menú", () => {
    const aviso = createElement(AvisoComentar, { onCerrar: () => {} })
    const cerrado = renderToStaticMarkup(createElement(AccionesFlotantes, { acciones, abierta: false, onCambiarAbierta: () => {}, aviso }))
    const abierto = renderToStaticMarkup(createElement(AccionesFlotantes, { acciones, abierta: true, onCambiarAbierta: () => {}, aviso }))

    expect(cerrado).toContain("Cómo informar una reparación")
    expect(abierto).not.toContain("Cómo informar una reparación")
  })
})
