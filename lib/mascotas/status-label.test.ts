import { describe, expect, it } from "vitest"
import { getPetStatusAdjective } from "./status-label"

describe("getPetStatusAdjective", () => {
  it.each([["Perdida", "Perdido"], ["Encontrada", "Encontrado"]] as const)("maps %s to the species-agreeing form", (status, label) => {
    expect(getPetStatusAdjective(status)).toBe(label)
  })
})
