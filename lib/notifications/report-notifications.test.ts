import { beforeEach, describe, expect, it, vi } from "vitest"

import { sendCommentNotificationEmail, sendCrewAssignedEmail, sendStatusNotificationEmail, sendReportWithdrawalEmail } from "./report-notifications"

const mocks = vi.hoisted(() => ({ send: vi.fn() }))

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: mocks.send }
  },
}))

const LOGO = "https://reporty.com.ar/email/reporty-logo.png"
const MAP = "https://reporty.com.ar/email/posadas-mapa.jpg"
const PRIMARY = "#278c5a"

/** Returns the payload of the only email sent during the test. */
const sentEmail = () => {
  expect(mocks.send).toHaveBeenCalledTimes(1)
  return mocks.send.mock.calls[0][0] as { from: string; to: string[]; subject: string; html: string; text: string }
}

/**
 * Every app email shares the refreshed layout: Posadas map header, logo, brand fonts and color,
 * pill button, a reduced-motion-safe reveal, and no legacy gradient.
 */
const expectNewStyle = (html: string) => {
  expect(html).toContain(`src="${LOGO}"`)
  expect(html).toContain(`url('${MAP}')`)
  expect(html).toContain("family=Geist:")
  expect(html).toContain("'Geist Mono'")
  expect(html).toContain("@media (prefers-reduced-motion: no-preference)")
  expect(html).toContain(PRIMARY)
  expect(html).toContain("border-radius:999px")
  expect(html).not.toContain("linear-gradient")
  // The report card is a stub with a perforated divider, not a card with a colored side bar.
  expect(html).not.toContain("border-left")
  expect(html).toContain("dashed")
  expect(html).not.toContain("#16a34a")
}

describe("report notification emails", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubEnv("RESEND_API_KEY", "test-key")
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://reporty.com.ar")
  })

  it("advierte sólo al destinatario persistido, sin enlace al reporte retirado", async () => {
    await sendReportWithdrawalEmail({ destinatario: "autor@ejemplo.invalid", reporteId: 42 })
    const email = sentEmail()
    expect(email.to).toEqual(["autor@ejemplo.invalid"])
    expect(email.from).toBe("Reporty <team@notificaciones.reporty.com.ar>")
    expect(email.text).toBe("Tu reporte fue retirado porque la fotografía adjunta incumple nuestras normas de contenido. Evitá volver a publicar este tipo de material")
    expect(email.html).toContain(email.text)
    expect(email.html).toContain(`src="${LOGO}"`)
    expect(email.html).not.toContain("/reportes/")
    expect(email).not.toHaveProperty("cc")
    expect(email).not.toHaveProperty("bcc")
    expect(mocks.send.mock.calls[0][1]).toEqual({ idempotencyKey: "retiro-reporte/42" })
  })
  // Issue #176: without NEXT_PUBLIC_APP_URL the links must fall back to the production
  // domain, never to localhost — emails reach recipients outside this server.
  it("links to the production domain when the app URL is unset", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "")
    await sendCommentNotificationEmail({
      ownerEmail: "ana@example.com",
      ownerUsername: "Ana",
      commenterUsername: "Beto",
      reporteId: 42,
      reporteTitulo: "Bache en Av. Uruguay",
      comentarioContenido: "Sigue igual",
    })

    const email = sentEmail()
    expect(email.html).not.toContain("localhost")
    expect(email.html).toContain('href="https://reporty.com.ar/reportes/42"')
  })

  it("sends the new comment email with the refreshed layout", async () => {
    await sendCommentNotificationEmail({
      ownerEmail: "ana@example.com",
      ownerUsername: "Ana",
      commenterUsername: "Beto <b>",
      reporteId: 42,
      reporteTitulo: "Bache en Av. Uruguay",
      comentarioContenido: "Sigue igual <script>alert(1)</script>",
    })

    const email = sentEmail()
    expect(email.from).toBe("Reporty <team@notificaciones.reporty.com.ar>")
    expect(email.to).toEqual(["ana@example.com"])
    expect(email.subject).toBe("Nuevo comentario en tu reporte: Bache en Av. Uruguay")
    expectNewStyle(email.html)
    expect(email.html).toContain("Beto &lt;b&gt;")
    expect(email.html).toContain("Sigue igual &lt;script&gt;alert(1)&lt;/script&gt;")
    expect(email.html).not.toContain("<script>")
    expect(email.html).toContain('href="https://reporty.com.ar/reportes/42"')
    expect(email.html).toContain("REPORTE N.º 42")
    expect(email.html).toContain("NUEVO COMENTARIO")
    expect(email.text).toContain("https://reporty.com.ar/reportes/42")
    expect(email.text).toContain("Sigue igual <script>alert(1)</script>")
  })

  it.each([
    ["Reparado", "REPARADO", "Tu reporte ha sido marcado como Reparado"],
    ["Rechazado", "RECHAZADO", "Tu reporte ha sido Rechazado"],
  ])("sends the %s status email with its state pill", async (estado, pill, headline) => {
    await sendStatusNotificationEmail({
      ownerEmail: "ana@example.com",
      ownerUsername: "Ana",
      reporteId: 7,
      reporteTitulo: "Luminaria apagada",
      nuevoEstado: estado,
      comentario: "Revisado por el equipo",
    })

    const email = sentEmail()
    expect(email.subject).toBe('Tu reporte "Luminaria apagada" cambió de estado')
    expectNewStyle(email.html)
    expect(email.html).toContain(pill)
    expect(email.html).toContain(headline)
    expect(email.html).toContain("Revisado por el equipo")
    expect(email.html).toContain('href="https://reporty.com.ar/reportes/7"')
    expect(email.text).toContain(headline)
  })

  it("sends the crew assignment email with the refreshed layout", async () => {
    await sendCrewAssignedEmail({
      ownerEmail: "ana@example.com",
      ownerUsername: null,
      reporteId: 9,
      reporteTitulo: "Árbol caído",
      cuadrillaNombre: "Cuadrilla Norte",
      detalle: null,
    })

    const email = sentEmail()
    expect(email.subject).toBe('Se asignó una cuadrilla a tu reporte "Árbol caído"')
    expectNewStyle(email.html)
    expect(email.html).toContain("Hola Usuario")
    expect(email.html).toContain("Cuadrilla Norte")
    expect(email.html).toContain('href="https://reporty.com.ar/reportes/9"')
  })
})
