/**
 * Comportamiento de la verificación de seguridad compartida de `/auth`.
 *
 * Turnstile entrega tokens de un solo uso y la pantalla tiene una única verificación para las
 * tres acciones (ingreso, registro e invitado). Estas pruebas ejercitan los eventos reales que
 * el navegador puede producir: dos envíos en el mismo instante, un token ya gastado, un
 * proveedor que falla o que lanza, y el reintento posterior. No necesitan DOM porque toda la
 * decisión vive en funciones puras.
 */
import { AuthApiError } from "@supabase/supabase-js"
import { describe, expect, it, vi } from "vitest"

import {
  VERIFICACION_INICIAL,
  abrirSesionInvitada,
  entregarTokenAlFormulario,
  liberarVerificacion,
  ofrecerToken,
  reclamarVerificacion,
  type EstadoVerificacion,
  type OperacionVerificada,
  type ReclamacionVerificacion,
} from "../../app/auth/verificacion-compartida"

/**
 * Reproduce el ref que usa la pantalla: cada reclamo aplica el estado siguiente en el acto, así
 * que dos operaciones del mismo tick compiten por el mismo estado y no por un render pendiente.
 *
 * @param tokenInicial - Token que ofrece el desafío al empezar.
 * @returns Reclamo, liberación y entrega de tokens sobre un estado mutable.
 */
const verificacionDePrueba = (tokenInicial: string | null = "cf-1") => {
  let estado: EstadoVerificacion = ofrecerToken(VERIFICACION_INICIAL, tokenInicial)

  return {
    estado: () => estado,
    reclamar: (operacion: OperacionVerificada): ReclamacionVerificacion | null => {
      const reclamacion = reclamarVerificacion(estado, operacion, true)
      if (reclamacion) estado = reclamacion.estado
      return reclamacion
    },
    liberar: (operacion: OperacionVerificada) => {
      estado = liberarVerificacion(estado, operacion)
    },
    ofrecer: (token: string | null) => {
      estado = ofrecerToken(estado, token)
    },
  }
}

/** Formulario mínimo: sólo el campo oculto que Supabase lee como `captchaToken`. */
const formularioDePrueba = (valorInicial = "") => {
  const campo = { value: valorInicial }
  const consultados: string[] = []

  return {
    campo,
    consultados,
    formulario: {
      elements: {
        namedItem: (nombre: string) => {
          consultados.push(nombre)
          return nombre === "captcha_token" ? campo : null
        },
      },
    } as unknown as HTMLFormElement,
  }
}

