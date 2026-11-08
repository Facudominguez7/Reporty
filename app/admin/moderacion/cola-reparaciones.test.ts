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

import {
  ColaEvidenciasEnVerificacion,
  ColaEvidenciasValidadas,
  ColaImpugnaciones,
  PanelCancelarRevision,
} from "./cola-reparaciones"

const BUCKET = "https://proyecto.supabase.co/storage/v1/object/public/reportes"
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
  fotoEvidencia: `${BUCKET}/evidencias/reparado.webp`,
  miniaturaEvidencia: `${BUCKET}/evidencias/reparado-miniatura.webp`,
  fotoReporte: `${BUCKET}/original.webp`,
  miniaturaReporte: `${BUCKET}/original-miniatura.webp`,
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

  it("muestra la foto del antes y del después para juzgar la irregularidad sin abrir el reporte", () => {
    const html = renderToStaticMarkup(createElement(ColaEvidenciasEnVerificacion, { evidencias: [evidencia], umbral: 3 }))

    expect(html).toContain("Antes")
    expect(html).toContain("Después")
    expect(html).toContain(evidencia.miniaturaReporte)
    expect(html).toContain(evidencia.miniaturaEvidencia)
    expect(html).toContain(`href="/reportes/9"`)
    expect(html).toContain("Aprobar reparación")
    expect(html).toContain("Cancelar revisión")
    expect(html).not.toContain("Rechazar evidencia")
    expect(html).not.toMatch(/usuario|autor|email|correo/i)
  })

  it("avisa cuando la evidencia o el reporte no tienen foto en vez de dejar un hueco mudo", () => {
    const sinFotos = { ...evidencia, fotoEvidencia: null, miniaturaEvidencia: null, fotoReporte: null, miniaturaReporte: null }
    const html = renderToStaticMarkup(createElement(ColaEvidenciasEnVerificacion, { evidencias: [sinFotos], umbral: 3 }))

    expect(html.match(/Sin foto/g)).toHaveLength(2)
  })

  it("ofrece revertir una reparación validada y también muestra sus fotos", () => {
    const html = renderToStaticMarkup(createElement(ColaEvidenciasValidadas, { validadas: [evidencia], umbral: 3 }))

    expect(html).toContain("Reparada")
    expect(html).toContain(evidencia.miniaturaEvidencia)
    expect(html).toContain("Revertir reparación y devolver el reporte a Pendiente")
    expect(html).not.toContain("Aprobar reparación")
    expect(html).not.toContain("Cancelar revisión")
  })

  it("cae al texto neutro cuando la impugnación no trae motivo", () => {
    const html = renderToStaticMarkup(createElement(ColaImpugnaciones, { impugnaciones: [{ ...impugnacion, motivo: "" }], umbral: 3 }))

    expect(html).toContain("Sin motivo registrado.")
  })
})

describe("panel de cancelación de la revisión de reparado", () => {
  function panel(motivo = "") {
    return renderToStaticMarkup(createElement(PanelCancelarRevision, {
      motivo,
      procesando: false,
      onCambiarMotivo: () => {},
      onConfirmar: () => {},
      onVolver: () => {},
    }))
  }

  it("deja el motivo como opcional y no exige texto para cancelar", () => {
    const html = panel()

    expect(html).toContain("<textarea")
    expect(html).toContain('maxLength="500"')
    expect(html).toContain("(opcional)")
    expect(html).toContain("Confirmar cancelación")
    expect(html).toContain("Volver")
    expect(html).not.toMatch(/obligatorio|requerido/i)
  })

  it("explica qué pasa con el reporte, las fotos y el autor antes de confirmar", () => {
    const html = panel()

    expect(html).toContain("sigue Pendiente")
    expect(html).toContain("fotos originales")
    expect(html).toContain("correo")
  })

  it("cuenta los caracteres escritos sobre el máximo de la base", () => {
    const motivo = "La foto no muestra el arreglo"
    expect(panel()).toContain("0/500")
    expect(panel(motivo)).toContain(`${motivo.length}/500`)
  })

  it("deshabilita la confirmación mientras la acción está en curso", () => {
    const html = renderToStaticMarkup(createElement(PanelCancelarRevision, {
      motivo: "",
      procesando: true,
      onCambiarMotivo: () => {},
      onConfirmar: () => {},
      onVolver: () => {},
    }))

    expect(html).toContain("Cancelando la revisión…")
    expect(html).toContain("disabled")
  })
})
