/** Pruebas del motor puro usando respuestas oficiales mínimas. */
import { describe, expect, it } from 'vitest'
import { decidirModeracion } from './decision'

/** Construye una respuesta segura con todos los indicadores consumidos. */
export function respuestaSegura() {
  return { status: 'success', request: { operations: 2 }, nudity: { sexual_activity: 0, sexual_display: 0, erotica: 0, very_suggestive: 0, suggestive: 0, mildly_suggestive: 0, none: 1 }, weapon: { classes: { firearm: 0, firearm_gesture: 0, firearm_toy: 0, knife: 0 } }, gore: { prob: 0, classes: { very_bloody: 0, slightly_bloody: 0, body_organ: 0, serious_injury: 0, superficial_injury: 0, corpse: 0, skull: 0, unconscious: 0, body_waste: 0, other: 0 } }, violence: { prob: 0, classes: { physical_violence: 0, firearm_threat: 0, combat_sport: 0 } } }
}

describe('decidirModeracion', () => {
  it('aprueba imagen segura', () => expect(decidirModeracion(respuestaSegura()).decision).toBe('APPROVED'))
  it('rechaza sexo explícito en el umbral', () => {
    const respuesta = respuestaSegura(); respuesta.nudity.sexual_activity = 0.9
    expect(decidirModeracion(respuesta).decision).toBe('REJECTED')
  })
  it('rechaza contenido gráfico extremo', () => {
    const respuesta = respuestaSegura(); respuesta.gore.classes.very_bloody = 0.9
    expect(decidirModeracion(respuesta).decision).toBe('REJECTED')
  })
  it.each(['firearm', 'knife'] as const)('solo revisa armas: %s', (campo) => {
    const respuesta = respuestaSegura(); respuesta.weapon.classes[campo] = 1
    expect(decidirModeracion(respuesta).decision).toBe('REVIEW')
  })
  it('revisa violencia y lesiones', () => {
    const respuesta = respuestaSegura(); respuesta.violence.prob = 0.5
    expect(decidirModeracion(respuesta).decision).toBe('REVIEW')
    respuesta.violence.prob = 0; respuesta.gore.classes.serious_injury = 0.5
    expect(decidirModeracion(respuesta).decision).toBe('REVIEW')
  })
  it('respeta límites y configuración', () => {
    const respuesta = respuestaSegura(); respuesta.nudity.suggestive = 0.49
    expect(decidirModeracion(respuesta).decision).toBe('APPROVED')
    respuesta.nudity.suggestive = 0.5
    expect(decidirModeracion(respuesta).decision).toBe('REVIEW')
    expect(decidirModeracion(respuesta, { revision: 0.6, rechazo: 0.95 }).decision).toBe('APPROVED')
  })
  it.each([NaN, Infinity, -0.1, 1.1, '0', undefined])('cierra ante puntuación inválida %s', (valor) => {
    const respuesta = respuestaSegura(); Object.assign(respuesta.nudity, { none: valor })
    expect(decidirModeracion(respuesta).decision).toBe('REVIEW')
  })
  it('revisa campos ausentes y umbrales inválidos', () => {
    expect(decidirModeracion({ status: 'success' }).decision).toBe('REVIEW')
    expect(decidirModeracion(respuestaSegura(), { revision: 0.9, rechazo: 0.5 }).decision).toBe('REVIEW')
  })
  it('ningún indicador ausente permite aprobar', () => {
    const original = respuestaSegura()
    const grupos = [original.nudity, original.weapon.classes, original.gore.classes, original.violence.classes]
    for (const grupo of grupos) {
      for (const campo of Object.keys(grupo)) {
        const copia = structuredClone(original)
        const destinos = [copia.nudity, copia.weapon.classes, copia.gore.classes, copia.violence.classes]
        Reflect.deleteProperty(destinos[grupos.indexOf(grupo)], campo)
        expect(decidirModeracion(copia).decision).toBe('REVIEW')
      }
    }
    for (const modelo of ['gore', 'violence'] as const) {
      const copia = structuredClone(original); Reflect.deleteProperty(copia[modelo], 'prob')
      expect(decidirModeracion(copia).decision).toBe('REVIEW')
    }
  })
  it.each([undefined, -1, 1.5, Infinity, '2'])('explicita consumo inválido %s', operaciones => {
    const respuesta = respuestaSegura(); Object.assign(respuesta.request, { operations: operaciones })
    const resultado = decidirModeracion(respuesta)
    expect(resultado.decision).toBe('REVIEW')
    expect(resultado.operaciones).toBe(0)
    expect(resultado.motivos).toContain('operaciones_desconocidas')
  })
  it.each([0, 7])('preserva operaciones reales %s', (operaciones) => {
    const respuesta = respuestaSegura(); respuesta.request.operations = operaciones
    expect(decidirModeracion(respuesta).operaciones).toBe(operaciones)
    expect(decidirModeracion(respuesta).decision).toBe('REVIEW')
  })
})
