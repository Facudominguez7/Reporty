import "server-only";

import { Resend } from "resend";

import { resolveSiteUrl } from "@/lib/seo/site";

import {
  EMAIL_COLORS,
  emailButton,
  emailField,
  emailPanel,
  emailParagraph,
  escapeHtml,
  renderEmailLayout,
} from "./email-layout";

type CommentNotificationParams = {
  ownerEmail: string;
  ownerUsername: string | null;
  commenterUsername: string | null;
  reporteId: number;
  reporteTitulo: string;
  comentarioContenido: string;
};

type StatusNotificationParams = {
  ownerEmail: string;
  ownerUsername: string | null;
  reporteId: number;
  reporteTitulo: string;
  nuevoEstado: string;
  comentario?: string | null;
};

type CrewAssignedEmailParams = {
  ownerEmail: string;
  ownerUsername: string | null;
  reporteId: number;
  reporteTitulo: string;
  cuadrillaNombre: string | null;
  detalle?: string | null;
};

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  return new Resend(apiKey);
}

// Falls back to the production domain (never localhost): emails outlive this server and must
// always link somewhere reachable for the recipient.
function getAppUrl() {
  return resolveSiteUrl(process.env.NEXT_PUBLIC_APP_URL);
}

const SENDER = "Reporty <team@notificaciones.reporty.com.ar>";
const UNSUBSCRIBE_NOTE = "Si no querés recibir estas notificaciones, podés ajustar tus preferencias en tu perfil.";

/** Plain-text alternative: some clients only show it, and spam filters expect it. */
function plainText(lines: Array<string | null | undefined | false>) {
  return lines.filter(Boolean).join("\n\n");
}

/** Sólo el consumidor del outbox aporta el destinatario persistido. Payload estable para Resend. */
export async function sendReportWithdrawalEmail({ destinatario, reporteId }: { destinatario: string; reporteId: number }) {
  const advertencia = "Tu reporte fue retirado porque la fotografía adjunta incumple nuestras normas de contenido. Evitá volver a publicar este tipo de material";
  return getResendClient().emails.send({
    from: SENDER,
    to: [destinatario],
    subject: "Advertencia: reporte retirado",
    html: renderEmailLayout({
      assetBaseUrl: getAppUrl(),
      title: "Reporte retirado",
      kicker: "Normas de contenido",
      preheader: "Tu reporte fue retirado por la fotografía adjunta.",
      heading: "Reporte retirado",
      body: emailParagraph(advertencia),
    }),
    text: advertencia,
  }, { idempotencyKey: `retiro-reporte/${reporteId}` });
}

export async function sendCommentNotificationEmail({
  ownerEmail,
  ownerUsername,
  commenterUsername,
  reporteId,
  reporteTitulo,
  comentarioContenido,
}: CommentNotificationParams) {
  const resend = getResendClient();
  const reportUrl = `${getAppUrl()}/reportes/${reporteId}`;
  const owner = ownerUsername || "Usuario";
  const commenter = commenterUsername || "Un usuario";

  return resend.emails.send({
    from: SENDER,
    to: [ownerEmail],
    subject: `Nuevo comentario en tu reporte: ${reporteTitulo}`,
    html: renderEmailLayout({
      assetBaseUrl: getAppUrl(),
      title: "Nuevo comentario en tu reporte",
      kicker: "Nuevo comentario",
      preheader: `${commenter} comentó en "${reporteTitulo}".`,
      heading: `¡Hola ${owner}!`,
      body: [
        emailParagraph(`<strong style="color:${EMAIL_COLORS.foreground};">${escapeHtml(commenter)}</strong> dejó un comentario en tu reporte:`),
        emailPanel({
          eyebrow: `Reporte N.º ${reporteId}`,
          title: reporteTitulo,
          content: emailField("Comentario", escapeHtml(comentarioContenido)),
        }),
        emailButton("Ver reporte completo", reportUrl),
        emailParagraph("Respondé el comentario para mantener la conversación con la comunidad."),
      ].join("\n"),
      footnote: UNSUBSCRIBE_NOTE,
    }),
    text: plainText([
      `¡Hola ${owner}!`,
      `${commenter} dejó un comentario en tu reporte "${reporteTitulo}":`,
      comentarioContenido,
      `Ver reporte completo: ${reportUrl}`,
      UNSUBSCRIBE_NOTE,
    ]),
  });
}

