/**
 * Disparo diario del recordatorio quincenal desde un Cron Trigger de Cloudflare. Igual que el
 * archivo de auditoría, la petición no sale a internet: pasa por el `fetch` del propio Worker.
 */

/** Todos los días 13:00 UTC (10:00 en Argentina), en horario razonable para recibir un correo. */
export const CRON_RECORDATORIOS = "0 13 * * *"

const URL_PREDETERMINADA = "https://reporty.com.ar"

/** Variables del Worker que necesita el disparo; reutiliza el secreto del cron de auditoría. */
export type EntornoCronRecordatorios = {
  AUDIT_ARCHIVE_CRON_SECRET?: string
  NEXT_PUBLIC_APP_URL?: string
}

/**
 * Ejecuta una corrida de recordatorios pasando por el handler de la app.
 *
 * @param fetchApp - Handler de la app que atiende la petición.
 * @param entorno - Variables del Worker con el secreto del cron.
 * @returns El cuerpo JSON con los conteos de la corrida.
 */
export async function dispararRecordatorios(
  fetchApp: (peticion: Request) => Promise<Response>,
  entorno: EntornoCronRecordatorios,
): Promise<unknown> {
  const secreto = entorno.AUDIT_ARCHIVE_CRON_SECRET?.trim()
  if (!secreto) throw new Error("Falta AUDIT_ARCHIVE_CRON_SECRET para el cron de recordatorios.")

  const base = entorno.NEXT_PUBLIC_APP_URL?.trim() || URL_PREDETERMINADA
  const url = new URL("/api/cron/recordatorios", base)
  const respuesta = await fetchApp(new Request(url, { method: "POST", headers: { Authorization: `Bearer ${secreto}` } }))
  const cuerpo = await respuesta.json().catch(() => null)
  if (!respuesta.ok) throw new Error(`La corrida de recordatorios respondió ${respuesta.status}.`)
  return cuerpo
}
