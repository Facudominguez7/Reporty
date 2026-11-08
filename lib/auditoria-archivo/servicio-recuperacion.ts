import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { createAdminClient } from "@/utils/supabase/admin"

import { verificarEsAdmin } from "@/database/queries/admin/verificar-admin"

import { descargarArchivo, type ClienteR2 } from "./cliente-r2"
import { leerConfiguracionArchivo, type ConfiguracionArchivoAuditoria } from "./configuracion"
import { crearClienteR2 } from "./cliente-r2"
import { nombreDescarga, validarRutaArchivo } from "./rutas-objeto"
import {
  ErrorFormatoArchivado,
  descomprimirGzip,
  leerEventosJsonl,
  verificarHash,
  type EventoArchivado,
} from "./serializacion"

/**
 * Consulta y recuperación del historial de auditoría archivado en R2.
 *
 * Reglas:
 * - toda función valida primero la sesión y el rol Admin en el servidor;
 * - las lecturas de `public.audit_archives` usan el cliente de servicio;
 * - el identificador se valida como UUID antes de consultar (anti-IDOR) y la ruta
 *   del objeto se valida contra el contrato antes de hablar con R2;
 * - recuperar un lote **no** restaura filas en `audit_events`: el histórico se
 *   devuelve tal como está archivado;
 * - los errores no incluyen contenido de los eventos, credenciales ni rutas ajenas.
 */

/**
 * Estados que ve el panel.
 *
 * `fallido` se incluye a propósito: el Admin necesita ver que un lote no se pudo
 * archivar. La descarga y la recuperación siguen limitadas a lotes con archivo.
 */
const ESTADOS_ARCHIVABLES = ["subido", "verificado", "origen_eliminado", "fallido"] as const
/** Tope de lotes que devuelve el listado del panel. */
const LIMITE_LOTES = 50
const PATRON_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PATRON_FECHA = /^\d{4}-\d{2}-\d{2}$/

/** Columnas de `public.audit_archives` que lee el panel. */
const COLUMNAS = "id, estado, cantidad_registros, primera_fecha, ultima_fecha, ruta_objeto, tamano_comprimido, hash_sha256, verificado_en, origen_eliminado_en, creado_en"

/** Estado del proceso de archivo. */
export type EstadoArchivo = "reclamado" | "subido" | "verificado" | "origen_eliminado" | "fallido"

/** Lote archivado tal como lo consume el panel. */
export type ArchivoArchivado = {
  id: string
  estado: EstadoArchivo
  cantidadRegistros: number
  primeraFecha: string
  ultimaFecha: string
  rutaObjeto: string | null
  tamanoComprimido: number | null
  hashSha256: string | null
  verificadoEn: string | null
  origenEliminadoEn: string | null
  creadoEn: string
}

/** Rango de fechas pedido desde el panel, en formato `YYYY-MM-DD`. */
export type FiltrosArchivo = { desde?: string; hasta?: string }

/** Lote recuperado con sus eventos históricos. */
export type LoteRecuperado = { archivo: ArchivoArchivado; eventos: EventoArchivado[] }

/** Configuración y cliente R2 inyectables para pruebas y reutilización. */
export type DependenciasRecuperacion = {
  configuracion?: ConfiguracionArchivoAuditoria
  cliente?: ClienteR2
}

/** El lote no se puede leer desde R2: objeto ausente, hash distinto o archivo ilegible. */
export class ErrorLoteNoDisponible extends Error {
  constructor(detalle: string) {
    super(`El lote archivado no está disponible: ${detalle}.`)
    this.name = "ErrorLoteNoDisponible"
  }
}

type Fila = Record<string, unknown>

function texto(valor: unknown): string | null {
  return typeof valor === "string" ? valor : null
}

function numero(valor: unknown): number {
  if (typeof valor === "number") return valor
  if (typeof valor === "string" && valor.trim() !== "") return Number(valor)
  return 0
}

