/**
 * Catálogo único de acciones de `public.audit_events`.
 *
 * El panel y los filtros leen de acá: agregar una acción nueva al catálogo de la
 * base exige agregarla en este archivo, y `lib/auditoria/acciones.test.ts` falla
 * si alguna acción permitida por las migraciones se quedó sin descripción.
 */

/** Grupos que ordenan los filtros del panel. */
export type GrupoAccion = "reportes" | "evidencias" | "archivo"

/** Acción de auditoría con su etiqueta de filtro y su frase para la lista. */
export type AccionAuditoriaCatalogo = {
  valor: string
  etiqueta: string
  frase: string
  grupo: GrupoAccion
}

/** Acciones registradas por los triggers de captura. */
export const ACCIONES_CAPTURA = [
  { valor: "report_created", etiqueta: "Creó un reporte", frase: "creó un reporte", grupo: "reportes" },
  { valor: "comment_created", etiqueta: "Comentó", frase: "comentó un reporte", grupo: "reportes" },
  { valor: "vote_repaired", etiqueta: "Votó reparado", frase: "votó que un reporte está reparado", grupo: "reportes" },
  { valor: "vote_not_exists", etiqueta: "Votó que no existe", frase: "votó que un reporte no existe", grupo: "reportes" },
] as const satisfies readonly AccionAuditoriaCatalogo[]

/** Acciones del flujo de evidencia de reparación (migración 20261106120000). */
export const ACCIONES_EVIDENCIA = [
  { valor: "evidence_submitted", etiqueta: "Informó una reparación", frase: "informó una reparación con evidencia", grupo: "evidencias" },
  { valor: "evidence_confirmed", etiqueta: "Confirmó una reparación", frase: "confirmó que el reporte está reparado", grupo: "evidencias" },
  { valor: "evidence_challenged", etiqueta: "Impugnó una reparación", frase: "impugnó una reparación informada", grupo: "evidencias" },
  { valor: "evidence_challenge_resolved", etiqueta: "Resolvió una impugnación", frase: "resolvió una impugnación de reparación", grupo: "evidencias" },
  { valor: "evidence_approved", etiqueta: "Aprobó una evidencia", frase: "aprobó una evidencia de reparación", grupo: "evidencias" },
  { valor: "evidence_rejected", etiqueta: "Rechazó una evidencia", frase: "rechazó una evidencia de reparación", grupo: "evidencias" },
  { valor: "evidence_reverted", etiqueta: "Revirtió una reparación", frase: "revirtió una reparación aprobada", grupo: "evidencias" },
] as const satisfies readonly AccionAuditoriaCatalogo[]

/** Acciones administrativas del archivo histórico en Cloudflare R2. */
export const ACCIONES_ARCHIVO = [
  { valor: "audit_archive_uploaded", etiqueta: "Subió un lote al archivo", frase: "subió un lote de auditoría a R2", grupo: "archivo" },
  { valor: "audit_archive_verified", etiqueta: "Verificó un lote archivado", frase: "verificó la integridad de un lote archivado", grupo: "archivo" },
  { valor: "audit_archive_purged", etiqueta: "Purgó un lote archivado", frase: "eliminó de PostgreSQL un lote ya archivado", grupo: "archivo" },
  { valor: "audit_archive_downloaded", etiqueta: "Descargó un lote archivado", frase: "descargó un lote de auditoría archivado", grupo: "archivo" },
] as const satisfies readonly AccionAuditoriaCatalogo[]

/** Todas las acciones conocidas, en el orden en que se muestran los filtros. */
export const ACCIONES_AUDITORIA = [
  ...ACCIONES_CAPTURA,
  ...ACCIONES_EVIDENCIA,
  ...ACCIONES_ARCHIVO,
] as const

/** Unión literal de las acciones conocidas por el panel. */
export type ValorAccionAuditoria = (typeof ACCIONES_AUDITORIA)[number]["valor"]

/** Etiquetas por grupo, para los `optgroup` del filtro. */
export const ETIQUETAS_GRUPO: Record<GrupoAccion, string> = {
  reportes: "Reportes y comentarios",
  evidencias: "Evidencias de reparación",
  archivo: "Archivo histórico",
}

const POR_VALOR = new Map<string, AccionAuditoriaCatalogo>(
  ACCIONES_AUDITORIA.map((accion) => [accion.valor, accion]),
)

/** Alias corto de la unión de acciones conocidas. */
export type AccionAuditoria = ValorAccionAuditoria

/**
 * Indica si el valor corresponde a una acción conocida del catálogo.
 *
 * @param valor acción tal como llega por query string.
 */
export function esAccionAuditoria(valor: string | undefined | null): valor is ValorAccionAuditoria {
  return typeof valor === "string" && POR_VALOR.has(valor)
}

/**
 * Frase que describe la acción después del nombre del actor.
 *
 * Una acción desconocida (por ejemplo, agregada por una migración posterior a
 * este catálogo) no rompe la página: se describe con un texto genérico.
 *
 * @param accion acción registrada en la base.
 */
export function fraseAccion(accion: string): string {
  return POR_VALOR.get(accion)?.frase ?? "realizó una acción de auditoría"
}

/**
 * Etiqueta corta de la acción para filtros y detalle de lote.
 *
 * @param accion acción registrada en la base.
 */
export function etiquetaAccion(accion: string): string {
  return POR_VALOR.get(accion)?.etiqueta ?? accion
}

/** Acciones agrupadas para el `<select>` del filtro del panel. */
export function accionesPorGrupo(): Array<{ grupo: GrupoAccion; etiqueta: string; acciones: readonly AccionAuditoriaCatalogo[] }> {
  return [
    { grupo: "reportes", etiqueta: ETIQUETAS_GRUPO.reportes, acciones: ACCIONES_CAPTURA },
    { grupo: "evidencias", etiqueta: ETIQUETAS_GRUPO.evidencias, acciones: ACCIONES_EVIDENCIA },
    { grupo: "archivo", etiqueta: ETIQUETAS_GRUPO.archivo, acciones: ACCIONES_ARCHIVO },
  ]
}
