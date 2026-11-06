import React from "react"
import { expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
vi.mock("./actions", () => ({ editarMascotaAction: vi.fn() }))
import { EditorMascotaAdmin } from "./mascota-admin-editor"

it("renders editable pet fields and state correction with accessible labels", () => {
  const html = renderToStaticMarkup(React.createElement(EditorMascotaAdmin, { mascota: {
    id: 9, tipoAnimal: "perro", descripcion: "Manchas blancas", lat: -34, lon: -56,
    telefono: "555123", estado: "encontrada",
  } }))
  expect(html).toContain('aria-label="Editar publicación de mascota 9"')
  for (const name of ["tipoAnimal", "descripcion", "lat", "lon", "telefono", "estado"]) expect(html).toContain(`name="${name}"`)
  expect(html).toContain('aria-label="Solicitar reemplazo de foto para mascota 9"')
  expect(html).toContain('name="foto"')
  expect(html).toContain("no reemplaza la actual hasta que administración la apruebe")
})