/** Traduce la fila de la tabla de control al tipo del panel. */
function mapearArchivo(fila: Fila): ArchivoArchivado {
  return {
    id: String(fila.id),
    estado: String(fila.estado ?? "subido") as EstadoArchivo,
    cantidadRegistros: numero(fila.cantidad_registros),
    primeraFecha: String(fila.primera_fecha ?? ""),
    ultimaFecha: String(fila.ultima_fecha ?? ""),
    rutaObjeto: texto(fila.ruta_objeto),
    tamanoComprimido: fila.tamano_comprimido == null ? null : numero(fila.tamano_comprimido),
    hashSha256: texto(fila.hash_sha256),
    verificadoEn: texto(fila.verificado_en),
    origenEliminadoEn: texto(fila.origen_eliminado_en),
    creadoEn: String(fila.creado_en ?? ""),
  }
}

/** Normaliza una fecha `YYYY-MM-DD` a un instante ISO, o `null` si no es válida. */
function limiteFecha(valor: string | undefined, sufijo: "00:00:00.000Z" | "23:59:59.999Z"): string | null {
  const recortado = valor?.trim()
  if (!recortado || !PATRON_FECHA.test(recortado)) return null
  const fecha = new Date(`${recortado}T${sufijo}`)
  return Number.isNaN(fecha.getTime()) ? null : fecha.toISOString()
}

/** Resuelve configuración y cliente R2: inyectados o desde el entorno del servidor. */
function resolverDependencias(dependencias: DependenciasRecuperacion = {}): {
  configuracion: ConfiguracionArchivoAuditoria
  cliente: ClienteR2
} {
  const configuracion = dependencias.configuracion ?? leerConfiguracionArchivo()
  return { configuracion, cliente: dependencias.cliente ?? crearClienteR2(configuracion) }
}

/** Autoriza y devuelve la fila del lote pedido, o `null` si no existe. */
async function cargarArchivo(
  supabase: SupabaseClient,
  usuarioId: string,
  id: string,
): Promise<{ unauthorized: boolean; archivo: ArchivoArchivado | null; error: unknown }> {
  const { isAdmin, error: errorRol } = await verificarEsAdmin(supabase, usuarioId)
  if (errorRol || !isAdmin) return { unauthorized: true, archivo: null, error: errorRol ?? null }

  if (!PATRON_UUID.test(id)) return { unauthorized: false, archivo: null, error: null }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from("audit_archives")
    .select(COLUMNAS)
    .eq("id", id)
    .maybeSingle()

  if (error) return { unauthorized: false, archivo: null, error }
  return { unauthorized: false, archivo: data ? mapearArchivo(data as Fila) : null, error: null }
}

/**
 * Lista los lotes archivados con filtro opcional por rango de fechas.
 *
 * @param supabase cliente de sesión, usado solo para validar el rol.
 * @param usuarioId identificador del usuario autenticado.
 * @param filtros rango `desde`/`hasta` en `YYYY-MM-DD`; lo inválido se ignora.
 */
export async function listarArchivosArchivados(
  supabase: SupabaseClient,
  usuarioId: string,
  filtros: FiltrosArchivo = {},
): Promise<{ unauthorized: boolean; archivos: ArchivoArchivado[]; error: unknown }> {
  const { isAdmin, error: errorRol } = await verificarEsAdmin(supabase, usuarioId)
  if (errorRol || !isAdmin) return { unauthorized: true, archivos: [], error: errorRol ?? null }

  const admin = createAdminClient()
  let consulta = admin
    .from("audit_archives")
    .select(COLUMNAS)
    .in("estado", [...ESTADOS_ARCHIVABLES])

  const desde = limiteFecha(filtros.desde, "00:00:00.000Z")
  if (desde) consulta = consulta.gte("ultima_fecha", desde)
  const hasta = limiteFecha(filtros.hasta, "23:59:59.999Z")
  if (hasta) consulta = consulta.lte("primera_fecha", hasta)

  const { data, error } = await consulta
    .order("primera_fecha", { ascending: false })
    .limit(LIMITE_LOTES)

  if (error) return { unauthorized: false, archivos: [], error }
  return { unauthorized: false, archivos: (data ?? []).map((fila) => mapearArchivo(fila as Fila)), error: null }
}

/**
 * Descarga y valida el objeto de un lote.
 *
 * Compara el SHA-256 del archivo comprimido con el registrado en la base: si no
 * coincide, el lote no se entrega.
 */
