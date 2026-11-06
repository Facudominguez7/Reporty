import { describe, expect, it } from "vitest"

import { mensajeDeEvidenciaResuelta, mensajeDeImpugnacionResuelta } from "./evidencia-reparacion-mensajes"

describe("mensajes de la cola de reparaciones", () => {
  it("aceptar una impugnación rechaza la evidencia y deja el reporte pendiente", () => {
    const mensaje = mensajeDeImpugnacionResuelta({
      accion: "aceptada",
      repetida: false,
      cerrado: false,
      evidenciaEstado: "rechazada",
      confirmaciones: 2,
      impugnacionesPendientes: 0,
    })

    expect(mensaje).toContain("rechazada")
    expect(mensaje).toContain("sigue pendiente")
  })

  it("descartar sin alcanzar el umbral informa que la verificación continúa", () => {
    const mensaje = mensajeDeImpugnacionResuelta({
      accion: "descartada",
      repetida: false,
      cerrado: false,
      evidenciaEstado: "en_verificacion",
      confirmaciones: 2,
      impugnacionesPendientes: 0,
    })

    expect(mensaje).toContain("continúa")
    expect(mensaje).not.toContain("Reparado")
  })

  it("descartar cuando se alcanza el umbral muestra el cierre real y que el historial registra a administración", () => {
    const mensaje = mensajeDeImpugnacionResuelta({
      accion: "descartada",
      repetida: false,
      cerrado: true,
      evidenciaEstado: "validada",
      confirmaciones: 3,
      impugnacionesPendientes: 0,
    })

    expect(mensaje).toContain("Reparado")
    expect(mensaje).toContain("historial")
    expect(mensaje).toContain("administración")
  })

  it("repetir una resolución ya registrada no vuelve a anunciar un cierre", () => {
    const mensaje = mensajeDeImpugnacionResuelta({
      accion: "aceptada",
      repetida: true,
      cerrado: false,
      evidenciaEstado: "rechazada",
      confirmaciones: 3,
      impugnacionesPendientes: 0,
    })

    expect(mensaje).toContain("ya estaba resuelta")
  })

  it("aprobar cierra el reporte como Reparado y revertir lo devuelve a Pendiente", () => {
    const aprobada = mensajeDeEvidenciaResuelta({
      accion: "aprobar",
      repetida: false,
      cerrado: true,
      revertido: false,
      evidenciaEstado: "validada",
    })
    expect(aprobada).toContain("Reparado")

    const revertida = mensajeDeEvidenciaResuelta({
      accion: "revertir",
      repetida: false,
      cerrado: false,
      revertido: true,
      evidenciaEstado: "revertida",
    })
    expect(revertida).toContain("Pendiente")
    expect(revertida).toContain("cinco puntos")
  })

  it("rechazar la evidencia conserva el reporte y no promete un retiro", () => {
    const mensaje = mensajeDeEvidenciaResuelta({
      accion: "rechazar",
      repetida: false,
      cerrado: false,
      revertido: false,
      evidenciaEstado: "rechazada",
    })

    expect(mensaje).toContain("rechazada")
    expect(mensaje).toContain("sigue pendiente")
    expect(mensaje).not.toContain("retirado")
  })
})
