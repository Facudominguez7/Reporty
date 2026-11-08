/**
 * Lectura server-only de la cola administrativa de reparaciones (S8, S15).
 *
 * Tres vistas separadas para no mezclar tipos de decisión: impugnaciones
 * pendientes, evidencias en verificación y reparaciones validadas que todavía se
 * pueden revertir. Devuelve datos agregados y las URLs públicas de las fotos
 * necesarias para juzgar la evidencia: nunca identidades de quienes confirmaron o
 * impugnaron, ni correos, ni rutas internas.
 */
import "server-only"

import { REPORT_STATE_IDS } from "@/lib/authz/catalog"
import {
  isMissingReportImageColumnsError,
  resolveReportImageRows,
  resolveReportImageThumbnailUrl,
  resolveReportImageUrl,
  type ReportImageRow,
} from "@/lib/media/report-images"
import { autorizarAdministracion } from "./administracion.server"

const TAMANO_PAGINA = 20
/** Tope de filas de verificación que se agregan por página; el umbral es tres (S5). */
const LIMITE_CONTADORES = 1000
/** Columnas canónicas de una foto: bucket y path conviven con la URL legacy. */
const COLUMNAS_FOTO_CANONICA = "url,bucket,path,thumbnail_url,thumbnail_bucket,thumbnail_path"
/** Columnas de la foto en una base que todavía no adoptó bucket, path ni miniaturas. */
const COLUMNAS_FOTO_LEGACY = "url"

type Relacion<T> = T | T[] | null

type ServicioAdministrativo = Awaited<ReturnType<typeof autorizarAdministracion>>["servicio"]

type ErrorDeConsulta = { message?: string; details?: string } | null

type FilaReporte = {
  id: number
  titulo: string
  estado_id: number
  deleted_at: string | null
  fotos_reporte?: ReportImageRow[] | null
}

type FilaImpugnacion = {
  id: string
  motivo: string | null
  created_at: string
  evidencias_reparacion: Relacion<{
    id: string
    reporte_id: number
    comentario: string
    estado: string
    reportes: Relacion<FilaReporte>
  }>
}

type FilaEvidencia = ReportImageRow & {
  id: string
  reporte_id: number
  comentario: string
  estado: string
  publicada_at: string | null
  reportes: Relacion<FilaReporte>
}

type FilaContador = { evidencia_id: string; tipo: string; estado: string }

/** Contadores de una evidencia; nunca incluyen a las personas que verificaron. */
export type ContadoresVerificacion = {
  confirmaciones: number
  impugnaciones: number
  impugnacionesPendientes: number
}

/** Impugnación pendiente de una evidencia en verificación. */
export type ImpugnacionPendiente = ContadoresVerificacion & {
  verificacionId: string
  evidenciaId: string
  reporteId: number
  titulo: string
  comentario: string
  motivo: string
  creadoAt: string
}

/** Evidencia con su estado actual y los contadores que la administración necesita. */
export type EvidenciaEnDecision = ContadoresVerificacion & {
  evidenciaId: string
  reporteId: number
  titulo: string
  comentario: string
  publicadaAt: string | null
  /** Foto subida como reparación («después») y su miniatura; `null` si no hay. */
  fotoEvidencia: string | null
  miniaturaEvidencia: string | null
  /** Primera foto del reporte («antes») y su miniatura; la misma que ve el ciudadano. */
  fotoReporte: string | null
  miniaturaReporte: string | null
}

/** Normaliza la relación embebida de PostgREST a un único objeto o `null`. */
function uno<T>(relacion: Relacion<T>): T | null {
  return Array.isArray(relacion) ? relacion[0] ?? null : relacion
}

/** Página acotada igual que las otras colas administrativas. */
function numeroDePagina(pagina: number) {
  return Number.isSafeInteger(pagina) ? Math.max(0, Math.min(pagina, 500)) : 0
}

/** Filas de la página pedida, de veinte en veinte. */
function rangoDePagina(pagina: number): [number, number] {
  const inicio = numeroDePagina(pagina) * TAMANO_PAGINA
  return [inicio, inicio + TAMANO_PAGINA - 1]
}

/**
 * Arma la selección de evidencias con la foto de la evidencia y la primera foto del reporte.
 *
 * @param canonica - `true` pide bucket, path y miniaturas; `false` se queda con la URL legacy.
 * @returns Columnas de la consulta, con los campos de foto y el reporte embebido.
 */
