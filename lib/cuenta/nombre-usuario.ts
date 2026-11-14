/**
 * Reglas del nombre de usuario público que cada persona puede elegir desde «Mi cuenta».
 *
 * Coinciden con el formato que genera la base al crear la cuenta (minúsculas, letras sin
 * tildes, números y guion bajo), así que un nombre generado automáticamente siempre es válido.
 * Este módulo no depende del servidor: el formulario puede usar las mismas constantes.
 */

/** Largo mínimo del nombre de usuario. */
export const LARGO_MINIMO_NOMBRE_USUARIO = 3

/** Largo máximo del nombre de usuario. */
export const LARGO_MAXIMO_NOMBRE_USUARIO = 30

/** Mensaje cuando el nombre no respeta el formato. */
export const ERROR_FORMATO_NOMBRE_USUARIO =
  "Usá entre 3 y 30 caracteres: letras sin tildes, números o guion bajo (no al principio ni al final)."

/** Mensaje cuando el nombre intenta hacerse pasar por Reporty o por un organismo. */
export const ERROR_NOMBRE_USUARIO_RESERVADO =
  "Ese nombre no está permitido: no puede hacerse pasar por Reporty ni por un organismo."

/** Formato permitido: empieza y termina con letra o número; en el medio admite guion bajo. */
const FORMATO_NOMBRE_USUARIO = /^[a-z0-9](?:[a-z0-9_]*[a-z0-9])?$/

/**
 * Fragmentos que no pueden aparecer en un nombre de usuario, porque harían pasar a la persona
 * por el equipo de Reporty o por un organismo público (los términos lo prohíben).
 */
const FRAGMENTOS_RESERVADOS = [
  "reporty",
  "admin",
  "moderador",
  "soporte",
  "oficial",
  "municipalidad",
  "municipio",
  "intendencia",
  "intendente",
  "gobierno",
  "defensoria",
  "concejo",
] as const

/** Resultado de validar el formato de un nombre de usuario. */
export type ValidacionNombreUsuario = { valido: true; nombre: string } | { valido: false; error: string }

/**
 * Normaliza y valida el formato de un nombre de usuario.
 *
 * Quita los espacios de los extremos y pasa a minúsculas; no convierte tildes ni eñes, sino que
 * las rechaza, para que la persona vea exactamente el nombre que se va a publicar. El lenguaje
 * ofensivo y la unicidad se controlan en el servidor.
 *
 * @param valor - Texto que escribió la persona (cualquier tipo: llega desde el cliente).
 * @returns El nombre normalizado, o el mensaje de error en español.
 */
export function validarFormatoNombreUsuario(valor: unknown): ValidacionNombreUsuario {
  if (typeof valor !== "string") return { valido: false, error: ERROR_FORMATO_NOMBRE_USUARIO }

  const nombre = valor.trim().toLowerCase()
  const largoValido = nombre.length >= LARGO_MINIMO_NOMBRE_USUARIO && nombre.length <= LARGO_MAXIMO_NOMBRE_USUARIO
  if (!largoValido || !FORMATO_NOMBRE_USUARIO.test(nombre)) {
    return { valido: false, error: ERROR_FORMATO_NOMBRE_USUARIO }
  }

  if (FRAGMENTOS_RESERVADOS.some((fragmento) => nombre.includes(fragmento))) {
    return { valido: false, error: ERROR_NOMBRE_USUARIO_RESERVADO }
  }

  return { valido: true, nombre }
}
