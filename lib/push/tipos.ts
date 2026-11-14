/**
 * Tipos y reglas compartidas de las notificaciones push.
 *
 * No depende del servidor: el formulario de «Mi cuenta» usa las mismas etiquetas y valores
 * por defecto que el envío.
 */

/** Tipos de notificación push, uno por interruptor de «Mi cuenta». */
export const TIPOS_PUSH = ["estado_reporte", "comentarios", "mascotas", "moderacion"] as const

/** Tipo de notificación push; coincide con una columna de `public.preferencias_push`. */
export type TipoPush = (typeof TIPOS_PUSH)[number]

/** Qué tipos de notificación quiere recibir una persona. */
export type PreferenciasPush = Record<TipoPush, boolean>

/** Sin preferencias guardadas, todos los tipos están activos. */
export const PREFERENCIAS_PUSH_POR_DEFECTO: PreferenciasPush = {
  estado_reporte: true,
  comentarios: true,
  mascotas: true,
  moderacion: true,
}

/** Texto de cada interruptor en «Mi cuenta». `soloAdmin` lo oculta al resto de los roles. */
export const ETIQUETAS_TIPO_PUSH: Record<TipoPush, { titulo: string; descripcion: string; soloAdmin?: boolean }> = {
  estado_reporte: {
    titulo: "Estado de mis reportes",
    descripcion: "Cuando un reporte tuyo pasa a Reparado o Rechazado, o se le asigna una cuadrilla.",
  },
  comentarios: {
    titulo: "Comentarios",
    descripcion: "Cuando alguien comenta en un reporte tuyo.",
  },
  mascotas: {
    titulo: "Mascotas",
    descripcion: "Cuando una mascota que publicaste figura como encontrada.",
  },
  moderacion: {
    titulo: "Contenido para moderar",
    descripcion: "Fotos y reportes que necesitan una revisión manual.",
    soloAdmin: true,
  },
}

/** Contenido de una notificación push; el service worker lo muestra tal cual. */
export type MensajePush = {
  titulo: string
  cuerpo: string
  /** Ruta dentro del sitio que se abre al tocar la notificación (p. ej. `/reportes/12`). */
  url: string
  /** Agrupa notificaciones: una nueva con la misma etiqueta reemplaza a la anterior. */
  etiqueta: string
}

/**
 * Indica si un valor es un tipo de notificación push válido.
 *
 * @param valor - Valor recibido desde el cliente.
 * @returns `true` si es uno de `TIPOS_PUSH`.
 */
export function esTipoPush(valor: unknown): valor is TipoPush {
  return typeof valor === "string" && (TIPOS_PUSH as readonly string[]).includes(valor)
}
