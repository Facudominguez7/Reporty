/**
 * Reglas de decisión de la intro de entrada (artboard design/intro-app/03-palabra-que-sube.html):
 * la intro se muestra una sola vez por sesión y nunca cuando el usuario prefiere
 * movimiento reducido.
 */
import { describe, expect, it } from "vitest"
import { evaluarMostrarIntro } from "./entrada"

describe("evaluarMostrarIntro", () => {
  it("muestra la intro en una sesión nueva, instalada y sin movimiento reducido", () => {
    expect(
      evaluarMostrarIntro({ movimientoReducido: false, yaVista: false, modoInstalado: true }),
    ).toBe(true)
  })

  it("no la muestra si la app no corre instalada (navegador con pestañas)", () => {
    expect(
      evaluarMostrarIntro({ movimientoReducido: false, yaVista: false, modoInstalado: false }),
    ).toBe(false)
  })

  it("no la muestra cuando el usuario prefiere movimiento reducido", () => {
    expect(
      evaluarMostrarIntro({ movimientoReducido: true, yaVista: false, modoInstalado: true }),
    ).toBe(false)
    expect(
      evaluarMostrarIntro({ movimientoReducido: true, yaVista: true, modoInstalado: true }),
    ).toBe(false)
  })

  it("no la muestra si ya se vio en esta sesión", () => {
    expect(
      evaluarMostrarIntro({ movimientoReducido: false, yaVista: true, modoInstalado: true }),
    ).toBe(false)
  })
})
