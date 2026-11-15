import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { ROLE_IDS } from "@/lib/authz/catalog"
import { enviarPush, leerClavesVapid } from "@/lib/push/enviar.server"

/**
 * Notificaciones push de Reporty, una función por aviso.
 *
 * Cada una replica un correo existente (`lib/notifications/*`) y se llama en el mismo lugar.
 * Ninguna lanza: `enviarPush` absorbe sus errores, así que se pueden llamar fuera del `try`
 * del correo y una push nunca depende de que el correo salga bien (ni al revés).
 */

/** Largo máximo del extracto de un comentario en la notificación. */
const LARGO_EXTRACTO_COMENTARIO = 140

/**
 * Recorta un texto para que entre en una notificación.
 *
 * @param texto - Texto completo.
 * @param largo - Cantidad máxima de caracteres, incluido «…».
 * @returns El texto, o su comienzo terminado en «…».
 */
function recortar(texto: string, largo: number): string {
  const limpio = texto.replace(/\s+/g, " ").trim()
  return limpio.length > largo ? `${limpio.slice(0, largo - 1)}…` : limpio
}

/**
 * Avisa al dueño que su reporte pasó a Reparado o Rechazado.
 *
 * @param admin - Cliente de servicio.
 * @param datos - Dueño, reporte y nuevo estado.
 */
export async function pushCambioEstadoReporte(
  admin: SupabaseClient,
  { usuarioId, reporteId, titulo, nuevoEstado }: { usuarioId: string; reporteId: number; titulo: string; nuevoEstado: "Reparado" | "Rechazado" },
): Promise<void> {
  await enviarPush({
    admin,
    usuarioIds: [usuarioId],
    tipo: "estado_reporte",
    mensaje: {
      titulo: nuevoEstado === "Reparado" ? "Tu reporte fue marcado como Reparado" : "Tu reporte fue rechazado",
      cuerpo: titulo,
      url: `/reportes/${reporteId}`,
      etiqueta: `reporte-${reporteId}-estado`,
    },
  })
}

/**
 * Avisa al dueño que se asignó una cuadrilla a su reporte.
 *
 * @param admin - Cliente de servicio.
 * @param datos - Dueño, reporte y nombre de la cuadrilla (si se conoce).
 */
export async function pushCuadrillaAsignada(
  admin: SupabaseClient,
  { usuarioId, reporteId, titulo, cuadrillaNombre }: { usuarioId: string; reporteId: number; titulo: string; cuadrillaNombre: string | null },
): Promise<void> {
  await enviarPush({
    admin,
    usuarioIds: [usuarioId],
    tipo: "estado_reporte",
    mensaje: {
      titulo: "Asignaron una cuadrilla a tu reporte",
      cuerpo: `${cuadrillaNombre?.trim() || "Una cuadrilla"} va a trabajar en «${titulo}».`,
      url: `/reportes/${reporteId}`,
      etiqueta: `reporte-${reporteId}-estado`,
    },
  })
}

/**
 * Avisa al dueño que alguien comentó su reporte.
 *
 * @param admin - Cliente de servicio.
 * @param datos - Dueño, reporte, nombre visible de quien comentó y el comentario.
 */
export async function pushComentarioReporte(
  admin: SupabaseClient,
  { usuarioId, reporteId, autor, contenido }: { usuarioId: string; reporteId: number; autor: string | null; contenido: string },
): Promise<void> {
  await enviarPush({
    admin,
    usuarioIds: [usuarioId],
    tipo: "comentarios",
    mensaje: {
      titulo: "Nuevo comentario en tu reporte",
      cuerpo: `${autor?.trim() || "Alguien"}: ${recortar(contenido, LARGO_EXTRACTO_COMENTARIO)}`,
      url: `/reportes/${reporteId}`,
      etiqueta: `reporte-${reporteId}-comentarios`,
    },
  })
}

/**
 * Avisa a quien publicó una mascota que ahora figura como encontrada.
 *
 * @param admin - Cliente de servicio.
 * @param datos - Quien publicó la mascota y su id.
 */
export async function pushMascotaEncontrada(
  admin: SupabaseClient,
  { usuarioId, mascotaId }: { usuarioId: string; mascotaId: number },
): Promise<void> {
  await enviarPush({
    admin,
    usuarioIds: [usuarioId],
    tipo: "mascotas",
    mensaje: {
      titulo: "La mascota que publicaste figura como encontrada",
      cuerpo: "Entrá para ver la publicación.",
      url: `/mascotas/${mascotaId}`,
      etiqueta: `mascota-${mascotaId}`,
    },
  })
}

/**
 * Avisa a todos los administradores que hay contenido para moderar: una foto en revisión o un
 * reporte que llegó al umbral de votos «No existe».
 *
 * @param admin - Cliente de servicio.
 * @param datos - Tipo de revisión, reporte y su título (opcional: sin título solo se muestra el número).
 */
export async function pushModeracionPendiente(
  admin: SupabaseClient,
  { tipo, reporteId, titulo }: { tipo: "foto" | "reporte"; reporteId: number; titulo?: string },
): Promise<void> {
  // Sin claves VAPID no hay push: ni siquiera se consulta la base.
  if (!leerClavesVapid()) return
  try {
    const { data, error } = await admin.from("profiles").select("id").eq("rol_id", ROLE_IDS.ADMIN)
    if (error) {
      console.error("No pudimos leer los administradores para la push de moderación:", error)
      return
    }
    const ids = ((data ?? []) as Array<{ id: string }>).map((fila) => fila.id)
    await enviarPush({
      admin,
      usuarioIds: ids,
      tipo: "moderacion",
      mensaje: {
        titulo: tipo === "foto" ? "Fotografía pendiente de revisión" : "Reporte pendiente de revisión",
        cuerpo: titulo?.trim() ? `Reporte N.º ${reporteId}: ${recortar(titulo, 100)}` : `Reporte N.º ${reporteId}`,
        url: tipo === "reporte" ? "/admin/moderacion?tipo=reportes" : "/admin/moderacion",
        etiqueta: `moderacion-${tipo}-${reporteId}`,
      },
    })
  } catch (error) {
    console.error("No pudimos enviar la push de moderación:", error)
  }
}
