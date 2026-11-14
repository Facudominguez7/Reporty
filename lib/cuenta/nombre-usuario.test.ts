import { describe, expect, it } from "vitest"

import {
  ERROR_FORMATO_NOMBRE_USUARIO,
  ERROR_NOMBRE_USUARIO_RESERVADO,
  validarFormatoNombreUsuario,
} from "./nombre-usuario"

describe("validarFormatoNombreUsuario", () => {
  it("acepta letras sin tildes, números y guion bajo, y lo devuelve en minúsculas y sin espacios alrededor", () => {
    expect(validarFormatoNombreUsuario("  Vecina_Posadeña ".replace("ñ", "n"))).toEqual({
      valido: true,
      nombre: "vecina_posadena",
    })
    expect(validarFormatoNombreUsuario("abc")).toEqual({ valido: true, nombre: "abc" })
    expect(validarFormatoNombreUsuario("a".repeat(30))).toEqual({ valido: true, nombre: "a".repeat(30) })
  })

  it("rechaza nombres de menos de 3 o más de 30 caracteres", () => {
    expect(validarFormatoNombreUsuario("ab")).toEqual({ valido: false, error: ERROR_FORMATO_NOMBRE_USUARIO })
    expect(validarFormatoNombreUsuario("a".repeat(31))).toEqual({ valido: false, error: ERROR_FORMATO_NOMBRE_USUARIO })
  })

  it("rechaza tildes, eñes, espacios intermedios, símbolos y guion bajo al principio o al final", () => {
    for (const nombre of ["josé", "peña", "juan perez", "juan.perez", "juan@mail", "_juan", "juan_"]) {
      expect(validarFormatoNombreUsuario(nombre)).toEqual({ valido: false, error: ERROR_FORMATO_NOMBRE_USUARIO })
    }
  })

  it("rechaza nombres que suplantan a Reporty o a un organismo", () => {
    for (const nombre of ["reporty_oficial", "admin", "el_moderador", "municipalidad_posadas", "defensoria", "gobierno_misiones"]) {
      expect(validarFormatoNombreUsuario(nombre)).toEqual({ valido: false, error: ERROR_NOMBRE_USUARIO_RESERVADO })
    }
  })

  it("rechaza valores que no son texto", () => {
    expect(validarFormatoNombreUsuario(undefined)).toEqual({ valido: false, error: ERROR_FORMATO_NOMBRE_USUARIO })
    expect(validarFormatoNombreUsuario(42)).toEqual({ valido: false, error: ERROR_FORMATO_NOMBRE_USUARIO })
  })
})
