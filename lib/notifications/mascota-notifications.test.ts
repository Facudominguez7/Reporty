import { beforeEach, describe, expect, it, vi } from "vitest"
import { enviarAvisoEstadoMascota } from "./mascota-notifications"

const mocks = vi.hoisted(() => ({ send: vi.fn() }))
vi.mock("resend", () => ({ Resend: class { emails = { send: mocks.send } } }))

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv("RESEND_API_KEY", "test-key")
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://reporty.com.ar")
})

describe("notificaciones de mascotas", () => {
  it("envía plantilla de mascota encontrada sin vocabulario de reportes reparados", async () => {
    await enviarAvisoEstadoMascota({ destinatario: "autora@example.test", mascotaId: 12, estado: "encontrada", eventoId: "evento-1" })
    const [email, options] = mocks.send.mock.calls[0]
    expect(email.to).toEqual(["autora@example.test"])
    expect(email.subject).toBe("La mascota que reportaste figura como encontrada")
    expect(email.html).toContain("La mascota que reportaste figura como encontrada")
    expect(email.html).toContain("La publicación que reportaste ahora figura como encontrada.")
    expect(email.html).toContain("/mascotas/12")
    expect(email.text).toContain("La publicación que reportaste ahora figura como encontrada.")
    expect(email.text).not.toContain("tu mascota")
    expect(email.text).not.toMatch(/reparad/i)
    expect(options).toEqual({ idempotencyKey: "mascota/evento-1" })
  })

  it("usa texto específico para el retiro administrativo", async () => {
    await enviarAvisoEstadoMascota({ destinatario: "autora@example.test", mascotaId: 12, estado: "retirada", eventoId: "evento-2" })
    expect(mocks.send.mock.calls[0][0].text).toMatch(/retirad/i)
    expect(mocks.send.mock.calls[0][0].text).not.toMatch(/reparad/i)
  })

  it("propaga fallos del proveedor para dejar el outbox reintentable", async () => {
    mocks.send.mockRejectedValueOnce(new Error("provider unavailable"))
    await expect(enviarAvisoEstadoMascota({ destinatario: "autora@example.test", mascotaId: 12, estado: "encontrada", eventoId: "evento-3" })).rejects.toThrow("provider unavailable")
  })
})
