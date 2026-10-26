/** Pruebas sin red del adaptador y sus límites de consumo. */
import { afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
import { moderarImagen } from './sightengine.server'

/** Genera el JSON oficial mínimo sin compartir ejecución de otras suites. */
function segura() {
  return { status: 'success', request: { operations: 2 }, nudity: Object.fromEntries(['sexual_activity', 'sexual_display', 'erotica', 'very_suggestive', 'suggestive', 'mildly_suggestive', 'none'].map(campo => [campo, campo === 'none' ? 1 : 0])), weapon: { classes: { firearm: 0, firearm_gesture: 0, firearm_toy: 0, knife: 0 } }, gore: { prob: 0, classes: Object.fromEntries(['very_bloody', 'slightly_bloody', 'body_organ', 'serious_injury', 'superficial_injury', 'corpse', 'skull', 'unconscious', 'body_waste', 'other'].map(campo => [campo, 0])) }, violence: { prob: 0, classes: { physical_violence: 0, firearm_threat: 0, combat_sport: 0 } } }
}
/** Habilita únicamente credenciales ficticias dentro del entorno aislado. */
function configurar() {
  vi.stubEnv('SIGHTENGINE_PLAN_FREE_CONFIRMADO', 'true')
  vi.stubEnv('SIGHTENGINE_API_USER', 'usuario_prueba')
  vi.stubEnv('SIGHTENGINE_API_SECRET', 'secreto_prueba')
}
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers() })

describe('moderarImagen', () => {
  it.each(['SIGHTENGINE_PLAN_FREE_CONFIRMADO', 'SIGHTENGINE_API_USER', 'SIGHTENGINE_API_SECRET'])('no llama sin %s', async campo => {
    configurar(); vi.stubEnv(campo, '')
    const llamada = vi.fn(); vi.stubGlobal('fetch', llamada)
    expect((await moderarImagen(new Blob(['imagen']))).decision).toBe('REVIEW')
    expect(llamada).not.toHaveBeenCalled()
  })
  it('envía multipart al endpoint fijo sin redirección ni reintento', async () => {
    configurar(); const llamada = vi.fn().mockResolvedValue(new Response(JSON.stringify(segura())))
    vi.stubGlobal('fetch', llamada)
    expect((await moderarImagen(new Blob(['imagen']))).decision).toBe('APPROVED')
    expect(llamada).toHaveBeenCalledTimes(1)
    const [url, opciones] = llamada.mock.calls[0]
    expect(url).toBe('https://api.sightengine.com/1.0/check.json')
    expect(opciones.method).toBe('POST'); expect(opciones.redirect).toBe('error')
    expect(opciones.body.get('models')).toBe('nudity-2.1,weapon,gore-2.0,violence')
    expect(opciones.body.get('media')).toBeInstanceOf(Blob)
  })
  it.each([429, 500, 503])('revisa HTTP %s sin reintentar', async estado => {
    configurar(); const llamada = vi.fn().mockResolvedValue(new Response(JSON.stringify({ request: { operations: 0 } }), { status: estado }))
    vi.stubGlobal('fetch', llamada)
    const resultado = await moderarImagen(new Blob())
    expect(resultado.decision).toBe('REVIEW'); expect(resultado.operaciones).toBe(0)
    expect(llamada).toHaveBeenCalledTimes(1)
  })
  it('revisa usage_limit sin exponer mensajes', async () => {
    configurar(); vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'failure', request: { operations: 0 }, error: { type: 'usage_limit', message: 'secreto_prueba' } }))))
    const resultado = await moderarImagen(new Blob())
    expect(resultado.decision).toBe('REVIEW'); expect(JSON.stringify(resultado)).not.toContain('secreto_prueba')
  })
  it.each(['json', 'red'])('revisa errores %s y explicita consumo desconocido', async caso => {
    configurar(); vi.stubGlobal('fetch', caso === 'json' ? vi.fn().mockResolvedValue(new Response('{')) : vi.fn().mockRejectedValue(new Error('secreto_prueba')))
    const resultado = await moderarImagen(new Blob())
    expect(resultado.decision).toBe('REVIEW'); expect(resultado.motivos).toContain('operaciones_desconocidas')
    expect(JSON.stringify(resultado)).not.toContain('secreto_prueba')
  })
  it.each(['NaN', '0', '1.1'])('no llama con umbral inválido %s', async umbral => {
    configurar(); vi.stubEnv('MODERACION_UMBRAL_REVISION', umbral)
    const llamada = vi.fn(); vi.stubGlobal('fetch', llamada)
    expect((await moderarImagen(new Blob())).decision).toBe('REVIEW'); expect(llamada).not.toHaveBeenCalled()
  })
  it('limita también un cuerpo que nunca termina', async () => {
    configurar(); vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => new Promise(() => {}) }))
    const pendiente = moderarImagen(new Blob())
    await vi.advanceTimersByTimeAsync(8000)
    expect((await pendiente).decision).toBe('REVIEW')
  })
})
