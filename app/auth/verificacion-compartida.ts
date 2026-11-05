/**
 * Verificación de seguridad compartida por el ingreso, el registro y el acceso como invitado.
 *
 * Turnstile entrega tokens de un solo uso y `/auth` muestra un único desafío para las tres
 * acciones. Este módulo concentra la decisión, sin React ni DOM: qué pestaña está activa, qué
 * operación puede enviarse, con qué texto, qué token se lleva cada envío, cuándo se pide un
 * desafío nuevo y cuándo la verificación vuelve a quedar libre. La pantalla aplica estas
 * transiciones sobre un `ref`, así que el reclamo es atómico incluso si dos envíos ocurren en el
 * mismo instante.
 */

import type { AuthError } from "@supabase/supabase-js"

/** Mensaje que se muestra cuando el proveedor no puede abrir la sesión de invitado. */
export const MENSAJE_INVITADO_FALLIDO = "No pudimos preparar tu sesión de invitado. Intentá nuevamente."

/** Nombre del campo oculto que Supabase lee como `captchaToken`. */
export const CAMPO_TOKEN_CAPTCHA = "captcha_token"

/** Acciones de la pantalla que comparten la misma verificación de seguridad. */
export type OperacionVerificada = "ingreso" | "registro" | "invitado"

/**
 * Pestañas de `/auth`. Cada pestaña envía la operación con la que comparte la verificación,
 * así que el grupo del desafío siempre sabe qué botón acompaña a la pestaña activa.
 */
export type PestanaAuth = OperacionVerificada

/** Pestañas en el orden en que se muestran: ingreso, registro e invitado. */
export const PESTANAS_AUTH = ["ingreso", "registro", "invitado"] as const satisfies readonly PestanaAuth[]

/** Texto visible de cada pestaña. */
export const ETIQUETAS_PESTANA: Record<PestanaAuth, string> = {
  ingreso: "Ingresar",
  registro: "Registrarme",
  invitado: "Invitado",
}

/**
 * Resuelve el valor que entrega la lista de pestañas.
 *
 * Radix entrega un `string`; cualquier valor desconocido vuelve a `ingreso` para que el envío
 * visible siempre tenga una operación válida.
 *
 * @param valor - Valor recibido del control de pestañas.
 * @returns Pestaña activa correspondiente.
 */
export function normalizarPestana(valor: string): PestanaAuth {
  return (PESTANAS_AUTH as readonly string[]).includes(valor) ? (valor as PestanaAuth) : "ingreso"
}

/** Estado de la verificación compartida por el ingreso, el registro y el invitado. */
export type EstadoVerificacion = {
  /** Token vigente para el próximo intento; `null` cuando falta o ya se reclamó. */
  token: string | null
  /** Acción que reclamó la verificación y todavía espera respuesta. */
  ocupada: OperacionVerificada | null
  /** Desafíos pedidos: cada reclamo reinicia el widget para emitir un token nuevo. */
  desafios: number
}

/** Estado inicial: sin token y sin operación en curso. */
export const VERIFICACION_INICIAL: EstadoVerificacion = { token: null, ocupada: null, desafios: 0 }

/** Texto del botón que envía cada operación, en reposo y mientras espera respuesta. */
export const ETIQUETAS_ENVIO: Record<OperacionVerificada, { reposo: string; pendiente: string }> = {
  ingreso: { reposo: "Ingresar", pendiente: "Ingresando..." },
  registro: { reposo: "Crear cuenta", pendiente: "Creando cuenta..." },
  invitado: { reposo: "Continuar como invitado", pendiente: "Preparando sesión..." },
}

/** Envío que acompaña a la pestaña activa dentro del grupo de verificación. */
export type EnvioDeLaPestana = {
  /** Operación que envía el botón del grupo. */
  operacion: OperacionVerificada
  /** Texto del botón en reposo. */
  etiqueta: string
  /** Texto del botón mientras la operación espera respuesta. */
  etiquetaPendiente: string
  /** Indica si esa operación está esperando respuesta. */
  pendiente: boolean
  /** Indica si el botón queda bloqueado. */
  bloqueado: boolean
}

