import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { Building2, MessageCircle } from "lucide-react"
import { describe, expect, it, vi } from "vitest"

import { AccionesFlotantes, type AccionFlotante } from "./acciones-flotantes"
import { AvisoComentar, debeMostrarAvisoComentar } from "./aviso-comentar"

const acciones: AccionFlotante[] = [
  { clave: "contactos", etiqueta: "Avisar a un organismo", icono: Building2, onSeleccionar: vi.fn() },
  { clave: "comentar", etiqueta: "Comentar", icono: MessageCircle, onSeleccionar: vi.fn() },
]

describe("aviso para aprender a comentar", () => {
  it("sólo aparece la primera vez y cuando se puede comentar", () => {
    expect(debeMostrarAvisoComentar(["contactos", "comentar"], false)).toBe(true)
    expect(debeMostrarAvisoComentar(["contactos", "comentar"], true)).toBe(false)
    expect(debeMostrarAvisoComentar(["contactos", "reparacion"], false)).toBe(false)
  })

  it("explica que el lápiz abre el comentario y se cierra con «Entendido»", () => {
    const html = renderToStaticMarkup(createElement(AvisoComentar, { onCerrar: () => {} }))

    expect(html).toContain('aria-label="Cómo comentar"')
    expect(html).toContain("lápiz")
    expect(html).toContain("Entendido")
  })

  it("se muestra junto al botón flotante cerrado y desaparece al abrir el menú", () => {
    const aviso = createElement(AvisoComentar, { onCerrar: () => {} })
    const cerrado = renderToStaticMarkup(createElement(AccionesFlotantes, { acciones, abierta: false, onCambiarAbierta: () => {}, aviso }))
    const abierto = renderToStaticMarkup(createElement(AccionesFlotantes, { acciones, abierta: true, onCambiarAbierta: () => {}, aviso }))

    expect(cerrado).toContain("Cómo comentar")
    expect(abierto).not.toContain("Cómo comentar")
  })
})