describe("reclamo atómico de la verificación compartida", () => {
  it("no entrega el mismo token a dos envíos del mismo instante", () => {
    const verificacion = verificacionDePrueba()

    const ingreso = verificacion.reclamar("ingreso")
    const registro = verificacion.reclamar("registro")

    expect(ingreso?.token).toBe("cf-1")
    expect(registro).toBeNull()
  })

  it("no permite que la misma operación reclame dos veces mientras espera respuesta", () => {
    const verificacion = verificacionDePrueba()

    expect(verificacion.reclamar("registro")?.token).toBe("cf-1")
    expect(verificacion.reclamar("registro")).toBeNull()
  })

  it("descarta el token al reclamarlo, así que no puede reenviarse", () => {
    const verificacion = verificacionDePrueba()

    verificacion.reclamar("ingreso")
    verificacion.liberar("ingreso")

    // Sin un token nuevo, el intento siguiente no puede reutilizar el que ya se gastó.
    expect(verificacion.reclamar("ingreso")).toBeNull()

    verificacion.ofrecer("cf-2")
    expect(verificacion.reclamar("ingreso")?.token).toBe("cf-2")
  })

  it("pide un desafío nuevo en cada reclamo", () => {
    const conToken = ofrecerToken(VERIFICACION_INICIAL, "cf-1")

    const primero = reclamarVerificacion(conToken, "ingreso", true)
    expect(primero?.estado.desafios).toBe(conToken.desafios + 1)

    const liberado = liberarVerificacion(primero!.estado, "ingreso")
    const segundo = reclamarVerificacion(ofrecerToken(liberado, "cf-2"), "invitado", true)

    expect(segundo?.estado.desafios).toBe(primero!.estado.desafios + 1)
  })

  it("guarda el token que llega durante un intento para el intento siguiente", () => {
    const verificacion = verificacionDePrueba()
    verificacion.reclamar("ingreso")

    // El desafío se reinició al reclamar y entrega uno nuevo mientras el pedido está en vuelo.
    verificacion.ofrecer("cf-2")

    // Ese token no destraba el intento en curso ni se le entrega a otra operación.
    expect(verificacion.estado().ocupada).toBe("ingreso")
    expect(verificacion.reclamar("invitado")).toBeNull()

    verificacion.liberar("ingreso")
    expect(verificacion.reclamar("invitado")?.token).toBe("cf-2")
  })

  it("sólo la operación dueña libera la verificación", () => {
    const conToken = ofrecerToken(VERIFICACION_INICIAL, "cf-1")
    const reclamacion = reclamarVerificacion(conToken, "ingreso", true)

    expect(liberarVerificacion(reclamacion!.estado, "registro")).toBe(reclamacion!.estado)
    expect(liberarVerificacion(reclamacion!.estado, "ingreso").ocupada).toBeNull()
  })

  it("sin verificación configurada la operación se envía sin token", () => {
    expect(reclamarVerificacion(VERIFICACION_INICIAL, "ingreso", true)).toBeNull()
    expect(reclamarVerificacion(VERIFICACION_INICIAL, "ingreso", false)?.token).toBeNull()
  })

  it("no cambia el estado cuando el token ofrecido es el mismo", () => {
    const conToken = ofrecerToken(VERIFICACION_INICIAL, "cf-1")

    expect(ofrecerToken(conToken, "cf-1")).toBe(conToken)
    // Un desafío vencido deja la verificación sin token y bloquea el envío.
    const vencido = ofrecerToken(conToken, null)
    expect(vencido.token).toBeNull()
    expect(reclamarVerificacion(vencido, "ingreso", true)).toBeNull()
  })
})

describe("entrega del token al formulario que se envía", () => {
  it("deja el token reclamado en el campo oculto", () => {
    const { campo, formulario } = formularioDePrueba()

    entregarTokenAlFormulario(formulario, "cf-1")

    expect(campo.value).toBe("cf-1")
  })

  it("vacía el campo cuando la operación no lleva token", () => {
    const { campo, formulario } = formularioDePrueba("cf-viejo")

    entregarTokenAlFormulario(formulario, null)

    expect(campo.value).toBe("")
  })

  it("busca sólo el campo que Supabase lee y no rompe si no existe", () => {
    const { consultados, formulario } = formularioDePrueba()
    const sinCampo = {
      elements: { namedItem: (nombre: string) => { consultados.push(nombre); return null } },
    } as unknown as HTMLFormElement

    entregarTokenAlFormulario(formulario, "cf-1")
    expect(() => entregarTokenAlFormulario(sinCampo, "cf-1")).not.toThrow()
    expect(consultados).toEqual(["captcha_token", "captcha_token"])
  })
})

