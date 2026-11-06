import { Resend } from "resend"
import { resolveSiteUrl } from "@/lib/seo/site"
import { emailButton, emailParagraph, emailPanel, escapeHtml, renderEmailLayout } from "./email-layout"

export type EstadoAvisoMascota = "encontrada" | "retirada"

/** El consumidor del outbox aporta únicamente el destinatario persistido y evento inmutable. */
export async function enviarAvisoEstadoMascota({
  destinatario, mascotaId, estado, eventoId,
}: { destinatario: string; mascotaId: number; estado: EstadoAvisoMascota; eventoId: string }) {
  if (!destinatario.trim()) throw new Error("Destinatario de notificación vacío")
  const encontrada = estado === "encontrada"
  const titulo = encontrada ? "Tu mascota fue marcada como encontrada" : "Tu publicación de mascota fue retirada por administración"
  const texto = encontrada
    ? "La publicación de tu mascota ahora figura como encontrada."
    : "La publicación de tu mascota fue retirada por administración. Si necesitás más información, contactá al equipo de Reporty."
  const url = `${resolveSiteUrl(process.env.NEXT_PUBLIC_APP_URL)}/mascotas/${mascotaId}`
  const resend = new Resend(process.env.RESEND_API_KEY!)
  return resend.emails.send({
    from: "Reporty <team@notificaciones.reporty.com.ar>", to: [destinatario],
    subject: encontrada ? "Actualización de tu mascota perdida" : "Aviso sobre tu publicación de mascota",
    html: renderEmailLayout({
      assetBaseUrl: resolveSiteUrl(process.env.NEXT_PUBLIC_APP_URL), title: titulo,
      kicker: encontrada ? "Mascota encontrada" : "Moderación de mascotas", preheader: texto,
      heading: titulo,
      body: [emailParagraph(escapeHtml(texto)), emailPanel({ eyebrow: `Mascota N.º ${mascotaId}`, title: encontrada ? "Encontrada" : "Retirada" }), emailButton("Ver publicación", url)].join("\n"),
    }),
    text: `${titulo}\n\n${texto}\n\nVer publicación: ${url}`,
  }, { idempotencyKey: `mascota/${eventoId}` })
}
