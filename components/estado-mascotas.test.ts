import * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { EstadoMascotas } from "./estado-mascotas"

describe("pet status pill styling", () => {
  it("uses secondary for all, destructive for lost, and primary for found", () => {
    const render = (estadoMascota: string) => renderToStaticMarkup(React.createElement(EstadoMascotas, { search: `vista=mascotas&estadoMascota=${estadoMascota}`, counts: { all: 18, lost: 12, found: 6 } }))
    expect(render("all")).toContain("bg-secondary text-secondary-foreground")
    expect(render("perdida")).toContain("bg-destructive text-destructive-foreground")
    expect(render("encontrada")).toContain("bg-primary text-primary-foreground")
    expect(render("all")).toContain("Todos<span class=\"text-xs font-normal opacity-70\">(18)</span>")
    expect(render("all")).toContain("(18)")
    expect(render("all")).toContain("Perdida<span class=\"text-xs font-normal opacity-70\">(12)</span>")
    expect(render("all")).toContain("Encontrada<span class=\"text-xs font-normal opacity-70\">(6)</span>")
  })
})
