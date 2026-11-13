/**
 * Punto de entrada del Worker: reutiliza el handler `fetch` que genera OpenNext y agrega los
 * Cron Triggers: el archivo semanal de auditoría y el recordatorio diario por correo.
 * See https://opennext.js.org/cloudflare/howtos/custom-worker
 */
// @ts-ignore `.open-next/worker.js` is generated at build time by `opennextjs-cloudflare build`.
import { default as handler } from "./.open-next/worker.js"

import { dispararArchivoAuditoria, type EntornoCronAuditoria } from "./lib/cloudflare/cron-auditoria"
import { CRON_RECORDATORIOS, dispararRecordatorios } from "./lib/cloudflare/cron-recordatorios"

type ContextoEjecucion = { waitUntil(promesa: Promise<unknown>): void }
type ManejadorOpenNext = { fetch(peticion: Request, entorno: unknown, contexto: ContextoEjecucion): Promise<Response> }

const app = handler as ManejadorOpenNext

export default {
  fetch: app.fetch,
  /**
   * Corre la ejecución programada que corresponde al cron que disparó el evento: el recordatorio
   * diario o, para cualquier otro, el archivo de auditoría.
   */
  async scheduled(evento: { cron?: string }, entorno: EntornoCronAuditoria, contexto: ContextoEjecucion) {
    const fetchApp = (peticion: Request) => app.fetch(peticion, entorno, contexto)
    if (evento.cron === CRON_RECORDATORIOS) {
      contexto.waitUntil(
        dispararRecordatorios(fetchApp, entorno).then((resumen) => console.log("Recordatorios:", JSON.stringify(resumen))),
      )
      return
    }
    contexto.waitUntil(
      dispararArchivoAuditoria(fetchApp, entorno).then(
        (resumen) => console.log("Archivo de auditoría:", JSON.stringify(resumen)),
      ),
    )
  },
}
