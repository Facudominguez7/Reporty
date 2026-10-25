/** Adaptador exclusivo servidor. El consumidor debe reservar cuota antes de invocarlo. */
import 'server-only'
import { consumoModeracion, decidirModeracion } from './decision'
import type { ResultadoModeracion } from './tipos'

/** Clasifica una imagen sin reintentos y con plazo total de ocho segundos. */
export async function moderarImagen(archivo: Blob): Promise<ResultadoModeracion> {
  const usuario = process.env.SIGHTENGINE_API_USER?.trim()
  const secreto = process.env.SIGHTENGINE_API_SECRET?.trim()
  const revision = Number(process.env.MODERACION_UMBRAL_REVISION ?? '0.5')
  const rechazo = Number(process.env.MODERACION_UMBRAL_RECHAZO ?? '0.9')
  const base: ResultadoModeracion = { decision: 'REVIEW', motivos: [], operaciones: 0, proveedor: 'sightengine' }
  if (process.env.SIGHTENGINE_PLAN_FREE_CONFIRMADO !== 'true' || !usuario || !secreto) return { ...base, motivos: ['proveedor_no_configurado'] }
  if (![revision, rechazo].every(valor => Number.isFinite(valor) && valor > 0 && valor <= 1) || revision >= rechazo) return { ...base, motivos: ['umbrales_invalidos'] }
  const controlador = new AbortController()
  let temporizador: ReturnType<typeof setTimeout> | undefined
  try {
    const formulario = new FormData()
    formulario.append('media', archivo, 'imagen')
    formulario.append('models', 'nudity-2.1,weapon,gore-2.0,violence')
    formulario.append('api_user', usuario)
    formulario.append('api_secret', secreto)
    const vencimiento = new Promise<never>((_, rechazar) => {
      temporizador = setTimeout(() => { controlador.abort(); rechazar(new Error('plazo_agotado')) }, 8000)
    })
    const consulta = (async (): Promise<ResultadoModeracion> => {
      const respuesta = await fetch('https://api.sightengine.com/1.0/check.json', { method: 'POST', body: formulario, redirect: 'error', signal: controlador.signal, cache: 'no-store' })
      const datos: unknown = await respuesta.json()
      if (!respuesta.ok) {
        const consumo = consumoModeracion(datos)
        return { ...base, ...consumo, motivos: [...consumo.motivos, respuesta.status === 429 ? 'cuota_agotada' : 'proveedor_no_disponible'] }
      }
      return decidirModeracion(datos, { revision, rechazo })
    })()
    return await Promise.race([consulta, vencimiento])
  } catch {
    return { ...base, motivos: ['proveedor_no_disponible', 'operaciones_desconocidas'] }
  } finally {
    if (temporizador !== undefined) clearTimeout(temporizador)
  }
}
