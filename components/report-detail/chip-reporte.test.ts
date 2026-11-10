import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { ChipReporte, tonoEstado, tonoPrioridad } from "./chip-reporte"

describe("chip de dato del reporte", () => {
  it("muestra el valor en una sola línea y anuncia el rótulo sólo a lectores de pantalla", () => {
    const html = renderToStaticMarkup(createElement(ChipReporte, { etiqueta: "Prioridad", valor: "Alta", tono: tonoPrioridad("Alta") }))

    expect(html).toContain('<span class="sr-only">Prioridad: </span>')
    expect(html).toContain("Alta")
    expect(html).toContain("whitespace-nowrap")
    expect(html).not.toContain("uppercase")
  })

  it("tiñe el fondo y el texto con el tono del valor, no con un color sólido", () => {
    const html = renderToStaticMarkup(createElement(ChipReporte, { etiqueta: "Estado", valor: "Pendiente", tono: tonoEstado("Pendiente") }))

    expect(html).toContain("--tono-chip:var(--semantic-warning)")
    expect(html).toContain("bg-[color-mix(in_oklch,var(--tono-chip)_16%,transparent)]")
  })

  it("elige el tono de cada prioridad y estado, con un neutro para valores desconocidos", () => {
    expect(tonoPrioridad("Alta")).toBe("var(--priority-high)")
    expect(tonoPrioridad("Media")).toBe("var(--priority-medium)")
    expect(tonoPrioridad("Baja")).toBe("var(--priority-low)")
    expect(tonoEstado("Reparado")).toBe("var(--primary)")
    expect(tonoEstado("Pendiente")).toBe("var(--semantic-warning)")
    expect(tonoEstado("Rechazado")).toBe("var(--destructive)")
    expect(tonoPrioridad("Otra")).toBe("var(--muted-foreground)")
    expect(tonoEstado("Otro")).toBe("var(--muted-foreground)")
  })
})