async function leerObjeto(
  archivo: ArchivoArchivado,
  dependencias: DependenciasRecuperacion,
): Promise<Buffer> {
  if (!archivo.rutaObjeto) throw new ErrorLoteNoDisponible("el lote no tiene ruta de objeto registrada")
  if (!archivo.hashSha256) throw new ErrorLoteNoDisponible("el lote no tiene hash registrado")

  const ruta = validarRutaArchivo(archivo.rutaObjeto)
  const { configuracion, cliente } = resolverDependencias(dependencias)
  const contenido = await descargarArchivo(cliente, configuracion, ruta)

  if (!verificarHash(contenido, archivo.hashSha256)) {
    throw new ErrorLoteNoDisponible("el archivo descargado no coincide con el hash registrado")
  }
  return contenido
}

/**
 * Recupera los eventos de un lote sin restaurarlos a `audit_events`.
 *
 * @param supabase cliente de sesión.
 * @param usuarioId usuario autenticado; debe ser Admin.
 * @param id identificador del lote (UUID).
 * @param dependencias configuración y cliente R2 inyectables.
 */
export async function recuperarEventosArchivados(
  supabase: SupabaseClient,
  usuarioId: string,
  id: string,
  dependencias: DependenciasRecuperacion = {},
): Promise<{ unauthorized: boolean; recuperado: LoteRecuperado | null; error: unknown }> {
  const { unauthorized, archivo, error } = await cargarArchivo(supabase, usuarioId, id)
  if (unauthorized) return { unauthorized, recuperado: null, error }
  if (error) return { unauthorized: false, recuperado: null, error }
  if (!archivo?.rutaObjeto) return { unauthorized: false, recuperado: null, error: null }

  try {
    const contenido = await leerObjeto(archivo, dependencias)
    const texto = (await descomprimirGzip(contenido)).toString("utf8")
    const eventos = leerEventosJsonl(texto)
    return { unauthorized: false, recuperado: { archivo, eventos }, error: null }
  } catch (fallo) {
    const errorLote = fallo instanceof ErrorFormatoArchivado || !(fallo instanceof ErrorLoteNoDisponible)
      ? new ErrorLoteNoDisponible("el archivo no se pudo leer o está corrupto")
      : fallo
    return { unauthorized: false, recuperado: null, error: errorLote }
  }
}

/**
 * Prepara la descarga administrativa del archivo comprimido.
 *
 * Registra la operación en la auditoría (`audit_archive_downloaded`); si ese
 * registro falla, la descarga igual se entrega pero el error se informa.
 */
export async function prepararDescargaArchivada(
  supabase: SupabaseClient,
  usuarioId: string,
  id: string,
  dependencias: DependenciasRecuperacion = {},
): Promise<{
  unauthorized: boolean
  descarga: { nombre: string; contenido: Buffer; tamano: number } | null
  error: unknown
}> {
  const { unauthorized, archivo, error } = await cargarArchivo(supabase, usuarioId, id)
  if (unauthorized) return { unauthorized, descarga: null, error }
  if (error) return { unauthorized: false, descarga: null, error }
  if (!archivo?.rutaObjeto) return { unauthorized: false, descarga: null, error: null }

  let contenido: Buffer
  try {
    contenido = await leerObjeto(archivo, dependencias)
  } catch (fallo) {
    return { unauthorized: false, descarga: null, error: fallo }
  }

  let errorAuditoria: unknown = null
  try {
    // La RPC de auditoría está reservada a `service_role`: se registra con el
    // cliente administrativo, después de la validación de rol de `cargarArchivo`.
    const admin = createAdminClient()
    const { error: errorRpc } = await admin.rpc("auditoria_registrar_evento", {
      p_accion: "audit_archive_downloaded",
      p_detalle: `lote ${archivo.id}`,
      p_actor: usuarioId,
    })
    if (errorRpc) errorAuditoria = errorRpc
  } catch (fallo) {
    errorAuditoria = fallo
  }

  return {
    unauthorized: false,
    descarga: {
      nombre: nombreDescarga(archivo.rutaObjeto),
      contenido,
      tamano: contenido.length,
    },
    error: errorAuditoria,
  }
}