describe("sesión de invitado protegida por la verificación", () => {
  const abrirCon = (
    verificacion: ReturnType<typeof verificacionDePrueba>,
    abrirSesion: (token: string | null) => Promise<{ error: AuthApiError | null }>,
    alFallar = vi.fn(),
  ) =>
    abrirSesionInvitada({
      reclamar: verificacion.reclamar,
      liberar: verificacion.liberar,
      abrirSesion,
      alFallar,
    })

  it("abre la sesión con el token reclamado", async () => {
    const verificacion = verificacionDePrueba()
    const abrirSesion = vi.fn(async () => ({ error: null }))

    await expect(abrirCon(verificacion, abrirSesion)).resolves.toBe(true)

    expect(abrirSesion).toHaveBeenCalledWith("cf-1")
  })

  it("mantiene la verificación tomada mientras la pantalla navega tras abrir la sesión", async () => {
    const verificacion = verificacionDePrueba()
    const abrirSesion = vi.fn(async () => ({ error: null }))

    await abrirCon(verificacion, abrirSesion)

    // Con la sesión abierta la pantalla navega a `next`. Si la verificación se liberara acá,
    // el botón de invitado podría volver a habilitarse antes de que termine la navegación.
    expect(verificacion.estado().ocupada).toBe("invitado")
  })

  it("no abre una segunda sesión de invitado mientras la pantalla navega", async () => {
    const verificacion = verificacionDePrueba()
    const abrirSesion = vi.fn(async () => ({ error: null }))

    await expect(abrirCon(verificacion, abrirSesion)).resolves.toBe(true)
    // El desafío se reinició al reclamar y ya entregó un token nuevo para el próximo intento.
    verificacion.ofrecer("cf-2")

    await expect(abrirCon(verificacion, abrirSesion)).resolves.toBe(false)

    // Una segunda pulsación durante la navegación no puede abrir otra sesión anónima.
    expect(abrirSesion).toHaveBeenCalledTimes(1)
  })

  it("publica el mensaje del proveedor y libera la verificación cuando la sesión falla", async () => {
    const verificacion = verificacionDePrueba()
    const alFallar = vi.fn()
    const abrirSesion = vi.fn(async () => ({
      error: new AuthApiError("Captcha verification failed", 400, "captcha"),
    }))

    await expect(abrirCon(verificacion, abrirSesion, alFallar)).resolves.toBe(false)

    expect(alFallar).toHaveBeenCalledWith("Completá la verificación de seguridad e intentá nuevamente.")
    expect(verificacion.estado().ocupada).toBeNull()
  })

  it("libera la verificación y avisa cuando el proveedor lanza una excepción", async () => {
    const verificacion = verificacionDePrueba()
    const alFallar = vi.fn()
    const abrirSesion = vi.fn(async () => {
      throw new Error("network down")
    })

    // Sin este manejo la pantalla quedaría bloqueada sin explicación.
    await expect(abrirCon(verificacion, abrirSesion, alFallar)).resolves.toBe(false)

    expect(alFallar).toHaveBeenCalledWith("No pudimos preparar tu sesión de invitado. Intentá nuevamente.")
    expect(verificacion.estado().ocupada).toBeNull()
  })

  it("no pide la sesión si otra operación ya reclamó la verificación", async () => {
    const verificacion = verificacionDePrueba()
    verificacion.reclamar("ingreso")
    const abrirSesion = vi.fn(async () => ({ error: null }))
    const alFallar = vi.fn()

    await expect(abrirCon(verificacion, abrirSesion, alFallar)).resolves.toBe(false)

    expect(abrirSesion).not.toHaveBeenCalled()
    expect(alFallar).not.toHaveBeenCalled()
    // La verificación sigue siendo del ingreso: el invitado no puede liberarla.
    expect(verificacion.estado().ocupada).toBe("ingreso")
  })

  it("permite reintentar con un token nuevo después de un fallo", async () => {
    const verificacion = verificacionDePrueba()
    const alFallar = vi.fn()

    await abrirCon(
      verificacion,
      async () => ({ error: new AuthApiError("Captcha verification failed", 400, "captcha") }),
      alFallar,
    )
    verificacion.ofrecer("cf-2")
    const abrirSesion = vi.fn(async () => ({ error: null }))

    await expect(abrirCon(verificacion, abrirSesion, alFallar)).resolves.toBe(true)

    expect(abrirSesion).toHaveBeenCalledWith("cf-2")
    // El reintento funcionó: la sesión quedó abierta y la pantalla ya está navegando.
    expect(verificacion.estado().ocupada).toBe("invitado")
  })

  it.each([
    [new AuthApiError("Request rate limit reached", 429, "over_request_rate_limit"), "Demasiados intentos desde tu conexión. Probá de nuevo en unos minutos."],
    [new AuthApiError("Anonymous sign-ins are disabled", 422, "anonymous_provider_disabled"), "No está disponible el acceso como invitado. Iniciá sesión para continuar."],
  ])("traduce el rechazo del proveedor (%s)", async (error, mensaje) => {
    const verificacion = verificacionDePrueba()
    const alFallar = vi.fn()

    await abrirCon(verificacion, async () => ({ error }), alFallar)

    expect(alFallar).toHaveBeenCalledWith(mensaje)
  })
})
