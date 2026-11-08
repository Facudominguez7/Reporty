import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { createAdminClient } from "@/utils/supabase/admin"

import { crearClienteR2 } from "./cliente-r2"
import { leerConfiguracionArchivo } from "./configuracion"
import type { EventoAuditoria } from "./serializacion"
import type {
  AccionArchivoAuditoria,
  DatosArchivado,
  DependenciasArchivado,
  LoteArchivado,
  MetricasArchivo,
  PrevisualizacionLote,
} from "./servicio-archivado"

/**
 * Acceso real a la base de control del archivo y a Cloudflare R2.
 *
 * Todo pasa por el cliente de servicio después de una validación de rol hecha
 * por el llamador (panel administrativo) o por el secreto del cron. Las tablas
 * `audit_archives` y `audit_archive_claims` no tienen escritura directa: las
 * mutaciones van por RPC `security definer` reservadas a `service_role`.
 */

type Fila = Record<string, unknown>

function texto(valor: unknown): string | null {
  return typeof valor === "string" ? valor : null
}

function numero(valor: unknown): number {
  if (typeof valor === "number") return valor
  if (typeof valor === "string" && valor.trim() !== "") return Number(valor)
  return 0
}

/** Traduce la fila de `public.audit_archives` al tipo del servicio. */
function mapearLote(fila: Fila): LoteArchivado {
  return {
    id: String(fila.id),
    estado: String(fila.estado ?? "reclamado"),
    primerEventoId: numero(fila.primer_evento_id),
    ultimoEventoId: numero(fila.ultimo_evento_id),
    cantidadRegistros: numero(fila.cantidad_registros),
    primeraFecha: String(fila.primera_fecha ?? ""),
    ultimaFecha: String(fila.ultima_fecha ?? ""),
    rutaObjeto: texto(fila.ruta_objeto),
    tamanoComprimido: fila.tamano_comprimido == null ? null : numero(fila.tamano_comprimido),
    hashSha256: texto(fila.hash_sha256),
    verificadoEn: texto(fila.verificado_en),
  }
}

function primerFila(datos: unknown): Fila | null {
  if (Array.isArray(datos)) return (datos[0] as Fila | undefined) ?? null
  return datos && typeof datos === "object" ? (datos as Fila) : null
}

function fallar(operacion: string, error: unknown): never {
  const detalle = error && typeof error === "object" && "message" in error
    ? String((error as { message: unknown }).message)
    : "error desconocido"
  throw new Error(`No se pudo ${operacion}: ${detalle}`)
}

/**
 * Construye el acceso a datos del archivo.
 *
 * @param supabase cliente de servicio; por defecto `createAdminClient()`.
 */
