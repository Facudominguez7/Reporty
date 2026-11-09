/**
 * Punto de entrada del Worker: reutiliza el handler `fetch` que genera OpenNext y agrega el
 * Cron Trigger semanal del archivo de auditoría.
 * See https://opennext.js.org/cloudflare/howtos/custom-worker
 */
// @ts-ignore `.open-next/worker.js` is generated at build time by `opennextjs-cloudflare build`.
import { default as handler } from "./.open-next/worker.js"

import { dispararArchivoAuditoria, type EntornoCronAuditoria } from "./lib/cloudflare/cron-auditoria"

type ContextoEjecucion = { waitUntil(promesa: Promise<unknown>): void }
type ManejadorOpenNext = { fetch(peticion: Request, entorno: unknown, contexto: ContextoEjecucion): Promise<Response> }

const app = handler as ManejadorOpenNext

export default {
  fetch: app.fetch,
  /** Corre la ejecución programada del archivo de auditoría a través de la propia app. */
  async scheduled(_evento: unknown, entorno: EntornoCronAuditoria, contexto: ContextoEjecucion) {
    contexto.waitUntil(
      dispararArchivoAuditoria((peticion) => app.fetch(peticion, entorno, contexto), entorno).then(
        (resumen) => console.log("Archivo de auditoría:", JSON.stringify(resumen)),
      ),
    )
  },
}