function seleccionDeEvidencias(canonica: boolean): string {
  const fotos = canonica ? COLUMNAS_FOTO_CANONICA : COLUMNAS_FOTO_LEGACY
  return `id,reporte_id,comentario,estado,publicada_at,${fotos},reportes!inner(id,titulo,estado_id,deleted_at,fotos_reporte(${fotos}))`
}

/**
 * Ejecuta la consulta de evidencias y reintenta con la forma legacy cuando la base
 * todavía no tiene las columnas canónicas de foto, igual que el detalle del reporte.
 *
 * @param consulta - Consulta completa para la selección recibida.
 * @param mensajeDeFalla - Error en español cuando la consulta sigue fallando.
 * @returns Filas de la página o un arreglo vacío cuando no hay evidencias. */
async function consultarEvidencias(
  consulta: (columnas: string) => PromiseLike<{ data: unknown; error: ErrorDeConsulta }>,
  mensajeDeFalla: string,
): Promise<FilaEvidencia[]> {
  let resultado = await consulta(seleccionDeEvidencias(true))
  if (resultado.error && isMissingReportImageColumnsError(resultado.error)) {
    resultado = await consulta(seleccionDeEvidencias(false))
  }
  if (resultado.error) throw new Error(mensajeDeFalla)
  return (resultado.data ?? []) as FilaEvidencia[]
}

/** Foto principal del reporte y su miniatura, igual que la primera foto del detalle. */
function fotoPrincipalDelReporte(fotos: ReportImageRow[] | null | undefined) {
  const [primera] = resolveReportImageRows(fotos ?? [])
  return {
    foto: primera?.publicUrl ?? null,
    miniatura: primera?.thumbnailPublicUrl ?? null,
  }
}

/** Tope al dominio de una lista ya normalizada. */
export const TAMANO_PAGINA_REPARACIONES = TAMANO_PAGINA

/**
 * Cuenta confirmaciones, impugnaciones e impugnaciones pendientes de las evidencias
 * de la página con una sola consulta agregada, sin pedir la identidad de nadie.
 *
 * @param servicio - Cliente de servicio ya autorizado como administrador.
 * @param evidenciaIds - Evidencias visibles en la página.
 * @returns Mapa de contadores por evidencia; vacío cuando no hay evidencias.
 */
async function contarVerificaciones(
  servicio: ServicioAdministrativo,
  evidenciaIds: string[],
): Promise<Map<string, ContadoresVerificacion>> {
  const contadores = new Map<string, ContadoresVerificacion>()
  if (!evidenciaIds.length) return contadores

  const { data, error } = await servicio.from("verificaciones_reparacion")
    .select("evidencia_id,tipo,estado")
    .in("evidencia_id", evidenciaIds)
    .range(0, LIMITE_CONTADORES - 1)
  if (error) throw new Error("No se pudieron contar las verificaciones de las reparaciones.")

  for (const fila of (data ?? []) as FilaContador[]) {
    const actuales = contadores.get(fila.evidencia_id) ?? { confirmaciones: 0, impugnaciones: 0, impugnacionesPendientes: 0 }
    if (fila.tipo === "confirmacion") actuales.confirmaciones += 1
    if (fila.tipo === "impugnacion") {
      actuales.impugnaciones += 1
      if (fila.estado === "pendiente") actuales.impugnacionesPendientes += 1
    }
    contadores.set(fila.evidencia_id, actuales)
  }
  return contadores
}

/** Lee los contadores de la evidencia o los devuelve en cero si no tiene verificaciones. */
function contadoresDe(
  contadores: Map<string, ContadoresVerificacion>,
  evidenciaId: string,
): ContadoresVerificacion {
  return contadores.get(evidenciaId) ?? { confirmaciones: 0, impugnaciones: 0, impugnacionesPendientes: 0 }
}

/**
 * Impugnaciones pendientes de evidencias en verificación, de la más antigua a la
 * más reciente (S5, S8). Un reporte retirado o ya cerrado no se muestra aunque la
 * base conserve una impugnación pendiente.
 *
 * @param pagina - Página de veinte filas, con el mismo tope que las otras colas.
 * @returns Impugnaciones visibles con sus contadores; nunca identidades.
 */