export function crearDatosArchivado(supabase?: SupabaseClient): DatosArchivado {
  const cliente = () => supabase ?? createAdminClient()

  return {
    async previsualizar(limite, diasRetencion) {
      const { data, error } = await cliente().rpc("auditoria_previsualizar_lote", {
        p_limite: limite,
        p_dias_retencion: diasRetencion,
      })
      if (error) fallar("previsualizar el lote de auditoría", error)

      const fila = (Array.isArray(data) ? data[0] : data) as Fila | null
      if (!fila || fila.cantidad == null) return null

      const previsualizacion: PrevisualizacionLote = {
        cantidad: numero(fila.cantidad),
        primerEventoId: numero(fila.primer_evento_id),
        ultimoEventoId: numero(fila.ultimo_evento_id),
        primeraFecha: String(fila.primera_fecha ?? ""),
        ultimaFecha: String(fila.ultima_fecha ?? ""),
      }
      return previsualizacion.cantidad > 0 ? previsualizacion : null
    },

    async reclamar(limite, diasRetencion, ejecutor) {
      const { data, error } = await cliente().rpc("auditoria_reclamar_lote", {
        p_limite: limite,
        p_dias_retencion: diasRetencion,
        p_ejecutor: ejecutor,
      })
      if (error) fallar("reclamar el lote de auditoría", error)

      const fila = primerFila(data)
      return fila?.id ? mapearLote(fila) : null
    },

    async eventosDelLote(lote) {
      const { data: reclamos, error: errorReclamos } = await cliente()
        .from("audit_archive_claims")
        .select("event_id")
        .eq("archive_id", lote.id)
        .order("event_id", { ascending: true })
      if (errorReclamos) fallar("leer los reclamos del lote", errorReclamos)

      const ids = (reclamos ?? []).map((fila) => numero((fila as Fila).event_id)).filter((id) => id > 0)
      if (ids.length === 0) return []

      const { data, error } = await cliente()
        .from("audit_events")
        .select("id, occurred_at, actor_id, report_id, report_title, action")
        .in("id", ids)
        .order("occurred_at", { ascending: true })
        .order("id", { ascending: true })
      if (error) fallar("leer los eventos del lote", error)

      return (data ?? []).map((fila) => {
        const evento = fila as Fila
        return {
          id: numero(evento.id),
          occurred_at: String(evento.occurred_at ?? ""),
          actor_id: texto(evento.actor_id),
          report_id: evento.report_id == null ? null : numero(evento.report_id),
          report_title: texto(evento.report_title),
          action: String(evento.action ?? ""),
        } satisfies EventoAuditoria
      })
    },

    async confirmarSubida(lote, subida) {
      const { data, error } = await cliente().rpc("auditoria_confirmar_subida", {
        p_archive_id: lote.id,
        p_ruta: subida.ruta,
        p_tamano: subida.tamano,
        p_hash: subida.hash,
        p_ejecutor: lote.estado,
      })
      if (error) fallar("confirmar la subida del lote", error)
      return data === true
    },

    async verificarLote(id) {
      const { data, error } = await cliente().rpc("auditoria_verificar_lote", { p_archive_id: id })
      if (error) fallar("verificar el lote", error)
      return data === true
    },

    async eliminarOrigen(id, hash) {
      const { data, error } = await cliente().rpc("auditoria_eliminar_origen", {
        p_archive_id: id,
        p_hash: hash,
      })
      if (error) fallar("eliminar el origen del lote", error)
      return numero(data)
    },

    async fallarLote(id, mensaje) {
      const { data, error } = await cliente().rpc("auditoria_fallar_lote", {
        p_archive_id: id,
        p_error: mensaje,
      })
      if (error) fallar("liberar el lote fallido", error)
      return data === true
    },

    async lotesPendientesDePurga(limite) {
      const { data, error } = await cliente()
        .from("audit_archives")
        .select("id, estado, primer_evento_id, ultimo_evento_id, cantidad_registros, primera_fecha, ultima_fecha, ruta_objeto, tamano_comprimido, hash_sha256, verificado_en")
        .eq("estado", "verificado")
        .order("primera_fecha", { ascending: true })
        .limit(limite)
      if (error) fallar("listar los lotes pendientes de purga", error)
      return (data ?? []).map((fila) => mapearLote(fila as Fila))
    },

    async registrarEvento(accion: AccionArchivoAuditoria, detalle, actorId) {
      const { error } = await cliente().rpc("auditoria_registrar_evento", {
        p_accion: accion,
        p_detalle: detalle,
        p_actor: actorId,
      })
      if (error) fallar("registrar la auditoría del archivo", error)
    },
  }
}

/**
 * Dependencias reales de una corrida: configuración del entorno, cliente R2 y
 * acceso a datos con el cliente de servicio.
 *
 * @throws {ErrorConfiguracionArchivo} si falta o es inválida alguna variable.
 */
export function crearDependenciasArchivado(): DependenciasArchivado {
  const configuracion = leerConfiguracionArchivo()
  return {
    configuracion,
    cliente: crearClienteR2(configuracion),
    datos: crearDatosArchivado(),
  }
}

/**
 * Lee las métricas del archivo para el panel administrativo.
 *
 * @param diasRetencion días de retención caliente configurados.
 */
export async function leerMetricasArchivo(
  diasRetencion: number,
  supabase?: SupabaseClient,
): Promise<MetricasArchivo> {
  const cliente = supabase ?? createAdminClient()
  const { data, error } = await cliente.rpc("auditoria_metricas", { p_dias_retencion: diasRetencion })
  if (error) fallar("leer las métricas del archivo", error)

  const fila = (Array.isArray(data) ? data[0] : data) as Fila | null
  return {
    lotes: numero(fila?.lotes),
    lotesFallidos: numero(fila?.lotes_fallidos),
    lotesPendientesPurga: numero(fila?.lotes_pendientes_purga),
    eventosArchivados: numero(fila?.eventos_archivados),
    eventosPurgados: numero(fila?.eventos_purgados),
    bytesEnR2: numero(fila?.bytes_en_r2),
    elegibles: numero(fila?.elegibles),
    eventosEnPostgres: numero(fila?.eventos_en_postgres),
    espacioTablaBytes: numero(fila?.espacio_tabla_bytes),
  }
}
