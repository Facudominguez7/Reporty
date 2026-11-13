/**
 * Plantillas del recordatorio quincenal al dueño de un reporte abierto o de una mascota
 * perdida. Son funciones puras: arman asunto, HTML y texto plano sin enviar nada, así el
 * envío, las pruebas y la vista previa usan exactamente el mismo contenido.
 */

import {
  EMAIL_COLORS,
  emailButton,
  emailField,
  emailLinkFallback,
  emailPanel,
  emailParagraph,
  escapeHtml,
  renderEmailLayout,
} from "./email-layout"

/** Correo listo para entregar a Resend. */
export type CorreoRecordatorio = { asunto: string; html: string; texto: string }

/** Datos comunes a los dos recordatorios. */
type DatosBaseRecordatorio = {
  /** Origen público de la app; también sirve las imágenes del encabezado. */
  urlApp: string
  /** Nombre visible del dueño, o `null` cuando no tiene. */
  nombreUsuario: string | null
  /** Días completos desde que se publicó. */
  diasDesdePublicacion: number
}

/** Datos del recordatorio de un reporte que sigue abierto. */
export type DatosRecordatorioReporte = DatosBaseRecordatorio & {
  reporteId: number
  reporteTitulo: string
  /** Nombre del estado actual tal como lo muestra la app, por ejemplo «Pendiente». */
  estadoActual: string
}

/** Datos del recordatorio de una mascota que sigue figurando como perdida. */
export type DatosRecordatorioMascota = DatosBaseRecordatorio & {
  mascotaId: number
  /** Tipo de animal de la publicación: `perro`, `gato` u `otro`. */
  tipoAnimal: string
}

/** Cómo se nombra a la mascota en el correo según su tipo. */
const NOMBRE_POR_TIPO: Record<string, { posesivo: string; titulo: string }> = {
  perro: { posesivo: "tu perro", titulo: "Perro perdido" },
  gato: { posesivo: "tu gato", titulo: "Gato perdido" },
}

/**
 * Devuelve cómo nombrar a la mascota; los tipos desconocidos caen en «tu mascota».
 *
 * @param tipoAnimal - Tipo guardado en la publicación.
 * @returns Forma posesiva para el texto y título para la tarjeta.
 */
export function nombrarMascota(tipoAnimal: string): { posesivo: string; titulo: string } {
  return NOMBRE_POR_TIPO[tipoAnimal] ?? { posesivo: "tu mascota", titulo: "Mascota perdida" }
}

/** Nota al pie compartida: explica por qué llega el correo y cuándo deja de llegar. */
const NOTA_RECORDATORIO =
  "Te enviamos este recordatorio cada dos semanas mientras la publicación siga abierta. Deja de llegar cuando se resuelve."

/**
 * Texto legible para el tiempo transcurrido, en semanas cuando ya pasaron al menos 14 días.
 *
 * @param dias - Días completos desde la publicación.
 * @returns Frase como «hace 2 semanas» o «hace 10 días».
 */
export function describirAntiguedad(dias: number): string {
  if (dias >= 14) {
    const semanas = Math.floor(dias / 7)
    return `hace ${semanas} semanas`
  }
  return dias === 1 ? "hace 1 día" : `hace ${dias} días`
}

/**
 * Arma el recordatorio para el dueño de un reporte que sigue abierto.
 *
 * @param datos - Reporte, dueño y antigüedad.
 * @returns Asunto, HTML y texto plano del correo.
 */