export async function listarImpugnacionesPendientes(pagina: number): Promise<ImpugnacionPendiente[]> {
  const { servicio } = await autorizarAdministracion()
  const { data, error } = await servicio.from("verificaciones_reparacion")
    .select("id,evidencia_id,motivo,created_at,evidencias_reparacion!inner(id,reporte_id,comentario,estado,reportes!inner(id,titulo,estado_id,deleted_at))")
    .eq("tipo", "impugnacion")
    .eq("estado", "pendiente")
    .eq("evidencias_reparacion.estado", "en_verificacion")
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .range(...rangoDePagina(pagina))

  if (error) throw new Error("No se pudieron consultar las impugnaciones de reparaciones.")

  const visibles = ((data ?? []) as FilaImpugnacion[]).flatMap((fila) => {
    const evidencia = uno(fila.evidencias_reparacion)
    const reporte = evidencia && uno(evidencia.reportes)
    if (!evidencia || !reporte) return []
    if (reporte.deleted_at !== null || reporte.estado_id !== REPORT_STATE_IDS.PENDIENTE) return []
    return [{ fila, evidencia, reporte }]
  })

  const contadores = await contarVerificaciones(servicio, [...new Set(visibles.map(({ evidencia }) => evidencia.id))])
  return visibles.map(({ fila, evidencia, reporte }) => ({
    verificacionId: fila.id,
    evidenciaId: evidencia.id,
    reporteId: reporte.id,
    titulo: reporte.titulo,
    comentario: evidencia.comentario,
    motivo: fila.motivo ?? "",
    creadoAt: fila.created_at,
    ...contadoresDe(contadores, evidencia.id),
  }))
}

/**
 * Evidencias que esperan una decisión administrativa de aprobación o rechazo
 * (S8, S11): foto publicada, en verificación y con el reporte abierto.
 *
 * @param pagina - Página de veinte filas.
 * @returns Evidencias en verificación con sus contadores; nunca identidades.
 */
export async function listarEvidenciasEnVerificacion(pagina: number): Promise<EvidenciaEnDecision[]> {
  const { servicio } = await autorizarAdministracion()
  const filas = await consultarEvidencias(
    (columnas) => servicio.from("evidencias_reparacion")
      .select(columnas)
      .in("estado", ["en_verificacion"])
      .eq("reportes.estado_id", REPORT_STATE_IDS.PENDIENTE)
      .is("reportes.deleted_at", null)
      .order("publicada_at", { ascending: true })
      .order("id", { ascending: true })
      .range(...rangoDePagina(pagina)),
    "No se pudieron consultar las evidencias en verificación.",
  )
  return armarEvidencias(servicio, filas)
}

/**
 * Reparaciones ya validadas por la comunidad o por administración, que todavía se
 * pueden revertir (S8, S15). Revertir devuelve el reporte a Pendiente.
 *
 * @param pagina - Página de veinte filas.
 * @returns Evidencias validadas con sus contadores; nunca identidades.
 */
export async function listarEvidenciasValidadas(pagina: number): Promise<EvidenciaEnDecision[]> {
  const { servicio } = await autorizarAdministracion()
  const filas = await consultarEvidencias(
    (columnas) => servicio.from("evidencias_reparacion")
      .select(columnas)
      .in("estado", ["validada"])
      .is("reportes.deleted_at", null)
      .order("publicada_at", { ascending: true })
      .order("id", { ascending: true })
      .range(...rangoDePagina(pagina)),
    "No se pudieron consultar las reparaciones validadas.",
  )
  return armarEvidencias(servicio, filas)
}

/**
 * Normaliza las filas de evidencia y les agrega los contadores de su página.
 *
 * @param servicio - Cliente de servicio ya autorizado.
 * @param filas - Evidencias devueltas por la consulta paginada.
 * @returns Evidencias visibles; se descartan las que ya no tienen reporte legible.
 */
async function armarEvidencias(
  servicio: ServicioAdministrativo,
  filas: FilaEvidencia[],
): Promise<EvidenciaEnDecision[]> {
  const visibles = filas.flatMap((fila) => {
    const reporte = uno(fila.reportes)
    return reporte ? [{ fila, reporte }] : []
  })
  const contadores = await contarVerificaciones(servicio, [...new Set(visibles.map(({ fila }) => fila.id))])
  return visibles.map(({ fila, reporte }) => {
    const fotoReporte = fotoPrincipalDelReporte(reporte.fotos_reporte)
    return {
      evidenciaId: fila.id,
      reporteId: reporte.id,
      titulo: reporte.titulo,
      comentario: fila.comentario,
      publicadaAt: fila.publicada_at,
      fotoEvidencia: resolveReportImageUrl(fila),
      miniaturaEvidencia: resolveReportImageThumbnailUrl(fila),
      fotoReporte: fotoReporte.foto,
      miniaturaReporte: fotoReporte.miniatura,
      ...contadoresDe(contadores, fila.id),
    }
  })
}
