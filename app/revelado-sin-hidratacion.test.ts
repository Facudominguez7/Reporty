import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

/**
 * El revelado de las páginas es solo CSS. Antes un script del layout agregaba clases a los
 * bloques de `.page-container` después del `load`; si React todavía estaba hidratando ese
 * contenido, encontraba un `className` distinto y daba un error de hidratación.
 */
describe("revelado de páginas sin tocar el DOM", () => {
  const layout = readFileSync(new URL("./layout.tsx", import.meta.url), "utf8")
  const estilos = readFileSync(new URL("./globals.css", import.meta.url), "utf8")

  it("el layout no monta un script que cambie las clases del contenido", () => {
    expect(layout).not.toContain("ScrollReveal")
    expect(estilos).not.toContain(".scroll-reveal")
  })

  it("las páginas y las pantallas de ingreso entran con la animación CSS", () => {
    expect(estilos).toMatch(/\.page-container > \*,\s*body:not\(:has\(\.admin-workspace\)\) \.auth-shell > \* \{\s*animation: reporty-reveal-up/)
  })
})
