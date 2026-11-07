/**
 * Catálogo cerrado de frases de la evidencia de reparación (S16) y de la impugnación
 * (S17), con la misma forma que «Actualizaciones y Comentarios»
 * (`lib/reportes/aportes.ts`): el formulario envía la `key` y el servidor la resuelve
 * a `label`.
 *
 * La base sigue guardando texto libre —las filas históricas se muestran sin cambios—
 * pero la aplicación solo acepta las frases de estas listas, así nadie escribe texto
 * propio en el comentario de la evidencia ni en el motivo de la impugnación.
 *
 * No importa `server-only`: lo usan el formulario (cliente) y las server actions.
 */

/** Frases aprobadas para informar qué se arregló (S16), en ese orden. */
export const FRASES_REPARACION = [
  { key: "repararon_el_problema_por_completo", label: "Repararon el problema por completo" },
  { key: "taparon_el_bache_con_asfalto_nuevo", label: "Taparon el bache con asfalto nuevo" },
  { key: "retiraron_el_arbol_o_las_ramas_caidas", label: "Retiraron el árbol o las ramas caídas" },
  { key: "repararon_o_cambiaron_la_luminaria", label: "Repararon o cambiaron la luminaria" },
  { key: "limpiaron_la_basura_o_el_microbasural", label: "Limpiaron la basura o el microbasural" },
  { key: "repararon_la_perdida_de_agua_o_la_caneria", label: "Repararon la pérdida de agua o la cañería" },
  { key: "arreglaron_la_vereda_o_el_cordon", label: "Arreglaron la vereda o el cordón" },
  { key: "repusieron_o_arreglaron_el_cartel_o_semaforo", label: "Repusieron o arreglaron el cartel o semáforo" },
] as const

/** Claves válidas para informar una reparación. */
export type FraseReparacionKey = (typeof FRASES_REPARACION)[number]["key"]

/** Frases aprobadas para impugnar una reparación (S17), en ese orden. */
export const FRASES_IMPUGNACION = [
  { key: "el_problema_sigue_igual", label: "El problema sigue igual" },
  { key: "lo_arreglaron_solo_en_parte", label: "Lo arreglaron solo en parte" },
  { key: "el_arreglo_ya_se_rompio_de_nuevo", label: "El arreglo ya se rompió de nuevo" },
  { key: "la_foto_no_corresponde_a_este_lugar", label: "La foto no corresponde a este lugar" },
  { key: "la_foto_no_muestra_el_arreglo_con_claridad", label: "La foto no muestra el arreglo con claridad" },
] as const

/** Claves válidas para impugnar una reparación. */
export type FraseImpugnacionKey = (typeof FRASES_IMPUGNACION)[number]["key"]

/** Pregunta del formulario de evidencia (S16), verbatim. */
export const PREGUNTA_QUE_SE_ARREGLO = "¿Qué se arregló?"

/** Opción vacía del formulario de evidencia, igual que «Elegí una actualización…». */
export const PLACEHOLDER_FRASE_REPARACION = "Elegí qué se arregló…"

/** Pregunta del formulario de impugnación (S17), verbatim. */
export const PREGUNTA_POR_QUE_NO_ESTA_REPARADO = "¿Por qué no está reparado?"

/** Opción vacía del formulario de impugnación. */
export const PLACEHOLDER_FRASE_IMPUGNACION = "Elegí por qué no está reparado…"

/**
 * Resuelve la clave elegida en el formulario de evidencia a su frase visible.
 *
 * @param value - Valor recibido del cliente; nunca se confía en su tipo.
 * @returns La etiqueta de la frase, o `null` cuando la clave no está en el catálogo.
 */
export function parseFraseReparacion(value: unknown): string | null {
  if (typeof value !== "string") return null
  const clave = value.trim()
  return FRASES_REPARACION.find((frase) => frase.key === clave)?.label ?? null
}

/**
 * Resuelve la clave elegida en el formulario de impugnación a su frase visible.
 *
 * @param value - Valor recibido del cliente; nunca se confía en su tipo.
 * @returns La etiqueta de la frase, o `null` cuando la clave no está en el catálogo.
 */
export function parseFraseImpugnacion(value: unknown): string | null {
  if (typeof value !== "string") return null
  const clave = value.trim()
  return FRASES_IMPUGNACION.find((frase) => frase.key === clave)?.label ?? null
}
