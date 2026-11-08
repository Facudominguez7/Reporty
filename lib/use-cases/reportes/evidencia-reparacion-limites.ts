/**
 * Límites de las columnas que siguen siendo texto libre: `evidencias_reparacion.comentario`
 * y `verificaciones_reparacion.motivo` (S16, S17). La aplicación solo escribe frases del
 * catálogo cerrado de `lib/reportes/frases-reparacion.ts`, y su prueba verifica que cada
 * etiqueta entre en estos límites, así el CHECK de la base nunca rechaza una frase válida.
 *
 * Vive fuera de los módulos `server-only` para que la prueba del catálogo pueda importarlo.
 */

/** Longitud máxima del comentario de la evidencia (`evidencias_reparacion.comentario`). */
export const COMENTARIO_REPARACION_MAX = 500

/** Longitud máxima del motivo de una impugnación (`verificaciones_reparacion.motivo`). */
export const MOTIVO_IMPUGNACION_MAX = 500
