/**
 * Disparo del archivo de auditoría desde un Cron Trigger de Cloudflare. Reemplaza al cron de
 * Hostinger (`~/reporty-audit-cron.sh`), que llamaba al mismo endpoint con `curl`.
 */

/** Programación semanal: domingos 06:00 UTC, como el cron de Hostinger. Cloudflare rechaza "0" como domingo. */
export const CRON_ARCHIVO_AUDITORIA = "0 6 * * SUN"

/** Lote por corrida: el mismo `limite` que usaba el script de Hostinger. */
const LIMITE_POR_CORRIDA = 1000

const URL_PREDETERMINADA = "https://reporty.com.ar"

/** Variables del Worker que necesita el disparo. */
export type EntornoCronAuditoria = {
  AUDIT_ARCHIVE_CRON_SECRET?: string
  NEXT_PUBLIC_APP_URL?: string
}

/**
 * Ejecuta una corrida real del archivo de auditoría pasando por el handler de la app.
 * La petición no sale a internet: `fetchApp` es el `fetch` del propio Worker.
 *
 * @param fetchApp handler de la app que atiende la petición.
 * @param entorno variables del Worker con el secreto del cron.
 * @returns el cuerpo JSON del resumen de la corrida.
 */
export async function dispararArchivoAuditoria(
  fetchApp: (peticion: Request) => Promise<Response>,
  entorno: EntornoCronAuditoria,
): Promise<unknown> {
  const secreto = entorno.AUDIT_ARCHIVE_CRON_SECRET?.trim()
  if (!secreto) throw new Error("Falta AUDIT_ARCHIVE_CRON_SECRET para el cron del archivo de auditoría.")

  const base = entorno.NEXT_PUBLIC_APP_URL?.trim() || URL_PREDETERMINADA
  const url = new URL(`/api/cron/auditoria-archivo?limite=${LIMITE_POR_CORRIDA}`, base)
  const respuesta = await fetchApp(new Request(url, { method: "POST", headers: { Authorization: `Bearer ${secreto}` } }))
  const cuerpo = await respuesta.json().catch(() => null)
  if (!respuesta.ok) throw new Error(`La corrida del archivo de auditoría respondió ${respuesta.status}.`)
  return cuerpo
}
