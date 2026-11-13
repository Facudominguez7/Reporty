import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }))
vi.mock("@/app/cuenta/actions", () => ({ eliminarCuentaAction: vi.fn() }))

import { AvisoEliminacionCuenta } from "./aviso-eliminacion-cuenta"
import { EliminarCuentaSection } from "./eliminar-cuenta-section"
import { confirmaEliminacion, DATOS_QUE_SE_CONSERVAN, DATOS_QUE_SE_ELIMINAN } from "@/lib/cuenta/eliminacion"

describe("aviso de eliminación de cuenta", () => {
  it("avisa que no se puede deshacer y lista todo lo que se borra y lo que se conserva", () => {
    const html = renderToStaticMarkup(createElement(AvisoEliminacionCuenta))

    expect(html).toContain("Se borra para siempre y no se puede deshacer")
    for (const dato of [...DATOS_QUE_SE_ELIMINAN, ...DATOS_QUE_SE_CONSERVAN]) {
      expect(html).toContain(dato)
    }
    expect(html).toContain("Todos los reportes que publicaste")
    expect(html).toContain("Las mascotas que publicaste")
  })
})

describe("EliminarCuentaSection", () => {
  it("muestra el botón para abrir la confirmación", () => {
    const html = renderToStaticMarkup(createElement(EliminarCuentaSection))

    expect(html).toContain("Eliminar cuenta")
    expect(html).toContain('aria-label="Eliminar cuenta"')
  })
})

describe("confirmaEliminacion", () => {
  it("solo confirma con la palabra ELIMINAR", () => {
    expect(confirmaEliminacion("ELIMINAR")).toBe(true)
    expect(confirmaEliminacion(" eliminar ")).toBe(true)
    expect(confirmaEliminacion("ELIMINA")).toBe(false)
    expect(confirmaEliminacion("")).toBe(false)
  })
})
