/**
 * Límites compartidos por la validación del servidor y el formulario de la ficha del
 * reporte (S13). Viven fuera de los módulos `server-only` para que el cliente pueda
 * mostrar la misma longitud que después exige la RPC.
 */

/** Longitud máxima del comentario de la evidencia (`evidencias_reparacion.comentario`). */
export const COMENTARIO_REPARACION_MAX = 500

/** Longitud máxima del motivo de una impugnación (`verificaciones_reparacion.motivo`). */
export const MOTIVO_IMPUGNACION_MAX = 500
