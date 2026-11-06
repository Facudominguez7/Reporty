/**
 * Mensajes en español de la cola administrativa de reparaciones.
 *
 * Reflejan lo que el contrato de la base produce de verdad (L7): aceptar una
 * impugnación rechaza la evidencia y el reporte sigue pendiente; descartarla
 * reevalúa el umbral y, si se alcanza, el reporte pasa a Reparado con el
 * administrador registrado como actor en `historial_estados`. La interfaz nunca
 * afirma lo contrario.
 */

type EstadoEvidenciaVisible = "informada" | "en_verificacion" | "validada" | "rechazada" | "revertida"

/** Resultado visible de aceptar o descartar una impugnación. */
export type ImpugnacionResueltaVisible = {
  accion: "aceptada" | "descartada"
  repetida: boolean
  cerrado: boolean
  evidenciaEstado: EstadoEvidenciaVisible
  confirmaciones: number
  impugnacionesPendientes: number
}

/** Resultado visible de aprobar, rechazar o revertir una evidencia. */
export type EvidenciaResueltaVisible = {
  accion: "aprobar" | "rechazar" | "revertir"
  repetida: boolean
  cerrado: boolean
  revertido: boolean
  evidenciaEstado: EstadoEvidenciaVisible
}

/**
 * Texto posterior a aceptar o descartar una impugnación.
 *
 * @param resultado - Resultado durable devuelto por el caso de uso.
 * @returns Mensaje que describe el estado real del reporte.
 */
export function mensajeDeImpugnacionResuelta(resultado: ImpugnacionResueltaVisible): string {
  if (resultado.repetida) return "La impugnación ya estaba resuelta; no se volvió a aplicar."
  if (resultado.accion === "aceptada") {
    return "Impugnación aceptada: la evidencia quedó rechazada y el reporte sigue pendiente."
  }
  if (resultado.cerrado) {
    return `Impugnación descartada: con ${resultado.confirmaciones} confirmaciones la reparación quedó validada y el reporte pasó a Reparado. El historial de estados registra esta resolución a nombre de administración.`
  }
  return "Impugnación descartada: la verificación continúa."
}

/**
 * Texto posterior a aprobar, rechazar o revertir una evidencia.
 *
 * @param resultado - Resultado durable devuelto por el caso de uso.
 * @returns Mensaje que describe el estado real del reporte.
 */
export function mensajeDeEvidenciaResuelta(resultado: EvidenciaResueltaVisible): string {
  if (resultado.repetida) return "La evidencia ya estaba resuelta; no se volvió a aplicar."
  if (resultado.accion === "aprobar") {
    return resultado.cerrado
      ? "Evidencia aprobada: el reporte pasó a Reparado."
      : "Evidencia aprobada; el reporte ya no estaba pendiente y quedó igual."
  }
  if (resultado.accion === "rechazar") {
    return "Evidencia rechazada; el reporte sigue pendiente y sus fotos originales se conservan."
  }
  if (!resultado.revertido) {
    return "Evidencia revertida; el reporte no estaba en Reparado y no cambió de estado."
  }
  return "Reparación revertida: el reporte volvió a Pendiente y se descontaron los cinco puntos."
}
