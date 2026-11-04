/**
 * Pestañas de `/auth` y envío que las acompaña.
 *
 * La dirección 03 agrupa el desafío de Cloudflare con el botón de la pestaña activa y suma
 * `Invitado` como tercera pestaña, así el acceso sin cuenta queda a la vista desde el principio.
 * Estas pruebas ejercitan el contrato público del módulo compartido: qué operación se envía con
 * cada pestaña, con qué texto y, sobre todo, cuándo el botón queda bloqueado. El bloqueo es la
 * parte que el defecto anterior no podía demostrar: mientras una acción espera respuesta, los
 * tres envíos quedan frenados y un token gastado no destraba nada.
 */
import { describe, expect, it } from "vitest"

import {
  ETIQUETAS_ENVIO,
  ETIQUETAS_PESTANA,
  PESTANAS_AUTH,
  VERIFICACION_INICIAL,
  envioDeLaPestana,
  normalizarPestana,
  ofrecerToken,
  type EstadoVerificacion,
} from "../../app/auth/verificacion-compartida"

/** Opciones neutras: desafío exigido y resuelto, sin acciones en curso. */
const BASE = {
  exigeDesafio: true,
  captchaNoDisponible: false,
  ingresoPendiente: false,
  registroPendiente: false,
  contrasenasCoinciden: true,
} as const

/** Verificación con un token vigente listo para reclamar. */
const CON_TOKEN: EstadoVerificacion = ofrecerToken(VERIFICACION_INICIAL, "cf-1")

/**
 * Resuelve el envío de una pestaña con las opciones neutras por defecto.
 *
 * @param opciones - Cambios sobre las opciones neutras.
 * @returns Envío resuelto para la pestaña pedida.
 */
const envio = (opciones: Partial<Parameters<typeof envioDeLaPestana>[0]> = {}) =>
  envioDeLaPestana({ ...BASE, pestana: "ingreso", verificacion: CON_TOKEN, ...opciones })

describe("pestañas de la tarjeta de acceso", () => {
  it("muestra ingreso, registro e invitado en ese orden", () => {
    expect(PESTANAS_AUTH).toEqual(["ingreso", "registro", "invitado"])
    expect(PESTANAS_AUTH.map((pestana) => ETIQUETAS_PESTANA[pestana])).toEqual([
      "Ingresar",
      "Registrarme",
      "Invitado",
    ])
  })

  it.each(PESTANAS_AUTH)("traduce el valor de la pestaña %s sin cambiarlo", (pestana) => {
    expect(normalizarPestana(pestana)).toBe(pestana)
  })

  it.each([["login"], ["register"], [""], ["Invitado"], ["otra"]])(
    "vuelve a ingreso con el valor desconocido %s",
    (valor) => {
      // Sin una operación válida el grupo no sabría qué envío mostrar.
      expect(normalizarPestana(valor)).toBe("ingreso")
    },
  )
})

describe("envío que acompaña a la pestaña activa", () => {
  it.each([
    ["ingreso", "Ingresar", "Ingresando..."],
    ["registro", "Crear cuenta", "Creando cuenta..."],
    ["invitado", "Continuar como invitado", "Preparando sesión..."],
  ] as const)("acompaña la pestaña %s con su propio envío", (pestana, reposo, pendiente) => {
    const resultado = envio({ pestana })

    expect(resultado.operacion).toBe(pestana)
    expect(resultado.etiqueta).toBe(reposo)
    expect(resultado.etiquetaPendiente).toBe(pendiente)
    expect(resultado.bloqueado).toBe(false)
    expect(resultado.pendiente).toBe(false)
  })

  it("publica los textos de los tres envíos para que la pantalla no los repita", () => {
    expect(ETIQUETAS_ENVIO).toEqual({
      ingreso: { reposo: "Ingresar", pendiente: "Ingresando..." },
      registro: { reposo: "Crear cuenta", pendiente: "Creando cuenta..." },
      invitado: { reposo: "Continuar como invitado", pendiente: "Preparando sesión..." },
    })
  })
})

describe("bloqueo del envío mientras falta el desafío", () => {
  it.each(PESTANAS_AUTH)("bloquea el envío de %s sin token", (pestana) => {
    expect(envio({ pestana, verificacion: VERIFICACION_INICIAL }).bloqueado).toBe(true)
  })

  it.each(PESTANAS_AUTH)("habilita el envío de %s con el token vigente", (pestana) => {
    expect(envio({ pestana }).bloqueado).toBe(false)
  })

  it.each(PESTANAS_AUTH)("vuelve a bloquear %s cuando el desafío vence", (pestana) => {
    // El vencimiento llega como `null`: el token viejo no puede seguir habilitando el envío.
    expect(envio({ pestana, verificacion: ofrecerToken(CON_TOKEN, null) }).bloqueado).toBe(true)
  })

  it.each(PESTANAS_AUTH)("no pide token a %s cuando el desafío no se exige", (pestana) => {
    expect(envio({ pestana, exigeDesafio: false, verificacion: VERIFICACION_INICIAL }).bloqueado).toBe(false)
  })

  it.each(PESTANAS_AUTH)("falla cerrado en %s cuando producción no tiene site key", (pestana) => {
    expect(envio({ pestana, captchaNoDisponible: true }).bloqueado).toBe(true)
  })
})

describe("bloqueo del envío mientras una operación está en curso", () => {
  it.each([
    ["la verificación está tomada por el ingreso", { verificacion: { token: null, ocupada: "ingreso", desafios: 1 } }],
    ["la verificación está tomada por el registro", { verificacion: { token: null, ocupada: "registro", desafios: 1 } }],
    ["el ingreso espera respuesta", { ingresoPendiente: true }],
    ["el registro espera respuesta", { registroPendiente: true }],
  ] as const)("frena las tres pestañas cuando %s", (_caso, cambios) => {
    for (const pestana of PESTANAS_AUTH) {
      // El token que llegue durante el intento queda para el siguiente: no destraba éste.
      expect(envio({ pestana, ...cambios }).bloqueado).toBe(true)
    }
  })

  it("informa el pendiente de la operación de la pestaña, no el de las demás", () => {
    expect(envio({ pestana: "ingreso", ingresoPendiente: true })).toMatchObject({
      pendiente: true,
      etiquetaPendiente: "Ingresando...",
    })
    expect(envio({ pestana: "registro", ingresoPendiente: true }).pendiente).toBe(false)
    expect(envio({ pestana: "invitado", registroPendiente: true }).pendiente).toBe(false)
  })

  it("anuncia la preparación de la sesión invitada mientras la abre", () => {
    const abriendo = envio({
      pestana: "invitado",
      verificacion: { token: null, ocupada: "invitado", desafios: 1 },
    })

    expect(abriendo.pendiente).toBe(true)
    expect(abriendo.etiquetaPendiente).toBe("Preparando sesión...")
  })

  it("deja enviar el ingreso aunque el registro todavía no pueda enviarse", () => {
    // Las contraseñas del registro no son un requisito del ingreso.
    expect(envio({ pestana: "ingreso", contrasenasCoinciden: false }).bloqueado).toBe(false)
    expect(envio({ pestana: "registro", contrasenasCoinciden: false }).bloqueado).toBe(true)
  })
})
