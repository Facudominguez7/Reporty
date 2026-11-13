import { readFileSync } from "node:fs"
import { describe, expect, it, vi } from "vitest"

import { CRON_RECORDATORIOS, dispararRecordatorios } from "./cron-recordatorios"

const secreto = "s".repeat(40)

describe("dispararRecordatorios", () => {
  it("llama al endpoint de recordatorios con POST y Bearer", async () => {
    const fetchApp = vi.fn(async (_peticion: Request) => Response.json({ ok: true, enviados: 1 }))

    await expect(
      dispararRecordatorios(fetchApp, { AUDIT_ARCHIVE_CRON_SECRET: secreto, NEXT_PUBLIC_APP_URL: "https://reporty.com.ar" }),
    ).resolves.toEqual({ ok: true, enviados: 1 })

    const peticion = fetchApp.mock.calls[0][0]
    expect(peticion.method).toBe("POST")
    expect(peticion.url).toBe("https://reporty.com.ar/api/cron/recordatorios")
    expect(peticion.headers.get("authorization")).toBe(`Bearer ${secreto}`)
  })

  it("falla sin secreto, sin llamar al endpoint", async () => {
    const fetchApp = vi.fn()
    await expect(dispararRecordatorios(fetchApp, {})).rejects.toThrow("AUDIT_ARCHIVE_CRON_SECRET")
    expect(fetchApp).not.toHaveBeenCalled()
  })

  it("falla cuando la corrida responde con error", async () => {
    const fetchApp = vi.fn(async () => Response.json({ error: "x" }, { status: 500 }))
    await expect(dispararRecordatorios(fetchApp, { AUDIT_ARCHIVE_CRON_SECRET: secreto })).rejects.toThrow("500")
  })

  it("corre todos los días y está declarado en wrangler junto al cron de auditoría", () => {
    expect(CRON_RECORDATORIOS).toBe("0 13 * * *")
    expect(readFileSync("wrangler.jsonc", "utf8")).toContain(`"crons": ["0 6 * * SUN", "${CRON_RECORDATORIOS}"]`)
  })

  it("el Worker despacha el cron de recordatorios a su propio disparo", () => {
    const worker = readFileSync("custom-worker.ts", "utf8")
    expect(worker).toContain("if (evento.cron === CRON_RECORDATORIOS)")
    expect(worker).toContain("dispararRecordatorios(fetchApp, entorno)")
  })
})
