import * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { EstadoMascotas } from "./estado-mascotas"

describe("pet status pill styling", () => {
  it("uses secondary for all, destructive for lost, and primary for found", () => {
    const render = (estadoMascota: string) => renderToStaticMarkup(React.createElement(EstadoMascotas, { search: `vista=mascotas&estadoMascota=${estadoMascota}` }))
    expect(render("all")).toContain("bg-secondary text-secondary-foreground")
    expect(render("perdida")).toContain("bg-destructive text-destructive-foreground")
    expect(render("encontrada")).toContain("bg-primary text-primary-foreground")
  })
})
