/** Motor puro: valida indicadores oficiales antes de decidir; nunca publica datos incompletos. */
import type { ResultadoModeracion, UmbralesModeracion } from './tipos'

const rutasSexuales = ['sexual_activity', 'sexual_display', 'erotica', 'very_suggestive', 'suggestive', 'mildly_suggestive', 'none'].map(campo => `nudity.${campo}`)
const rutasArmas = ['firearm', 'firearm_gesture', 'firearm_toy', 'knife'].map(campo => `weapon.classes.${campo}`)
const rutasGraficas = ['very_bloody', 'slightly_bloody', 'body_organ', 'serious_injury', 'superficial_injury', 'corpse', 'skull', 'unconscious', 'body_waste', 'other'].map(campo => `gore.classes.${campo}`)
const rutasViolencia = ['physical_violence', 'firearm_threat', 'combat_sport'].map(campo => `violence.classes.${campo}`)
const rutas = [...rutasSexuales, ...rutasArmas, ...rutasGraficas, ...rutasViolencia, 'gore.prob', 'violence.prob']

/** Lee objetos desconocidos sin confiar en el JSON remoto. */
function leer(objeto: unknown, ruta: string): unknown {
  return ruta.split('.').reduce<unknown>((actual, clave) => actual !== null && typeof actual === 'object' ? (actual as Record<string, unknown>)[clave] : undefined, objeto)
}

/** Conserva consumo reportado válido, incluso cero o valores inesperados. */
export function consumoModeracion(respuesta: unknown): Pick<ResultadoModeracion, 'operaciones' | 'motivos'> {
  const operaciones = leer(respuesta, 'request.operations')
  return typeof operaciones === 'number' && Number.isSafeInteger(operaciones) && operaciones >= 0
    ? { operaciones, motivos: operaciones === 2 ? [] : ['operaciones_inesperadas'] }
    : { operaciones: 0, motivos: ['operaciones_desconocidas'] }
}

/** Aplica política conservadora; las probabilidades no son certezas. */
export function decidirModeracion(respuesta: unknown, umbrales: UmbralesModeracion = { revision: 0.5, rechazo: 0.9 }): ResultadoModeracion {
  const consumo = consumoModeracion(respuesta)
  const base: ResultadoModeracion = { decision: 'REVIEW', proveedor: 'sightengine', ...consumo }
  if (![umbrales.revision, umbrales.rechazo].every(valor => Number.isFinite(valor) && valor > 0 && valor <= 1) || umbrales.revision >= umbrales.rechazo) return { ...base, motivos: [...base.motivos, 'umbrales_invalidos'] }
  if (leer(respuesta, 'status') !== 'success') return { ...base, motivos: [...base.motivos, 'proveedor_no_disponible'] }
  const puntuaciones = new Map<string, number>()
  for (const ruta of rutas) {
    const valor = leer(respuesta, ruta)
    if (typeof valor !== 'number' || !Number.isFinite(valor) || valor < 0 || valor > 1) return { ...base, motivos: [...base.motivos, 'respuesta_incompleta'] }
    puntuaciones.set(ruta, valor)
  }
  if (base.motivos.length) return base
  const explicitas = ['nudity.sexual_activity', 'nudity.sexual_display', 'gore.classes.very_bloody', 'gore.classes.body_organ', 'gore.classes.corpse']
  if (explicitas.some(ruta => puntuaciones.get(ruta)! >= umbrales.rechazo)) return { ...base, decision: 'REJECTED', motivos: ['contenido_explicito_o_grafico_extremo'] }
  const ambiguas = rutas.filter(ruta => ruta !== 'nudity.none')
  if (ambiguas.some(ruta => puntuaciones.get(ruta)! >= umbrales.revision) || puntuaciones.get('nudity.none')! < umbrales.revision) return { ...base, motivos: ['contenido_ambiguo_armas_violencia_o_lesiones'] }
  return { ...base, decision: 'APPROVED', motivos: ['indicadores_seguros'] }
}
