import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock("./reparaciones-actions", () => ({ resolverEvidenciaColaAction: vi.fn() }))

import { ColaEvidenciasEnVerificacion, ColaEvidenciasValidadas } from "./cola-reparaciones"

const evidencia = {
  evidenciaId: "22222222-2222-4222-8222-222222222222",
  reporteId: 9,
  titulo: "Bache",
  comentario: "Reparado",
  publicadaAt: "2026-11-02T10:00:00Z",
  confirmaciones: 2,
  impugnaciones: 0,
  impugnacionesPendientes: 0,
  fotoEvidencia: null,
  miniaturaEvidencia: null,
  fotoReporte: null,
  miniaturaReporte: null,
}

describe("colas de reparaciones", () => {
  it("renderiza evidencias en verificación sin controles de impugnación", () => {
    const html = renderToStaticMarkup(createElement(ColaEvidenciasEnVerificacion, { evidencias: [evidencia], umbral: 3 }))
    expect(html).toContain("En verificación")
    expect(html).toContain("Confirmaciones")
    expect(html).not.toContain("Impugnación")
  })

  it("renderiza reparaciones validadas", () => {
    const html = renderToStaticMarkup(createElement(ColaEvidenciasValidadas, { validadas: [{ ...evidencia, confirmaciones: 3 }], umbral: 3 }))
    expect(html).toContain("Reparada")
    expect(html).toContain("Revertir reparación")
  })
})
