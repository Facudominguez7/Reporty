/**
 * Reglas compartidas (cliente y servidor) de la eliminación de cuenta.
 */

/** Palabra que el usuario tiene que escribir para confirmar la eliminación. */
export const CONFIRMACION_ELIMINAR_CUENTA = "ELIMINAR"

/** Mensaje cuando un administrador intenta eliminar su propia cuenta. */
export const ERROR_ADMIN_NO_ELIMINABLE = "Las cuentas de administrador no se pueden eliminar desde la app."

/**
 * Lo que se borra al eliminar la cuenta, en el orden en que se le muestra al usuario.
 * Lo usan el diálogo de confirmación y la página pública /eliminar-cuenta.
 */
export const DATOS_QUE_SE_ELIMINAN = [
  "Tu cuenta, tu email y tu nombre de usuario.",
  "Todos los reportes que publicaste, con sus fotos, comentarios y votos de otros vecinos.",
  "Las mascotas que publicaste y sus fotos.",
  "Tus comentarios, votos y evidencias de reparación en reportes de otros.",
  "Tus puntos y tu posición en el ranking.",
] as const

/**
 * Lo que se conserva sin vínculo con la cuenta, por obligaciones legales o de seguridad.
 */
export const DATOS_QUE_SE_CONSERVAN = [
  "Las donaciones quedan registradas sin asociarse a tu cuenta, como respaldo contable.",
  "Los registros de seguridad de acciones administrativas se conservan durante su período de retención.",
] as const

/**
 * Indica si el texto escrito confirma la eliminación (sin distinguir mayúsculas ni espacios).
 *
 * @param texto - Lo que escribió el usuario en el campo de confirmación.
 * @returns `true` si coincide con {@link CONFIRMACION_ELIMINAR_CUENTA}.
 */
export function confirmaEliminacion(texto: string): boolean {
  return texto.trim().toUpperCase() === CONFIRMACION_ELIMINAR_CUENTA
}
