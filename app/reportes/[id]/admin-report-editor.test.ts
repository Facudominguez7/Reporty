import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { expect, it } from "vitest"

import { AdminInlineField, AdminReportEditActions, AdminReportPhotoControls } from "./admin-report-editor"

const renderField = (editing: boolean) => renderToStaticMarkup(
  createElement(AdminInlineField<string>, {
    label: "título",
    value: "Reporte",
    editing,
    display: (value) => createElement("span", null, value),
    editor: () => createElement("input", { "aria-label": "Título" }),
    onChange: () => {},
  }),
)

it("renders report values without per-field pencils or save controls outside global edit mode", () => {
  const markup = renderField(false)
  expect(markup).toContain("Reporte")
  expect(markup).not.toContain("Editar título")
  expect(markup).not.toContain("Guardar")
  expect(markup).not.toContain("Cancelar")
})

it("reveals controlled field editors without per-field Save/Cancel buttons", () => {
  const markup = renderField(true)
  expect(markup).toContain('aria-label="Título"')
  expect(markup).toContain("título")
  expect(markup).not.toContain("Guardar")
  expect(markup).not.toContain("Cancelar")
})

it("provides exactly one global Save and Cancel pair", () => {
  const markup = renderToStaticMarkup(createElement(AdminReportEditActions, {
    saving: false,
    onSave: () => {},
    onCancel: () => {},
  }))

  expect(markup.match(/Guardar cambios/g)).toHaveLength(1)
  expect(markup.match(/Cancelar/g)).toHaveLength(1)
})

it("stages photo replacement and removal without per-photo Save/Cancel controls", () => {
  const markup = renderToStaticMarkup(createElement(AdminReportPhotoControls, {
    fotoId: 7,
    index: 0,
    draft: { file: null, remove: false, version: 0 },
    onChange: () => {},
  }))

  expect(markup).toContain('type="file"')
  expect(markup).toContain("Reemplazar foto 1")
  expect(markup).toContain("Quitar foto")
  expect(markup).not.toContain("Guardar")
  expect(markup).not.toContain("Cancelar")
})

it("marks photo removal as pending until the global save", () => {
  const markup = renderToStaticMarkup(createElement(AdminReportPhotoControls, {
    fotoId: 7,
    index: 0,
    draft: { file: null, remove: true, version: 1 },
    onChange: () => {},
  }))

  expect(markup).toContain("Conservar foto")
  expect(markup).toContain("Se quitará al guardar los cambios.")
})
