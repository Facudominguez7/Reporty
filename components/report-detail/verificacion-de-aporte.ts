/**
 * Reglas de la verificación de seguridad que acompaña la publicación de un aporte comunitario.
 */

/** Estado de la verificación que el diálogo de confirmación necesita conocer. */
export type EstadoVerificacionDeAporte = {
  /** La aplicación exige resolver el challenge antes de publicar. */
  exigeVerificacion: boolean
  /** El formulario ya informa que la verificación no está disponible. */
  verificacionNoDisponible: boolean
  /** Token vigente del challenge, o `null` cuando venció o falló. */
  token: string | null
  /** La publicación está en curso y consume el token a propósito. */
  publicando: boolean
}

/**
 * Decide si el diálogo de confirmación debe explicar que la verificación venció mientras estaba
 * abierto. El widget queda detrás del diálogo, así que sin este aviso el botón de publicar se
 * deshabilita sin explicación. Nunca habilita la publicación: solo describe por qué está bloqueada.
 *
 * @param estado - Estado actual de la verificación del aporte.
 * @returns `true` cuando el diálogo debe mostrar el aviso.
 */
export function debeAvisarVerificacionVencida(estado: EstadoVerificacionDeAporte): boolean {
  return (
    estado.exigeVerificacion &&
    !estado.verificacionNoDisponible &&
    !estado.publicando &&
    estado.token === null
  )
}
