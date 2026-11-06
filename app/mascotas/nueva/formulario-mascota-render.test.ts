import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("next/dynamic", () => ({ default: () => () => null }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock("./actions", () => ({ crearMascotaAction: vi.fn() }))

import { FormularioMascota } from "./formulario-mascota"

describe("pet form initial render", () => {
  it("shows required guidance and disables submission until the fields are complete", () => {
    const html = renderToStaticMarkup(createElement(FormularioMascota))
    expect(html).toContain("Agregá una foto de la mascota")
    expect(html).toContain("Cargar imagen")
    expect(html).toContain("1 imagen · JPG, PNG o WebP")
    expect(html).toMatch(/<input[^>]*id="foto-mascota"[^>]*type="file"[^>]*aria-required="true"[^>]*aria-describedby="foto-ayuda foto-error"/)
    expect(html).toContain("border-dashed")
    expect(html).toContain("Adjuntá una foto para publicar la mascota.")
    expect(html).toContain("Seleccioná el tipo de animal.")
    expect(html).toMatch(/<button[^>]*id="tipo-animal"[^>]*aria-describedby="tipo-animal-error"/)
    expect(html).toContain('data-slot="select-trigger"')
    expect(html).toContain("Seleccioná una opción")
    expect(html).toContain("Completá la descripción de la mascota.")
    expect(html).toContain("Completá el teléfono de contacto.")
    expect(html).toContain('pattern="[0-9]+"')
    expect(html).toContain("Ingresá solo números")
    expect(html).toContain("Confirmá que entendés que el teléfono será público.")
    expect(html).toContain("Seleccioná un punto en el mapa.")
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled/)
    expect(html).not.toMatch(/\(obligatori[oa]\)/)
  })
})