export async function sendStatusNotificationEmail({
  ownerEmail,
  ownerUsername,
  reporteId,
  reporteTitulo,
  nuevoEstado,
  comentario,
}: StatusNotificationParams) {
  const resend = getResendClient();
  const reportUrl = `${getAppUrl()}/reportes/${reporteId}`;
  const owner = ownerUsername || "Usuario";
  const esReparado = nuevoEstado === "Reparado";
  const titular = esReparado ? "Tu reporte ha sido marcado como Reparado" : "Tu reporte ha sido Rechazado";
  const mensajeAdicional = esReparado
    ? "¡Gracias por tu contribución! Tu reporte ayudó a mejorar la comunidad."
    : 'Lamentamos informarte que tu reporte no cumplió con los criterios de validación o fue marcado como "No Existe" por otros usuarios.';
  const consejo = esReparado
    ? "Tu reporte contribuyó a resolver un problema en la comunidad."
    : "Revisá los criterios de validación antes de crear nuevos reportes.";

  return resend.emails.send({
    from: SENDER,
    to: [ownerEmail],
    subject: `Tu reporte "${reporteTitulo}" cambió de estado`,
    html: renderEmailLayout({
      assetBaseUrl: getAppUrl(),
      title: "Cambio de estado en tu reporte",
      kicker: "Cambio de estado",
      preheader: `${titular}: "${reporteTitulo}".`,
      heading: `¡Hola ${owner}!`,
      body: [
        emailParagraph(escapeHtml(titular)),
        emailPanel({
          eyebrow: `Reporte N.º ${reporteId}`,
          title: reporteTitulo,
          badge: { label: nuevoEstado, tone: esReparado ? "success" : "danger" },
          content: comentario ? emailField("Comentario", escapeHtml(comentario)) : "",
        }),
        emailParagraph(escapeHtml(mensajeAdicional)),
        emailButton("Ver detalles del reporte", reportUrl),
        emailParagraph(escapeHtml(consejo)),
      ].join("\n"),
      footnote: UNSUBSCRIBE_NOTE,
    }),
    text: plainText([
      `¡Hola ${owner}!`,
      `${titular}: "${reporteTitulo}".`,
      comentario && `Comentario: ${comentario}`,
      mensajeAdicional,
      `Ver detalles del reporte: ${reportUrl}`,
      UNSUBSCRIBE_NOTE,
    ]),
  });
}

/**
 * Envía el email de asignación de cuadrilla al propietario del reporte, con la misma
 * plantilla que el resto de los emails de este módulo.
 */
export async function sendCrewAssignedEmail({
  ownerEmail,
  ownerUsername,
  reporteId,
  reporteTitulo,
  cuadrillaNombre,
  detalle,
}: CrewAssignedEmailParams) {
  const resend = getResendClient();
  const reportUrl = `${getAppUrl()}/reportes/${reporteId}`;
  const owner = ownerUsername || "Usuario";
  const intro = "Una cuadrilla municipal fue asignada a tu reporte y va a empezar a trabajar en él.";

  return resend.emails.send({
    from: SENDER,
    to: [ownerEmail],
    subject: `Se asignó una cuadrilla a tu reporte "${reporteTitulo}"`,
    html: renderEmailLayout({
      assetBaseUrl: getAppUrl(),
      title: "Se asignó una cuadrilla a tu reporte",
      kicker: "Cuadrilla asignada",
      preheader: `Una cuadrilla va a trabajar en "${reporteTitulo}".`,
      heading: `¡Hola ${owner}!`,
      body: [
        emailParagraph(escapeHtml(intro)),
        emailPanel({
          eyebrow: `Reporte N.º ${reporteId}`,
          title: reporteTitulo,
          content: [
            cuadrillaNombre ? emailField("Cuadrilla", escapeHtml(cuadrillaNombre)) : "",
            detalle ? emailField("Detalle", escapeHtml(detalle)) : "",
          ].join("\n"),
        }),
        emailButton("Ver reporte completo", reportUrl),
      ].join("\n"),
      footnote: UNSUBSCRIBE_NOTE,
    }),
    text: plainText([
      `¡Hola ${owner}!`,
      intro,
      `Reporte: ${reporteTitulo}`,
      cuadrillaNombre && `Cuadrilla: ${cuadrillaNombre}`,
      detalle && `Detalle: ${detalle}`,
      `Ver reporte completo: ${reportUrl}`,
      UNSUBSCRIBE_NOTE,
    ]),
  });
}