/**
 * Resuelve el envío que acompaña a la pestaña activa: qué operación se manda, con qué texto y
 * si puede enviarse.
 *
 * Mientras una operación espera respuesta la verificación compartida está tomada, así que los
 * tres envíos quedan bloqueados, incluido el de la pestaña que no la reclamó. Un token viejo no
 * destraba nada: el reclamo lo descarta antes de que el pedido salga.
 *
 * @param opciones.pestana - Pestaña activa en la tarjeta.
 * @param opciones.verificacion - Estado de la verificación compartida.
 * @param opciones.exigeDesafio - Indica si la pantalla exige resolver el desafío.
 * @param opciones.captchaNoDisponible - Indica que producción se quedó sin site key.
 * @param opciones.ingresoPendiente - Acción de ingreso en curso.
 * @param opciones.registroPendiente - Acción de registro en curso.
 * @param opciones.contrasenasCoinciden - Indica si el registro puede enviarse.
 * @returns Operación, textos y bloqueo del botón que vive dentro del grupo.
 */
export function envioDeLaPestana({
  pestana,
  verificacion,
  exigeDesafio,
  captchaNoDisponible,
  ingresoPendiente,
  registroPendiente,
  contrasenasCoinciden,
}: {
  pestana: PestanaAuth
  verificacion: EstadoVerificacion
  exigeDesafio: boolean
  captchaNoDisponible: boolean
  ingresoPendiente: boolean
  registroPendiente: boolean
  contrasenasCoinciden: boolean
}): EnvioDeLaPestana {
  const pendiente =
    pestana === "ingreso"
      ? ingresoPendiente
      : pestana === "registro"
        ? registroPendiente
        : verificacion.ocupada === "invitado"
  // La verificación tomada mientras una acción espera respuesta frena los tres envíos.
  const operacionEnCurso = verificacion.ocupada !== null || ingresoPendiente || registroPendiente
  // Sin token vigente el desafío todavía no se resolvió: ningún envío puede salir.
  const sinToken = exigeDesafio && verificacion.token === null
  const bloqueado =
    captchaNoDisponible ||
    operacionEnCurso ||
    sinToken ||
    (pestana === "registro" && !contrasenasCoinciden)

  return {
    operacion: pestana,
    etiqueta: ETIQUETAS_ENVIO[pestana].reposo,
    etiquetaPendiente: ETIQUETAS_ENVIO[pestana].pendiente,
    pendiente,
    bloqueado,
  }
}

/** Resultado de reclamar la verificación: el estado siguiente y el token a enviar. */
export type ReclamacionVerificacion = { estado: EstadoVerificacion; token: string | null }

/**
 * Traduce el error del proveedor al mensaje que ve la persona.
 *
 * @param error - Error devuelto por Supabase al pedir la sesión anónima.
 * @returns Mensaje en español listo para mostrar.
 */
function guestSessionErrorMessage(error: AuthError): string {
  if (error.status === 429) return "Demasiados intentos desde tu conexión. Probá de nuevo en unos minutos."
  if (error.code === "anonymous_provider_disabled") return "No está disponible el acceso como invitado. Iniciá sesión para continuar."
  if (error.message.toLowerCase().includes("captcha")) return "Completá la verificación de seguridad e intentá nuevamente."
  return MENSAJE_INVITADO_FALLIDO
}

/**
 * Registra el token que entregó el desafío.
 *
 * Un token nuevo habilita el próximo intento aunque otra operación esté en curso: la que ya
 * está en curso tiene el suyo y no puede volver a reclamarlo.
 *
 * @param estado - Estado actual de la verificación.
 * @param token - Token emitido, o `null` cuando expiró o falló el desafío.
 * @returns Estado con el token vigente; el mismo objeto cuando el token no cambió.
 */
export function ofrecerToken(estado: EstadoVerificacion, token: string | null): EstadoVerificacion {
  return token === estado.token ? estado : { ...estado, token }
}

