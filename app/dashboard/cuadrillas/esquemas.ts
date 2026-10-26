import { z } from "zod"

import { REPORT_STATE_IDS } from "@/lib/authz/catalog"

/** Identificador numérico positivo de un reporte. */
export const esquemaIdReporte = z.coerce.number().int().positive("Identificador de reporte inválido.")

/** Identificador numérico positivo de una cuadrilla. */
export const esquemaIdCuadrilla = z.coerce.number().int().positive("Identificador de cuadrilla inválido.")

/** Identificador numérico positivo de una asignación de cuadrilla. */
export const esquemaIdAsignacion = z.coerce.number().int().positive("Identificador de asignación inválido.")

/** Recorta y normaliza un campo de texto opcional: cadena vacía o solo espacios se convierte en `null`. */
function normalizarOpcionalANull(valor: string | undefined) {
  const recortado = valor?.trim()
  return recortado ? recortado : null
}

/** Datos de alta/edición de una cuadrilla del catálogo. */
export const esquemaCuadrilla = z.object({
  nombre: z
    .string()
    .trim()
    .min(3, "El nombre debe tener al menos 3 caracteres.")
    .max(120, "El nombre no puede superar 120 caracteres."),
  descripcion: z
    .string()
    .max(500, "La descripción no puede superar 500 caracteres.")
    .optional()
    .transform(normalizarOpcionalANull),
  telefono: z
    .string()
    .max(40, "El teléfono no puede superar 40 caracteres.")
    .optional()
    .transform(normalizarOpcionalANull),
})

/** Contrato histórico del consumidor: datos ya validados y normalizados. */
export type DatosCuadrillaInput = z.output<typeof esquemaCuadrilla>

/** Estados operativos válidos que puede tomar una asignación de cuadrilla. */
export const esquemaEstadoOperativo = z.enum(["en_progreso", "cerrada"])

/**
 * Estado administrativo final de un reporte al confirmarlo desde el flujo de cuadrillas.
 * Deliberadamente más estricto que el esquema genérico de `app/reportes/[id]/actions.ts`: el
 * cierre administrativo nunca debe aceptar un `estado_id` arbitrario del cliente, solo
 * Reparado o Rechazado.
 */
export const esquemaEstadoAdministrativo = z.union([
  z.literal(REPORT_STATE_IDS.REPARADO),
  z.literal(REPORT_STATE_IDS.RECHAZADO),
])

/** Observación de texto libre, opcional: si viene vacía o solo espacios se descarta (`undefined`). */
export const esquemaObservacionOpcional = z
  .string()
  .max(1000, "La observación no puede superar 1000 caracteres.")
  .optional()
  .transform((valor) => {
    const recortado = valor?.trim()
    return recortado ? recortado : undefined
  })

/** Observación de texto libre obligatoria (para registrar una observación por sí sola). */
export const esquemaObservacionObligatoria = z
  .string()
  .trim()
  .min(1, "La observación no puede estar vacía.")
  .max(1000, "La observación no puede superar 1000 caracteres.")

/** Datos para asignar una cuadrilla a un reporte sin cuadrilla asignada. */
export const esquemaAsignarCuadrilla = z.object({
  reporteId: esquemaIdReporte,
  cuadrillaId: esquemaIdCuadrilla,
  observacion: esquemaObservacionOpcional,
  observacionPublica: z.boolean().default(false),
})

export type DatosAsignarCuadrilla = z.infer<typeof esquemaAsignarCuadrilla>

/** Datos para reasignar un reporte a otra cuadrilla (misma forma que la asignación inicial). */
export const esquemaReasignarCuadrilla = esquemaAsignarCuadrilla

export type DatosReasignarCuadrilla = z.infer<typeof esquemaReasignarCuadrilla>

/** Datos para cancelar una intervención de cuadrilla: el reporte vuelve a quedar sin cuadrilla. */
export const esquemaCancelarIntervencion = z.object({
  asignacionId: esquemaIdAsignacion,
  observacion: esquemaObservacionOpcional,
  observacionPublica: z.boolean().default(false),
})

export type DatosCancelarIntervencion = z.infer<typeof esquemaCancelarIntervencion>

/** Datos para registrar una observación libre sobre una asignación abierta. */
export const esquemaRegistrarObservacion = z.object({
  asignacionId: esquemaIdAsignacion,
  observacion: esquemaObservacionObligatoria,
  observacionPublica: z.boolean().default(false),
})

export type DatosRegistrarObservacion = z.infer<typeof esquemaRegistrarObservacion>

/** Datos para cerrar un reporte con cuadrilla (Reparado/Rechazado). */
export const esquemaCerrarReporteConCuadrilla = z.object({
  reporteId: esquemaIdReporte,
  nuevoEstadoId: esquemaEstadoAdministrativo,
  comentario: esquemaObservacionOpcional,
})

export type DatosCerrarReporteConCuadrilla = z.infer<typeof esquemaCerrarReporteConCuadrilla>
