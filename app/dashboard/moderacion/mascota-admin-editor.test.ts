import { expect, it, vi } from "vitest"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
vi.mock("./actions", () => ({ editarMascotaAction: vi.fn() }))
import { EditorMascotaAdmin } from "./mascota-admin-editor"

it("renders editable pet fields and state correction with accessible labels", () => {
  const html = renderToStaticMarkup(createElement(EditorMascotaAdmin, { mascota: {
    id: 9, tipoAnimal: "perro", descripcion: "Manchas blancas", lat: -34, lon: -56,
    telefono: "555123", estado: "encontrada",
  } }))
  expect(html).toContain('aria-label="Editar publicación de mascota 9"')
  expect(html).toContain('name="tipoAnimal"')
  expect(html).toContain('name="descripcion"')
  expect(html).toContain('name="lat"')
  expect(html).toContain('name="lon"')
  expect(html).toContain('name="telefono"')
  expect(html).toContain('pattern="[0-9]+"')
  expect(html).toContain("Ingresá solo números")
  expect(html).toContain('name="estado"')
  expect(html).not.toMatch(/reemplaz|name="foto"|Solicitar cambio de foto/i)
})
