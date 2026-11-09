import { describe, expect, it } from "vitest"

import { contextoRetencion } from "./retencion"

const ahora = new Date("2026-11-09T12:00:00.000Z")

describe("contextoRetencion", () => {
  it("calcula el límite de retención y cuándo vence el evento más viejo", () => {
    expect(contextoRetencion({ diasRetencion: 180, eventoMasViejo: "2026-10-27T15:08:21+00:00", ahora })).toEqual({
      limite: "2026-05-13T12:00:00.000Z",
      proximaElegible: "2027-04-25T15:08:21.000Z",
      hayVencidos: false,
    })
  })

  it("informa que hay eventos vencidos cuando el más viejo ya superó la retención", () => {
    expect(contextoRetencion({ diasRetencion: 180, eventoMasViejo: "2026-01-10T00:00:00+00:00", ahora })).toMatchObject({
      limite: "2026-05-13T12:00:00.000Z",
      proximaElegible: null,
      hayVencidos: true,
    })
  })

  it("no inventa fechas cuando todavía no hay eventos o la fecha es inválida", () => {
    expect(contextoRetencion({ diasRetencion: 180, eventoMasViejo: null, ahora })).toMatchObject({
      proximaElegible: null,
      hayVencidos: false,
    })
    expect(contextoRetencion({ diasRetencion: 180, eventoMasViejo: "no-es-fecha", ahora })).toMatchObject({
      proximaElegible: null,
      hayVencidos: false,
    })
  })

  it("respeta la retención configurada", () => {
    expect(contextoRetencion({ diasRetencion: 30, eventoMasViejo: "2026-10-27T15:08:21+00:00", ahora }).proximaElegible)
      .toBe("2026-11-26T15:08:21.000Z")
  })
})
