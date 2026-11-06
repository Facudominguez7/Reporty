import { describe, expect, it } from "vitest"
import { validatePetSubmission } from "./mascota-submission-guard.server"

describe("validatePetSubmission", () => {
  it("accepts complete pet fields and normalizes whitespace", () => {
    expect(validatePetSubmission({
      tipoAnimal: "perro", descripcion: "  Marrón, collar rojo  ", lat: -34, lon: -56, telefono: "  1122334455  ",
    })).toEqual({
      tipoAnimal: "perro", descripcion: "Marrón, collar rojo", lat: -34, lon: -56, telefono: "1122334455",
    })
  })

  it("accepts geographic coordinate limits at the inclusive boundaries", () => {
    expect(validatePetSubmission({
      tipoAnimal: "otro", descripcion: "Pájaro", lat: 90, lon: 180, telefono: "123",
    })).toMatchObject({ lat: 90, lon: 180 })
  })

  it("rejects client-supplied owner and lifecycle fields", () => {
    for (const extra of [{ propietarioId: "attacker" }, { estado: "encontrada" }, { moderacionEstado: "aprobada" }]) {
      expect(() => validatePetSubmission({
        tipoAnimal: "perro", descripcion: "ok", lat: 0, lon: 0, telefono: "123", ...extra,
      })).toThrow()
    }
  })

  it.each([
    [{ tipoAnimal: "loro", descripcion: "ave", lat: 0, lon: 0, telefono: "123" }],
    [{ tipoAnimal: "gato", descripcion: " ", lat: 0, lon: 0, telefono: "123" }],
    [{ tipoAnimal: "gato", descripcion: "ok", lat: 91, lon: 0, telefono: "123" }],
    [{ tipoAnimal: "gato", descripcion: "ok", lat: 0, lon: -181, telefono: "123" }],
    [{ tipoAnimal: "gato", descripcion: "ok", lat: 0, lon: 0, telefono: " " }],
    [{ tipoAnimal: "gato", descripcion: "ok", lat: Number.NaN, lon: 0, telefono: "123" }],
    [{ tipoAnimal: "gato", descripcion: "ok", lat: 0, lon: 0 }],
  ])("rejects invalid, missing, or out-of-range fields", (input) => {
    expect(() => validatePetSubmission(input as never)).toThrow()
  })
})
