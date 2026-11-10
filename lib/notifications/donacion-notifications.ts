import { Resend } from "resend"

import { formatearMonto } from "@/lib/donaciones/montos"
import { resolveSiteUrl } from "@/lib/seo/site"
import { emailButton, emailField, emailParagraph, emailPanel, escapeHtml, renderEmailLayout } from "./email-layout"

const REMITENTE = "Reporty <team@notificaciones.reporty.com.ar>"

/** Datos de una donación aprobada que necesitan los emails. */
export type DonacionAprobada = {
  pagoId: string
  monto: number
  nombre: string | null
  mensaje: string | null
}

/**
 * Crea el cliente de Resend. Lanza si falta la clave, igual que el resto de los avisos.
 */
function clienteResend() {
  const clave = process.env.RESEND_API_KEY
  if (!clave) throw new Error("RESEND_API_KEY is not configured")
  return new Resend(clave)
}

/**
 * Lanza si Resend devolvió un error, porque `emails.send` no lanza por sí solo y el
 * llamador necesita saberlo para reintentar.
 */
function exigirEnvio(resultado: { error: { message: string } | null }) {
  if (resultado.error) throw new Error(`Resend: ${resultado.error.message}`)
}

/**
 * Agradece la donación a quien la hizo con sesión iniciada.
 */
export async function enviarAgradecimientoDonante({ destinatario, nombreUsuario, donacion }: {
  destinatario: string
  nombreUsuario: string | null
  donacion: DonacionAprobada
}) {
  const sitio = resolveSiteUrl(process.env.NEXT_PUBLIC_APP_URL)
  const monto = formatearMonto(donacion.monto)
  const saludo = `¡Hola ${nombreUsuario || "vecino"}!`
  const asunto = `Gracias por tu donación de ${monto}`
  const cuerpo = "Tu aporte ayuda a pagar los servidores, los mapas y los avisos que mantienen Reporty gratis para toda la ciudad."

  exigirEnvio(await clienteResend().emails.send({
    from: REMITENTE,
    to: [destinatario],
    subject: asunto,
    html: renderEmailLayout({
      assetBaseUrl: sitio,
      title: asunto,
      kicker: "Donación recibida",
      preheader: `${asunto}. ${cuerpo}`,
      heading: saludo,
      body: [
        emailParagraph(escapeHtml(`${asunto}.`)),
        emailPanel({ eyebrow: `Pago N.º ${donacion.pagoId}`, title: monto, badge: { label: "Aprobada", tone: "success" } }),
        emailParagraph(escapeHtml(cuerpo)),
        emailButton("Volver a Reporty", `${sitio}/mapa`),
      ].join("\n"),
    }),
    text: [saludo, `${asunto}.`, cuerpo, `Volver a Reporty: ${sitio}/mapa`].join("\n\n"),
  }, { idempotencyKey: `donacion/${donacion.pagoId}/donante` }))
}

/**
 * Avisa a cada admin que entró una donación aprobada, con nombre y mensaje si los dejaron.
 */
export async function enviarAvisoDonacionAdmins({ destinatarios, donacion }: { destinatarios: string[]; donacion: DonacionAprobada }) {
  if (!destinatarios.length) return

  const sitio = resolveSiteUrl(process.env.NEXT_PUBLIC_APP_URL)
  const monto = formatearMonto(donacion.monto)
  const asunto = `Nueva donación de ${monto}`
  const panel = `${sitio}/admin/donaciones`
  const resend = clienteResend()

  await Promise.all(destinatarios.map(async (destinatario) => {
    exigirEnvio(await resend.emails.send({
      from: REMITENTE,
      to: [destinatario],
      subject: asunto,
      html: renderEmailLayout({
        assetBaseUrl: sitio,
        title: asunto,
        kicker: "Donaciones",
        preheader: `${asunto} por Mercado Pago.`,
        heading: asunto,
        body: [
          emailParagraph("Mercado Pago aprobó una donación para Reporty."),
          emailPanel({
            eyebrow: `Pago N.º ${donacion.pagoId}`,
            title: monto,
            badge: { label: "Aprobada", tone: "success" },
            content: [
              emailField("Nombre", escapeHtml(donacion.nombre ?? "Sin nombre")),
              donacion.mensaje ? emailField("Mensaje", escapeHtml(donacion.mensaje)) : "",
            ].join("\n"),
          }),
          emailButton("Ver donaciones", panel),
        ].join("\n"),
      }),
      text: [
        `${asunto} por Mercado Pago.`,
        `Nombre: ${donacion.nombre ?? "Sin nombre"}`,
        donacion.mensaje ? `Mensaje: ${donacion.mensaje}` : "",
        `Ver donaciones: ${panel}`,
      ].filter(Boolean).join("\n\n"),
    }, { idempotencyKey: `donacion/${donacion.pagoId}/admin/${destinatario}` }))
  }))
}
