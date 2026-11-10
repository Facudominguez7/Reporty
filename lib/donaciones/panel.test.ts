import { describe, expect, it } from "vitest"

import { calcularTotales, donacionesACsv, leerFiltros, mesActual, rangoDelMes, type DonacionPanel } from "@/lib/donaciones/panel"

/** Donación de prueba para el panel. */
function donacion(cambios: Partial<DonacionPanel> = {}): DonacionPanel {
  return {
    id: "d1",
    pagoId: "77",
    fecha: "2026-11-10T18:04:00.000Z",
    monto: 5000,
    estado: "aprobada",
    estadoMp: "approved",
    nombre: "Ana",
    mensaje: "Fuerza",
    usuario: "ana",
    ...cambios,
  }
}

describe("filtros del panel de donaciones", () => {
  it("acepta estados y meses válidos e ignora el resto", () => {
    expect(leerFiltros({ estado: "pendiente", mes: "2026-11" })).toEqual({ estado: "pendiente", mes: "2026-11" })
    expect(leerFiltros({ estado: "borrada", mes: "2026-13" })).toEqual({ estado: null, mes: null })
  })

  it("cuenta el mes en hora de Argentina", () => {
    expect(rangoDelMes("2026-11")).toEqual({ desde: "2026-11-01T03:00:00.000Z", hasta: "2026-12-01T03:00:00.000Z" })
    expect(mesActual(new Date("2026-12-01T02:30:00.000Z"))).toBe("2026-11")
  })
})

describe("calcularTotales", () => {
  it("suma el total histórico y el del mes", () => {
    const totales = calcularTotales([
      { monto: 1000, fecha: "2026-11-01T03:00:00.000Z" },
      { monto: 2000, fecha: "2026-11-30T12:00:00.000Z" },
      { monto: 5000, fecha: "2026-10-31T23:00:00.000Z" },
    ], "2026-11")
    expect(totales).toEqual({ total: 8000, delMes: 3000, cantidad: 3 })
  })
})

describe("donacionesACsv", () => {
  it("arma encabezado y filas con fecha de Argentina y estado legible", () => {
    const csv = donacionesACsv([donacion()])
    expect(csv.startsWith("﻿Fecha,Monto,Estado,Estado Mercado Pago,Nombre,Mensaje,Usuario,Pago\r\n")).toBe(true)
    expect(csv).toContain("10/11/2026 15:04,5000,Aprobada,approved,Ana,Fuerza,ana,77\r\n")
  })

  it("escapa comillas, comas y saltos, y neutraliza fórmulas", () => {
    const csv = donacionesACsv([donacion({ nombre: "=HYPERLINK(\"x\")", mensaje: "Hola, \"equipo\"\nsigan", usuario: null })])
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`)
    expect(csv).toContain(`"Hola, ""equipo""\nsigan"`)
    expect(csv).toContain(",,77\r\n")
  })
})
