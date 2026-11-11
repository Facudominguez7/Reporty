import { describe, expect, it } from "vitest"
import { moderatePetText, moderateReportText, moderateText } from "./texto-determinista.server"

describe("moderación determinista de texto", () => {
  it.each([
    "boludo",
    "B0LUDO",
    "b o l u d o",
    "p3lotudo",
    "pelotuuuudo",
    "putooos",
    "p.u.t.o.s",
    "pütos",
    "ｐｕｔｏｓ",
    "m13rd4",
    "h1j0 d3 put4",
    "c0nch4",
    "s0r3t3",
    "f0rr0",
    "t4r4d0",
    "h!jo de puta",
  ]) ("bloquea la variante ofensiva %s", (value) => {
    expect(moderateText(value).allowed).toBe(false)
  })

  it.each(["Bache frente a la plaza", "Mi perro se perdió cerca del barrio", "che, el pibe dejó la calle señalizada", "Hay un quilombo de tránsito en la avenida"]) ("permite texto coloquial seguro: %s", (value) => {
    expect(moderateText(value)).toEqual({ allowed: true })
  })

  it("mantiene estricto el detector base para palabras ambiguas", () => {
    expect(moderateText("gato").allowed).toBe(false)
  })

  it("aplica el campo de descripción de mascotas", () => {
    expect(moderatePetText("Pelotudo el que se llevó mi perro")).toBe("El texto contiene lenguaje ofensivo. Corregilo antes de publicar.")
    expect(moderatePetText("Perro marrón con collar rojo")).toBeNull()
    expect(moderatePetText("Gato perdido negro")).toBeNull()
    expect(moderatePetText("Perra perdida con collar rojo")).toBeNull()
    expect(moderatePetText("Rata encontrada en una jaula")).toBeNull()
  })

  it("aplica título y descripción de reportes", () => {
    expect(moderateReportText("B0LUDO", "Frente a la plaza")).toBe("El texto contiene lenguaje ofensivo. Corregilo antes de publicar.")
    expect(moderateReportText("Bache", "Hay un pozo frente a la escuela")).toBeNull()
  })
})
