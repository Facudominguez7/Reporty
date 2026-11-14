import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import PrivacidadPage from "../privacidad/page"
import EliminarCuentaPage, { metadata } from "./page"
import { DATOS_QUE_SE_ELIMINAN } from "@/lib/cuenta/eliminacion"

const html = renderToStaticMarkup(createElement(EliminarCuentaPage))

describe("página pública de eliminación de cuenta", () => {
  it("se publica en /eliminar-cuenta con título propio", () => {
    expect(metadata.alternates?.canonical).toBe("/eliminar-cuenta")
    expect(String(metadata.title)).toContain("Eliminar tu cuenta")
  })

  it("explica los pasos dentro de la app para cuentas e invitados", () => {
    expect(html).toContain('href="/dashboard"')
    expect(html).toContain('href="/mis-reportes"')
    expect(html).toContain("ELIMINAR")
  })

  it("avisa qué se borra, usando la misma lista que el diálogo", () => {
    for (const dato of DATOS_QUE_SE_ELIMINAN) expect(html).toContain(dato)
  })

  it("ofrece pedir la eliminación por email a quien no puede entrar a la app", () => {
    expect(html).toContain('href="mailto:contacto@reporty.com.ar"')
  })
})

describe("política de privacidad", () => {
  it("dice que la cuenta se elimina desde la app y enlaza a /eliminar-cuenta", () => {
    const privacidad = renderToStaticMarkup(createElement(PrivacidadPage))

    expect(privacidad).toContain('href="/eliminar-cuenta"')
    expect(privacidad).toContain("Podés eliminar tu cuenta cuando quieras desde la app")
  })
})
