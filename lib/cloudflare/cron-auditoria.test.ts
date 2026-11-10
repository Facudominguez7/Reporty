import { describe, expect, it, vi } from "vitest"

import { dispararArchivoAuditoria, CRON_ARCHIVO_AUDITORIA } from "./cron-auditoria"

const secreto = "s".repeat(40)

describe("dispararArchivoAuditoria", () => {
  it("llama al endpoint del cron con POST, Bearer y el lote de 1000 que usaba Hostinger", async () => {
    const fetchApp = vi.fn(async (_peticion: Request) => Response.json({ ok: true }))
    await dispararArchivoAuditoria(fetchApp, { AUDIT_ARCHIVE_CRON_SECRET: secreto, NEXT_PUBLIC_APP_URL: "https://reporty.com.ar" })
    const peticion = fetchApp.mock.calls[0][0]
    expect(peticion.method).toBe("POST")
    expect(peticion.url).toBe("https://reporty.com.ar/api/cron/auditoria-archivo?limite=1000")
    expect(peticion.headers.get("authorization")).toBe(`Bearer ${secreto}`)
  })

  it("usa reporty.com.ar cuando no hay URL configurada", async () => {
    const fetchApp = vi.fn(async (_peticion: Request) => Response.json({ ok: true }))
    await dispararArchivoAuditoria(fetchApp, { AUDIT_ARCHIVE_CRON_SECRET: secreto })
    expect(fetchApp.mock.calls[0][0].url).toBe("https://reporty.com.ar/api/cron/auditoria-archivo?limite=1000")
  })

  it("falla sin secreto, sin llamar al endpoint", async () => {
    const fetchApp = vi.fn()
    await expect(dispararArchivoAuditoria(fetchApp, {})).rejects.toThrow("AUDIT_ARCHIVE_CRON_SECRET")
    expect(fetchApp).not.toHaveBeenCalled()
  })

  it("falla cuando la corrida responde con error, para que quede registrada", async () => {
    const fetchApp = vi.fn(async () => Response.json({ error: "No autorizado." }, { status: 401 }))
    await expect(dispararArchivoAuditoria(fetchApp, { AUDIT_ARCHIVE_CRON_SECRET: secreto })).rejects.toThrow("401")
  })

  it("mantiene la programación semanal del cron de Hostinger", () => {
    expect(CRON_ARCHIVO_AUDITORIA).toBe("0 6 * * 0")
  })
})
