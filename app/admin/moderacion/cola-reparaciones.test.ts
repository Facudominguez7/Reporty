import { createElement, type ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ refresh: vi.fn(), resolverImpugnacion: vi.fn(), resolverEvidencia: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => createElement("a", { href, ...props }, children),
}))
vi.mock("./reparaciones-actions", () => ({
  resolverImpugnacionColaAction: mocks.resolverImpugnacion,
  resolverEvidenciaColaAction: mocks.resolverEvidencia,
}))

import { ColaEvidenciasEnVerificacion, ColaEvidenciasValidadas, ColaImpugnaciones } from "./cola-reparaciones"

const contadores = { confirmaciones: 2, impugnaciones: 1, impugnacionesPendientes: 1 }
const impugnacion = {
  verificacionId: "11111111-1111-4111-8111-111111111111",
  evidenciaId: "22222222-2222-4222-8222-222222222222",
  reporteId: 9,
  titulo: "Bache en Av. Uruguay y Bolívar",
  comentario: "Ya lo arreglaron",
  motivo: "La vereda sigue rota",
  creadoAt: "2026-11-01T10:00:00Z",
  ...contadores,
}
const evidencia = {
  evidenciaId: impugnacion.evidenciaId,
  reporteId: 9,
  titulo: impugnacion.titulo,
  comentario: impugnacion.comentario,
  publicadaAt: "2026-11-02T10:00:00Z",
  ...contadores,
}

beforeEach(() => vi.clearAllMocks())

describe("tarjetas de la cola de reparaciones", () => {
  it("muestra el motivo de la impugnación, los contadores y sus dos decisiones", () => {
    const html = renderToStaticMarkup(createElement(ColaImpugnaciones, { impugnaciones: [impugnacion], umbral: 3 }))

    expect(html).toContain("La vereda sigue rota")
    expect(html).toContain("Ya lo arreglaron")
    expect(html).toContain("2 de 3")
    expect(html).toContain("1 en total")
    expect(html).toContain("Aceptar impugnación")
    expect(html).toContain("Descartar impugnación")
    expect(html).toContain('href="/reportes/9"')
    expect(html).not.toMatch(/usuario|autor|email|correo/i)
  })

  it("ofrece aprobar o rechazar una evidencia en verificación", () => {
    const html = renderToStaticMarkup(createElement(ColaEvidenciasEnVerificacion, { evidencias: [evidencia], umbral: 3 }))

    expect(html).toContain("En verificación")
    expect(html).toContain("Aprobar reparación")
    expect(html).toContain("Rechazar evidencia")
    expect(html).not.toMatch(/usuario|autor|email|correo/i)
  })

  it("ofrece revertir una reparación validada", () => {
    const html = renderToStaticMarkup(createElement(ColaEvidenciasValidadas, { validadas: [evidencia], umbral: 3 }))

    expect(html).toContain("Reparada")
    expect(html).toContain("Revertir reparación y devolver el reporte a Pendiente")
    expect(html).not.toContain("Aprobar reparación")
  })

  it("cae al texto neutro cuando la impugnación no trae motivo", () => {
    const html = renderToStaticMarkup(createElement(ColaImpugnaciones, { impugnaciones: [{ ...impugnacion, motivo: "" }], umbral: 3 }))

    expect(html).toContain("Sin motivo registrado.")
  })
})
