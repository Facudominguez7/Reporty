/** Aviso de la señal «No existe» debajo de los botones de voto: textos, sin números. */
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { AvisoSenalNoExiste } from "./aviso-senal-no-existe"

/**
 * Renderiza el aviso con la señal y el permiso de voto pedidos.
 *
 * @param senal - Señal calculada.
 * @param puedeVotar - Si el botón «No existe» está disponible para quien mira.
 */
function render(senal: Parameters<typeof AvisoSenalNoExiste>[0]["senal"], puedeVotar = true) {
  return renderToStaticMarkup(createElement(AvisoSenalNoExiste, { senal, puedeVotar }))
}

describe("AvisoSenalNoExiste", () => {
  it("sin señal no dibuja nada", () => {
    expect(render("ninguna")).toBe("")
  })

  it("antes de votar invita a sumar el voto", () => {
    const html = render("otros")
    expect(html).toContain('role="status"')
    expect(html).toContain("Otros vecinos también lo marcaron como «No existe».")
    expect(html).toContain("Si vos tampoco lo ves, sumá tu voto.")
  })

  it("no invita a votar a quien no puede votar «No existe»", () => {
    const html = render("otros", false)
    expect(html).toContain("Otros vecinos también lo marcaron como «No existe».")
    expect(html).not.toContain("sumá tu voto")
  })

  it("después de votar con otros vecinos explica la revisión sin números", () => {
    const html = render("vos_y_otros")
    expect(html).toContain("Vos y otros vecinos lo marcaron.")
    expect(html).toContain("Si se juntan suficientes votos, un administrador lo revisa.")
    expect(html.replace(/<[^>]*>/g, "")).not.toMatch(/\d/)
  })

  it("si solo votaste vos, confirma el voto", () => {
    expect(render("solo_vos")).toContain("Tu voto quedó registrado.")
  })

  it("en revisión avisa que un administrador lo revisa", () => {
    const html = render("en_revision")
    expect(html).toContain("Varios vecinos dicen que este problema no existe.")
    expect(html).toContain("Un administrador lo está revisando.")
  })
})
