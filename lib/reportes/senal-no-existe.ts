/**
 * Señal social de los votos «No existe». Le cuenta al vecino que no es el único sin mostrar
 * cuántos votos hay ni cuántos faltan para la revisión: un número invitaba al troleo.
 */

export type SenalNoExiste = "ninguna" | "otros" | "solo_vos" | "vos_y_otros" | "en_revision"

export type DatosSenalNoExiste = {
  /** Votos «No existe» del reporte, incluido el de quien mira. */
  votos: number
  /** Si quien mira ya votó «No existe». */
  yaVoto: boolean
  /** Si hay una revisión de rechazo pendiente para un administrador. */
  enRevision: boolean
  /** Si el reporte ya está Reparado o Rechazado. */
  cerrado: boolean
}

/**
 * Decide qué aviso mostrar debajo de los botones de voto.
 *
 * Un reporte cerrado no lleva aviso (ahí se ve el resumen con números). Una revisión
 * pendiente gana siempre. Si no, se cuentan solo los votos de otros vecinos: el propio
 * voto nunca alcanza para decir que «otros» lo marcaron.
 *
 * @param datos - Votos, voto propio y estado del reporte.
 * @returns La señal a mostrar.
 */
export function calcularSenalNoExiste({ votos, yaVoto, enRevision, cerrado }: DatosSenalNoExiste): SenalNoExiste {
  if (cerrado) return "ninguna"
  if (enRevision) return "en_revision"
  const hayOtros = votos - (yaVoto ? 1 : 0) > 0
  if (yaVoto) return hayOtros ? "vos_y_otros" : "solo_vos"
  return hayOtros ? "otros" : "ninguna"
}
