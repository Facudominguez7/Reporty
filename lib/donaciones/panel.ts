import dayjs from "dayjs"
import timezone from "dayjs/plugin/timezone"
import utc from "dayjs/plugin/utc"

import { ZONA_HORARIA_APP } from "@/lib/fechas/antiguedad"
import type { EstadoDonacion } from "@/lib/donaciones/mercado-pago.server"

dayjs.extend(utc)
dayjs.extend(timezone)

export const ESTADOS_DONACION: EstadoDonacion[] = ["aprobada", "pendiente", "rechazada"]

export const ETIQUETAS_ESTADO_DONACION: Record<EstadoDonacion, string> = {
  aprobada: "Aprobada",
  pendiente: "Pendiente",
  rechazada: "Rechazada",
}

/** Una donación como la muestra el panel admin. */
export type DonacionPanel = {
  id: string
  pagoId: string
  fecha: string
  monto: number
  estado: EstadoDonacion
  estadoMp: string
  nombre: string | null
  mensaje: string | null
  usuario: string | null
}

export type FiltrosDonaciones = { estado: EstadoDonacion | null; mes: string | null }

/**
 * Lee los filtros de la URL: estado válido y mes con formato `AAAA-MM`. Lo inválido se ignora.
 */
export function leerFiltros(params: { estado?: string; mes?: string }): FiltrosDonaciones {
  const estado = ESTADOS_DONACION.find((valor) => valor === params.estado) ?? null
  const mes = params.mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(params.mes) ? params.mes : null
  return { estado, mes }
}

/**
 * Devuelve el inicio y el fin (exclusivo) de un mes `AAAA-MM` en hora de Argentina, en ISO.
 */
export function rangoDelMes(mes: string): { desde: string; hasta: string } {
  const inicio = dayjs.tz(`${mes}-01 00:00`, ZONA_HORARIA_APP)
  return { desde: inicio.toISOString(), hasta: inicio.add(1, "month").toISOString() }
}

/**
 * Mes actual en hora de Argentina, con formato `AAAA-MM`.
 */
export function mesActual(ahora: Date = new Date()): string {
  return dayjs(ahora).tz(ZONA_HORARIA_APP).format("YYYY-MM")
}

/**
 * Suma las donaciones aprobadas: total histórico y total del mes indicado (por fecha de aprobación).
 */
export function calcularTotales(aprobadas: Array<{ monto: number; fecha: string }>, mes: string) {
  const { desde, hasta } = rangoDelMes(mes)
  let total = 0
  let delMes = 0
  for (const { monto, fecha } of aprobadas) {
    total += monto
    if (fecha >= desde && fecha < hasta) delMes += monto
  }
  return { total, delMes, cantidad: aprobadas.length }
}

/**
 * Formatea una fecha ISO en hora de Argentina para el panel y el CSV, por ejemplo `10/11/2026 15:04`.
 */
export function formatearFecha(fecha: string): string {
  return dayjs(fecha).tz(ZONA_HORARIA_APP).format("DD/MM/YYYY HH:mm")
}

/**
 * Escapa un valor para CSV: comillas dobles y prefijo `'` ante fórmulas (=, +, -, @),
 * para que una planilla no ejecute lo que escribió un donante.
 */
function celdaCsv(valor: string | number | null): string {
  if (valor === null) return ""
  let texto = String(valor)
  if (typeof valor === "string" && /^[=+\-@\t\r]/.test(texto)) texto = `'${texto}`
  return /[",\n\r;]/.test(texto) ? `"${texto.replaceAll('"', '""')}"` : texto
}

/**
 * Arma el CSV de donaciones con encabezado. Empieza con BOM para que Excel lea bien los acentos.
 */
export function donacionesACsv(donaciones: DonacionPanel[]): string {
  const encabezado = ["Fecha", "Monto", "Estado", "Estado Mercado Pago", "Nombre", "Mensaje", "Usuario", "Pago"]
  const filas = donaciones.map((donacion) => [
    formatearFecha(donacion.fecha),
    donacion.monto,
    ETIQUETAS_ESTADO_DONACION[donacion.estado],
    donacion.estadoMp,
    donacion.nombre,
    donacion.mensaje,
    donacion.usuario,
    donacion.pagoId,
  ])
  return `﻿${[encabezado, ...filas].map((fila) => fila.map(celdaCsv).join(",")).join("\r\n")}\r\n`
}
