/** Contrato independiente del proveedor de clasificación. */
export type DecisionModeracion = 'APPROVED' | 'REJECTED' | 'REVIEW'
export interface ResultadoModeracion {
  decision: DecisionModeracion
  motivos: string[]
  /** Cero con motivo operaciones_desconocidas no significa consumo nulo. */
  operaciones: number
  proveedor: string
}
export interface UmbralesModeracion { revision: number; rechazo: number }
