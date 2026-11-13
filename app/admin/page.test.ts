/** Regresión del desborde horizontal del panel de administración en pantallas angostas. */
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const pagina = () => readFileSync(new URL("./page.tsx", import.meta.url), "utf8")

describe("panel de administración en el celular", () => {
  it("la grilla de últimos reportes y acciones usa columnas minmax(0, 1fr) para no desbordar", () => {
    expect(pagina()).toContain('<section className="grid grid-cols-1 gap-5 xl:grid-cols-[1.25fr_0.75fr]">')
  })
})
