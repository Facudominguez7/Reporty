import { describe, expect, it } from "vitest"

import {
  MOTIVO_CANCELACION_MAX,
  mensajeDeEvidenciaResuelta,
  mensajeDeImpugnacionResuelta,
  payloadDeCancelacion,
} from "./evidencia-reparacion-mensajes"

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

  it("cancelar la revisión conserva el reporte, no promete un retiro y avisa al autor", () => {
    const mensaje = mensajeDeEvidenciaResuelta({
      accion: "rechazar",
      repetida: false,
      cerrado: false,
      revertido: false,
      evidenciaEstado: "rechazada",
    })

    expect(mensaje).toContain("cancelada")
    expect(mensaje).toContain("sigue pendiente")
    expect(mensaje).toContain("correo")
    expect(mensaje).not.toContain("retirado")
    expect(mensaje).not.toContain("Rechazado")
  })

  it("no vuelve a anunciar la cancelación cuando la evidencia ya estaba resuelta", () => {
    const mensaje = mensajeDeEvidenciaResuelta({
      accion: "rechazar",
      repetida: true,
      cerrado: false,
      revertido: false,
      evidenciaEstado: "rechazada",
    })

    expect(mensaje).toContain("ya estaba resuelta")
    expect(mensaje).not.toContain("correo")
  })

  it("el motivo de la cancelación es opcional y se recorta antes de enviarlo", () => {
    expect(MOTIVO_CANCELACION_MAX).toBe(500)
    expect(payloadDeCancelacion("")).toBeUndefined()
    expect(payloadDeCancelacion("   ")).toBeUndefined()
    expect(payloadDeCancelacion("  la foto es una captura de pantalla  ")).toBe("la foto es una captura de pantalla")
  })

  it("acepta un motivo largo hasta el máximo y no deja crecer el payload", () => {
    const motivo = "x".repeat(MOTIVO_CANCELACION_MAX + 120)

    expect(payloadDeCancelacion(motivo)).toHaveLength(MOTIVO_CANCELACION_MAX)
  })
})
