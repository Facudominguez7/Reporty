import "server-only"

/**
 * Configuración del archivo histórico de auditoría en Cloudflare R2.
 *
 * Las credenciales se leen solo en el servidor: ningún módulo de este directorio
 * puede importarse desde un componente cliente y ninguna variable usa el prefijo
 * `NEXT_PUBLIC_`.
 */

/** Días que un evento permanece en PostgreSQL antes de poder archivarse. */
export const DIAS_RETENCION_POR_DEFECTO = 180
/** Mínimo aceptado para la retención caliente: menos días no libera nada real. */
export const DIAS_RETENCION_MINIMO = 30
/** Máximo aceptado: 10 años; evita límites absurdos por error de tipeo. */
export const DIAS_RETENCION_MAXIMO = 3650
/** Eventos por lote cuando el entorno no define `AUDIT_ARCHIVE_MAX_BATCH`. */
export const LIMITE_LOTE_POR_DEFECTO = 1000
/** Tope duro por lote: acota memoria, tiempo de request y tamaño del objeto. */
export const LIMITE_LOTE_MAXIMO = 5000
/** Eventos máximos que puede archivar una corrida disparada desde el panel. */
export const LIMITE_CORRIDA_MANUAL = 200
/** Longitud mínima del secreto que autentica la ejecución programada. */
export const LONGITUD_MINIMA_SECRETO_CRON = 32

/**
 * Error de configuración del archivo de auditoría.
 *
 * Expone solo los nombres de las variables faltantes o inválidas: los valores
 * nunca forman parte del mensaje para que no terminen en logs.
 */
export class ErrorConfiguracionArchivo extends Error {
  readonly variablesFaltantes: string[]

  constructor(variables: string[], detalle: string) {
    super(`${detalle} Variables: ${variables.join(", ")}.`)
    this.name = "ErrorConfiguracionArchivo"
    this.variablesFaltantes = variables
  }
}

/** Configuración validada y lista para construir el cliente S3. */
export type ConfiguracionArchivoAuditoria = {
  cuentaR2: string
  accessKeyId: string
  secretAccessKey: string
  bucket: string
  diasRetencion: number
  limitePorLote: number
  /** La purga de origen está apagada hasta que el dueño confirme el proceso completo. */
  purgaHabilitada: boolean
  endpoint: string
}

/** Entorno mínimo que la configuración necesita; `process.env` lo satisface. */
export type EntornoArchivoAuditoria = Record<string, string | undefined>

/** Endpoint oficial de la API compatible con S3 de Cloudflare R2. */
export function endpointR2(cuenta: string): string {
  return `https://${cuenta}.r2.cloudflarestorage.com`
}

const PATRON_CUENTA = /^[a-zA-Z0-9]{16,64}$/
const PATRON_CLAVE = /^[A-Za-z0-9]{16,128}$/
const PATRON_SECRETO = /^[A-Za-z0-9/+=]{32,128}$/
const PATRON_BUCKET = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/

function recortar(valor: string | undefined): string {
  return (valor ?? "").trim()
}

function enteroEnRango(
  valor: string | undefined,
  porDefecto: number,
  minimo: number,
  maximo: number,
  variable: string,
): number {
  const texto = recortar(valor)
  if (!texto) return porDefecto
  if (!/^\d+$/.test(texto)) {
    throw new ErrorConfiguracionArchivo([variable], `La variable ${variable} debe ser un entero.`)
  }
  const numero = Number(texto)
  if (numero < minimo || numero > maximo) {
    throw new ErrorConfiguracionArchivo([variable], `La variable ${variable} debe estar entre ${minimo} y ${maximo}.`)
  }
  return numero
}

/**
 * Lee y valida la configuración del archivo de auditoría.
 *
 * @param entorno Variables de entorno; por defecto `process.env`.
 * @throws {ErrorConfiguracionArchivo} cuando falta o es inválida alguna variable.
 */
export function leerConfiguracionArchivo(entorno: EntornoArchivoAuditoria = process.env): ConfiguracionArchivoAuditoria {
  const cuentaR2 = recortar(entorno.R2_ACCOUNT_ID)
  const accessKeyId = recortar(entorno.R2_ACCESS_KEY_ID)
  const secretAccessKey = recortar(entorno.R2_SECRET_ACCESS_KEY)
  const bucket = recortar(entorno.R2_BUCKET_NAME)

  const faltantes: string[] = []
  if (!cuentaR2) faltantes.push("R2_ACCOUNT_ID")
  if (!accessKeyId) faltantes.push("R2_ACCESS_KEY_ID")
  if (!secretAccessKey) faltantes.push("R2_SECRET_ACCESS_KEY")
  if (!bucket) faltantes.push("R2_BUCKET_NAME")
  if (faltantes.length > 0) {
    throw new ErrorConfiguracionArchivo(faltantes, "Falta configuración de Cloudflare R2.")
  }

  const invalidas: string[] = []
  if (!PATRON_CUENTA.test(cuentaR2)) invalidas.push("R2_ACCOUNT_ID")
  if (!PATRON_CLAVE.test(accessKeyId)) invalidas.push("R2_ACCESS_KEY_ID")
  if (!PATRON_SECRETO.test(secretAccessKey)) invalidas.push("R2_SECRET_ACCESS_KEY")
  if (!PATRON_BUCKET.test(bucket)) invalidas.push("R2_BUCKET_NAME")
  if (invalidas.length > 0) {
    throw new ErrorConfiguracionArchivo(invalidas, "Hay variables de Cloudflare R2 con formato inválido.")
  }

  return {
    cuentaR2,
    accessKeyId,
    secretAccessKey,
    bucket,
    diasRetencion: enteroEnRango(
      entorno.AUDIT_HOT_DAYS,
      DIAS_RETENCION_POR_DEFECTO,
      DIAS_RETENCION_MINIMO,
      DIAS_RETENCION_MAXIMO,
      "AUDIT_HOT_DAYS",
    ),
    limitePorLote: enteroEnRango(
      entorno.AUDIT_ARCHIVE_MAX_BATCH,
      LIMITE_LOTE_POR_DEFECTO,
      1,
      LIMITE_LOTE_MAXIMO,
      "AUDIT_ARCHIVE_MAX_BATCH",
    ),
    purgaHabilitada: recortar(entorno.AUDIT_ARCHIVE_PURGE_ENABLED).toLowerCase() === "true",
    endpoint: endpointR2(cuentaR2),
  }
}

/**
 * Lee el secreto que autentica la ejecución programada del archivo.
 *
 * @throws {ErrorConfiguracionArchivo} si falta o es demasiado corto.
 */
export function leerSecretoCron(entorno: EntornoArchivoAuditoria = process.env): string {
  const secreto = recortar(entorno.AUDIT_ARCHIVE_CRON_SECRET)
  if (secreto.length < LONGITUD_MINIMA_SECRETO_CRON) {
    throw new ErrorConfiguracionArchivo(
      ["AUDIT_ARCHIVE_CRON_SECRET"],
      `El secreto de la ejecución programada debe tener al menos ${LONGITUD_MINIMA_SECRETO_CRON} caracteres.`,
    )
  }
  return secreto
}

/**
 * Indica si el archivo está configurado, sin lanzar: lo usa el panel para mostrar
 * el estado real en producción en lugar de romper la página.
 */
export function archivoConfigurado(entorno: EntornoArchivoAuditoria = process.env): boolean {
  try {
    leerConfiguracionArchivo(entorno)
    return true
  } catch {
    return false
  }
}
