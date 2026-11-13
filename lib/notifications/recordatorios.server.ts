/**
 * Envío del recordatorio quincenal a quien publicó un reporte abierto o una mascota perdida.
 *
 * La selección vive en la RPC `recordatorios_pendientes` (regla de 14 días, un correo por
 * persona y corrida). Este módulo arma cada correo, lo entrega a Resend con una clave de
 * idempotencia por publicación y período, y recién después de un envío aceptado registra la
 * fecha en `recordatorios_publicacion`: un fallo deja la publicación pendiente para la corrida
 * siguiente, y un reintento del mismo día nunca duplica el correo.
 */
import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import {
  armarRecordatorioMascota,
  armarRecordatorioReporte,
  type CorreoRecordatorio,
} from "./recordatorio-templates"

/** Remitente compartido con el resto de los correos transaccionales. */
const REMITENTE = "Reporty <team@notificaciones.reporty.com.ar>"

/** Milisegundos de un día, para calcular la antigüedad y el período de idempotencia. */
const MS_POR_DIA = 86_400_000

/** Fila que devuelve la RPC `recordatorios_pendientes`. */
export type RecordatorioPendiente = {
  tipo: "reporte" | "mascota"
  entidad_id: number
  /** Título del reporte o tipo de animal de la mascota. */
  titulo: string
  estado: string
  email: string
  username: string | null
  publicada_at: string
}

/** Envío mínimo que necesita el servicio; en producción lo implementa Resend. */
export type EnviarCorreo = (
  mensaje: { from: string; to: string[]; subject: string; html: string; text: string },
  opciones: { idempotencyKey: string },
) => Promise<{ error: { message: string } | null }>

/** Resultado de una corrida, sin datos personales: solo conteos. */
export type ResumenRecordatorios = { candidatos: number; enviados: number; fallidos: number }

/**
 * Arma el correo que corresponde a una publicación pendiente.
 *
 * @param fila - Publicación devuelta por la RPC.
 * @param urlApp - Origen público de la app.
 * @param ahora - Instante de la corrida.
 * @returns Asunto, HTML y texto del recordatorio.
 */
export function armarCorreoDeFila(fila: RecordatorioPendiente, urlApp: string, ahora: Date): CorreoRecordatorio {
  const diasDesdePublicacion = Math.max(
    0,
    Math.floor((ahora.getTime() - new Date(fila.publicada_at).getTime()) / MS_POR_DIA),
  )
  const base = { urlApp, nombreUsuario: fila.username, diasDesdePublicacion }

  return fila.tipo === "reporte"
    ? armarRecordatorioReporte({ ...base, reporteId: fila.entidad_id, reporteTitulo: fila.titulo, estadoActual: fila.estado })
    : armarRecordatorioMascota({ ...base, mascotaId: fila.entidad_id, tipoAnimal: fila.titulo })
}

/**
 * Clave de idempotencia estable dentro de un mismo período de 14 días, así un reintento de la
 * corrida (o dos corridas el mismo día) no duplica el correo en Resend.
 *
 * @param fila - Publicación a recordar.
 * @param ahora - Instante de la corrida.
 * @returns Clave como `recordatorio/reporte/482/1449`.
 */
export function claveIdempotencia(fila: Pick<RecordatorioPendiente, "tipo" | "entidad_id">, ahora: Date): string {
  const periodo = Math.floor(ahora.getTime() / (14 * MS_POR_DIA))
  return `recordatorio/${fila.tipo}/${fila.entidad_id}/${periodo}`
}

/**
 * Ejecuta una corrida: busca las publicaciones vencidas, envía cada recordatorio y registra
 * los enviados. Los errores de un correo no frenan a los demás.
 *
 * @param dependencias.supabase - Cliente con service role.
 * @param dependencias.enviar - Envío de correo (Resend en producción).
 * @param dependencias.urlApp - Origen público de la app para los enlaces.
 * @param dependencias.ahora - Instante de la corrida; por defecto, ahora.
 * @param dependencias.limite - Máximo de correos por corrida.
 * @returns Conteos de la corrida.
 */
export async function enviarRecordatoriosPendientes({
  supabase,
  enviar,
  urlApp,
  ahora = new Date(),
  limite = 100,
}: {
  supabase: SupabaseClient
  enviar: EnviarCorreo
  urlApp: string
  ahora?: Date
  limite?: number
}): Promise<ResumenRecordatorios> {
  const { data, error } = await supabase.rpc("recordatorios_pendientes", { p_limite: limite })
  if (error) throw new Error(`No se pudieron leer los recordatorios pendientes: ${error.message}`)

  const filas = (data ?? []) as RecordatorioPendiente[]
  let enviados = 0
  let fallidos = 0

  for (const fila of filas) {
    const correo = armarCorreoDeFila(fila, urlApp, ahora)
    try {
      const resultado = await enviar(
        { from: REMITENTE, to: [fila.email], subject: correo.asunto, html: correo.html, text: correo.texto },
        { idempotencyKey: claveIdempotencia(fila, ahora) },
      )
      if (resultado.error) throw new Error(resultado.error.message)
    } catch (errorEnvio) {
      fallidos += 1
      // Nunca se registra el correo del destinatario: solo la publicación y el motivo.
      console.error("Recordatorio no enviado", fila.tipo, fila.entidad_id, errorEnvio instanceof Error ? errorEnvio.message : "error")
      continue
    }

    const { error: errorRegistro } = await supabase
      .from("recordatorios_publicacion")
      .upsert({ tipo: fila.tipo, entidad_id: fila.entidad_id, ultimo_envio_at: ahora.toISOString() })
    if (errorRegistro) {
      // El correo salió; si la corrida se repite dentro de las 24 h de Resend, la clave evita duplicarlo.
      console.error("Recordatorio enviado sin registrar", fila.tipo, fila.entidad_id, errorRegistro.message)
    }
    enviados += 1
  }

  return { candidatos: filas.length, enviados, fallidos }
}
