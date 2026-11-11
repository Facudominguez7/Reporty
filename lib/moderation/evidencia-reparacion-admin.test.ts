import { describe, expect, it } from "vitest"

import {
  listarEvidenciasEnVerificacion,
  listarEvidenciasValidadas,
} from "./evidencia-reparacion-admin.server"

describe("cola administrativa de reparaciones", () => {
  it("expone solo las colas de evidencias y reparaciones validadas", () => {
    expect(typeof listarEvidenciasEnVerificacion).toBe("function")
    expect(typeof listarEvidenciasValidadas).toBe("function")
  })
})
