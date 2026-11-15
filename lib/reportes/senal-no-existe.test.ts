/** Señal social de los votos «No existe»: qué ve el vecino, sin números. */
import { describe, expect, it } from "vitest"

import { calcularSenalNoExiste } from "./senal-no-existe"

const abierto = { cerrado: false, enRevision: false }

describe("calcularSenalNoExiste", () => {
  it("sin votos de otros no muestra nada", () => {
    expect(calcularSenalNoExiste({ ...abierto, votos: 0, yaVoto: false })).toBe("ninguna")
  })

  it("con votos de otros avisa antes de votar", () => {
    expect(calcularSenalNoExiste({ ...abierto, votos: 1, yaVoto: false })).toBe("otros")
    expect(calcularSenalNoExiste({ ...abierto, votos: 4, yaVoto: false })).toBe("otros")
  })

  it("tu propio voto no enciende la señal de otros", () => {
    expect(calcularSenalNoExiste({ ...abierto, votos: 1, yaVoto: true })).toBe("solo_vos")
  })

  it("después de votar, si hay más vecinos, lo dice", () => {
    expect(calcularSenalNoExiste({ ...abierto, votos: 2, yaVoto: true })).toBe("vos_y_otros")
  })

  it("con una revisión pendiente gana el aviso de revisión", () => {
    expect(calcularSenalNoExiste({ cerrado: false, enRevision: true, votos: 5, yaVoto: true })).toBe("en_revision")
    expect(calcularSenalNoExiste({ cerrado: false, enRevision: true, votos: 5, yaVoto: false })).toBe("en_revision")
  })

  it("una revisión descartada vuelve a la señal normal aunque haya cinco votos o más", () => {
    expect(calcularSenalNoExiste({ ...abierto, votos: 6, yaVoto: false })).toBe("otros")
  })

  it("un reporte cerrado no muestra señal: ahí se ve el resumen con números", () => {
    expect(calcularSenalNoExiste({ cerrado: true, enRevision: true, votos: 5, yaVoto: true })).toBe("ninguna")
  })
})