/**
 * Reclama la verificación para una operación de forma atómica.
 *
 * El reclamo descarta el token del estado antes de que el pedido salga: ya nadie puede
 * enviarlo y el widget recibe la orden de emitir uno nuevo para el próximo intento. Mientras
 * la verificación esté tomada ninguna operación puede reclamarla, ni siquiera la misma.
 *
 * @param estado - Estado actual de la verificación.
 * @param operacion - Acción que va a consumir el token.
 * @param exigeToken - `true` cuando la pantalla exige resolver el desafío.
 * @returns Estado siguiente con el token reclamado, o `null` si la operación no puede enviarse.
 */
export function reclamarVerificacion(
  estado: EstadoVerificacion,
  operacion: OperacionVerificada,
  exigeToken: boolean,
): ReclamacionVerificacion | null {
  if (estado.ocupada !== null) return null
  if (exigeToken && estado.token === null) return null

  return {
    estado: { token: null, ocupada: operacion, desafios: estado.desafios + 1 },
    token: estado.token,
  }
}

/**
 * Libera la verificación cuando la operación que la tomó terminó.
 *
 * Sólo la operación dueña puede liberarla; un token nuevo que haya llegado mientras tanto
 * queda disponible para el próximo intento.
 *
 * @param estado - Estado actual de la verificación.
 * @param operacion - Acción que dejó de estar en curso.
 * @returns Estado con la verificación libre, o el mismo estado si no le pertenecía.
 */
export function liberarVerificacion(
  estado: EstadoVerificacion,
  operacion: OperacionVerificada,
): EstadoVerificacion {
  return estado.ocupada === operacion ? { ...estado, ocupada: null } : estado
}

/**
 * Deja el token reclamado en el campo oculto del formulario que se está enviando.
 *
 * React arma el `FormData` del servidor después de los manejadores de `onSubmit` y antes de
 * aplicar el estado nuevo —todo el evento corre dentro del mismo `batchedUpdates`—, así que
 * escribir el token acá garantiza que el pedido lo lleve aunque el estado compartido ya esté
 * vacío.
 *
 * @param formulario - Formulario que se está enviando.
 * @param token - Token reclamado para ese envío, o `null` cuando la operación no lleva token.
 */
export function entregarTokenAlFormulario(formulario: HTMLFormElement, token: string | null): void {
  const campo = formulario.elements.namedItem(CAMPO_TOKEN_CAPTCHA)
  if (!campo || !("value" in campo)) return
  campo.value = token ?? ""
}

/**
 * Abre la sesión anónima consumiendo la verificación compartida.
 *
 * La verificación se reclama antes del pedido y se libera sólo cuando la sesión no se abrió
 * (rechazo del proveedor o excepción), así la persona puede reintentar con un desafío nuevo.
 * Cuando la sesión se abre, la verificación queda tomada a propósito: la pantalla navega y
 * volver a habilitar los envíos antes de que termine la navegación permitiría un segundo
 * ingreso anónimo con el token nuevo que el desafío ya emitió.
 *
 * @param opciones.reclamar - Reclamo atómico de la verificación compartida.
 * @param opciones.liberar - Libera la verificación cuando la operación no se completó.
 * @param opciones.abrirSesion - Pedido real al proveedor con el token reclamado.
 * @param opciones.alFallar - Publica el mensaje de error que verá la persona.
 * @returns `true` sólo cuando la sesión quedó abierta.
 */
export async function abrirSesionInvitada({
  reclamar,
  liberar,
  abrirSesion,
  alFallar,
}: {
  reclamar: (operacion: OperacionVerificada) => ReclamacionVerificacion | null
  liberar: (operacion: OperacionVerificada) => void
  abrirSesion: (token: string | null) => Promise<{ error: AuthError | null }>
  alFallar: (mensaje: string) => void
}): Promise<boolean> {
  const reclamacion = reclamar("invitado")
  if (!reclamacion) return false

  try {
    const { error } = await abrirSesion(reclamacion.token)
    if (error) {
      alFallar(guestSessionErrorMessage(error))
      liberar("invitado")
      return false
    }
    // Sesión abierta: la verificación sigue tomada hasta que la navegación reemplace la pantalla.
    return true
  } catch {
    // El proveedor puede fallar antes de responder: sin este mensaje la pantalla quedaría
    // bloqueada sin explicación.
    alFallar(MENSAJE_INVITADO_FALLIDO)
    liberar("invitado")
    return false
  }
}
