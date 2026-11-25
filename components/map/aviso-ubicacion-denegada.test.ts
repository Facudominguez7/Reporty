import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import { AvisoUbicacionDenegada } from "./aviso-ubicacion-denegada"

describe("AvisoUbicacionDenegada", () => {
  it("explica cómo activar la ubicación y se puede descartar", () => {
    const html = renderToStaticMarkup(createElement(AvisoUbicacionDenegada, { onCerrar: vi.fn() }))

    expect(html).toContain('role="status"')
    expect(html).toContain("Activá la ubicación")
    expect(html).toContain("permisos del sitio")
    expect(html).toContain('aria-label="Cerrar aviso de ubicación"')
  })
})