export function armarRecordatorioReporte(datos: DatosRecordatorioReporte): CorreoRecordatorio {
  const url = `${datos.urlApp}/reportes/${datos.reporteId}`
  const nombre = datos.nombreUsuario || "vecino/a"
  const antiguedad = describirAntiguedad(datos.diasDesdePublicacion)
  const asunto = `¿Cómo sigue tu reporte "${datos.reporteTitulo}"?`

  const html = renderEmailLayout({
    assetBaseUrl: datos.urlApp,
    title: "Recordatorio de tu reporte",
    kicker: "Recordatorio quincenal",
    preheader: `Publicaste "${datos.reporteTitulo}" ${antiguedad}. Contanos si sigue igual o ya se resolvió.`,
    heading: `¡Hola ${nombre}!`,
    body: [
      emailParagraph(
        `Publicaste este reporte <strong style="color:${EMAIL_COLORS.foreground};">${escapeHtml(antiguedad)}</strong> y todavía figura abierto. ¿Pasaste por el lugar últimamente?`,
      ),
      emailPanel({
        eyebrow: `Reporte N.º ${datos.reporteId}`,
        badge: { label: datos.estadoActual, tone: "info" },
        title: datos.reporteTitulo,
        content: emailField(
          "Qué podés hacer",
          "Si sigue igual, sumá una actualización. Si ya lo arreglaron, informá la reparación con una foto.",
        ),
      }),
      emailButton("Revisar mi reporte", url),
      emailLinkFallback(url),
      emailParagraph("Tu seguimiento ayuda a que el municipio y la comunidad sepan qué sigue pendiente."),
    ].join("\n"),
    footnote: escapeHtml(NOTA_RECORDATORIO),
  })

  const texto = [
    `¡Hola ${nombre}!`,
    `Publicaste el reporte "${datos.reporteTitulo}" (N.º ${datos.reporteId}) ${antiguedad} y todavía figura como ${datos.estadoActual}.`,
    "Si sigue igual, sumá una actualización. Si ya lo arreglaron, informá la reparación con una foto.",
    `Revisar mi reporte: ${url}`,
    NOTA_RECORDATORIO,
  ].join("\n\n")

  return { asunto, html, texto }
}

/**
 * Arma el recordatorio para quien publicó una mascota que sigue figurando como perdida.
 *
 * @param datos - Mascota, dueño y antigüedad.
 * @returns Asunto, HTML y texto plano del correo.
 */
export function armarRecordatorioMascota(datos: DatosRecordatorioMascota): CorreoRecordatorio {
  const url = `${datos.urlApp}/mascotas/${datos.mascotaId}`
  const nombre = datos.nombreUsuario || "vecino/a"
  const antiguedad = describirAntiguedad(datos.diasDesdePublicacion)
  const { posesivo: mascota, titulo: tituloPanel } = nombrarMascota(datos.tipoAnimal)
  const asunto = `¿Hay novedades de ${mascota}?`

  const html = renderEmailLayout({
    assetBaseUrl: datos.urlApp,
    title: "Recordatorio de tu mascota perdida",
    kicker: "Recordatorio quincenal",
    preheader: `Publicaste a ${mascota} como perdido/a ${antiguedad}. Si ya apareció, marcá la publicación como encontrada.`,
    heading: `¡Hola ${nombre}!`,
    body: [
      emailParagraph(
        `Publicaste a <strong style="color:${EMAIL_COLORS.foreground};">${escapeHtml(mascota)}</strong> como perdido/a ${escapeHtml(antiguedad)}. Esperamos que haya buenas noticias.`,
      ),
      emailPanel({
        eyebrow: `Mascota N.º ${datos.mascotaId}`,
        badge: { label: "Perdida", tone: "danger" },
        title: tituloPanel,
        content: emailField(
          "Qué podés hacer",
          "Si ya apareció, marcá la publicación como encontrada así la comunidad deja de buscar. Si todavía no, revisá que tu teléfono de contacto esté al día.",
        ),
      }),
      emailButton("Revisar la publicación", url),
      emailLinkFallback(url),
    ].join("\n"),
    footnote: escapeHtml(NOTA_RECORDATORIO),
  })

  const texto = [
    `¡Hola ${nombre}!`,
    `Publicaste a ${mascota} (mascota N.º ${datos.mascotaId}) como perdido/a ${antiguedad}.`,
    "Si ya apareció, marcá la publicación como encontrada así la comunidad deja de buscar. Si todavía no, revisá que tu teléfono de contacto esté al día.",
    `Revisar la publicación: ${url}`,
    NOTA_RECORDATORIO,
  ].join("\n\n")

  return { asunto, html, texto }
}
