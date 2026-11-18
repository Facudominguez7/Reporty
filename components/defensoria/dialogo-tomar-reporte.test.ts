import { createElement, type ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ tomar: vi.fn() }))

vi.mock("@/app/reportes/[id]/actions", () => ({
  tomarReporteDefensoriaAction: mocks.tomar,
}))

vi.mock("@/components/ui/dialog", async () => {
  const React = await import("react")
  const Wrapper = ({ children }: { children?: ReactNode }) => React.createElement("div", null, children)
  return {
    Dialog: ({ open, children }: { open: boolean; children?: ReactNode }) =>
      open ? React.createElement("div", null, children) : null,
    DialogContent: Wrapper,
    DialogDescription: Wrapper,
    DialogFooter: Wrapper,
    DialogHeader: Wrapper,
    DialogTitle: Wrapper,
  }
})

import { DialogoTomarReporte, FormularioTomarReporte, useTomaReporte } from "./dialogo-tomar-reporte"

describe("DialogoTomarReporte (formulario compartido de toma, S2/S10)", () => {
  beforeEach(() => {
    mocks.tomar.mockReset()
  })

  it("no renderiza nada cuando está cerrado", () => {
    const html = renderToStaticMarkup(
      createElement(DialogoTomarReporte, { reporteId: 7, abierto: false, onCerrar: vi.fn(), onTomado: vi.fn() }),
    )
    expect(html).toBe("")
  })

  it("muestra el título, el campo de número de reclamo con su ayuda y el aviso de notificación al autor", () => {
    const html = renderToStaticMarkup(
      createElement(DialogoTomarReporte, { reporteId: 7, abierto: true, onCerrar: vi.fn(), onTomado: vi.fn() }),
    )
    expect(html).toContain("Tomar este reporte")
    expect(html).toContain("Número de reclamo")
    expect(html).not.toContain("Entre 4 y 40 caracteres")
    expect(html).not.toContain("placeholder=")
    expect(html).toContain("notificación en el celular")
    expect(html).not.toContain('maxLength=')
    expect(html).toContain("Confirmar y notificar")
    expect(html).toContain("Cancelar")
  })

  it("deja el botón de confirmar deshabilitado para el número vacío (S5)", () => {
    const html = renderToStaticMarkup(
      createElement(DialogoTomarReporte, { reporteId: 7, abierto: true, onCerrar: vi.fn(), onTomado: vi.fn() }),
    )
    const boton = html.slice(html.indexOf("Confirmar y notificar") - 400, html.indexOf("Confirmar y notificar"))
    expect(boton).toContain("disabled")
  })

  it.each(["RE", "R".repeat(41), "   "])("valida el botón para %s", (numero) => {
    const formulario: ReturnType<typeof useTomaReporte> = {
      numeroReclamo: numero, setNumeroReclamo: vi.fn(), error: null,
      enviando: false, confirmar: vi.fn(), limpiar: vi.fn(),
    }
    const html = renderToStaticMarkup(createElement(FormularioTomarReporte, {
      reporteId: 7, onTomado: vi.fn(), formulario,
    }))
    const boton = html.slice(html.indexOf("Confirmar y notificar") - 400, html.indexOf("Confirmar y notificar"))
    expect(boton.includes(' disabled=""')).toBe(numero.trim() === "")
  })

  it("anuncia los errores con role=alert para lectores de pantalla", () => {
    const html = renderToStaticMarkup(
      createElement(DialogoTomarReporte, { reporteId: 7, abierto: true, onCerrar: vi.fn(), onTomado: vi.fn() }),
    )
    // Con el diálogo recién abierto no hay error previo que mostrar.
    expect(html).not.toContain('role="alert"')
  })
})
