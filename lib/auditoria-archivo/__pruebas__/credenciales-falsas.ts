/**
 * Credenciales falsas para las pruebas del archivo de auditoría.
 *
 * Se construyen repitiendo un carácter para que sean evidentes a simple vista y
 * no parezcan secretos reales ante los escáneres de credenciales (GitGuardian y
 * similares). Cumplen los formatos que valida `configuracion.ts`, pero no sirven
 * para autenticar contra ningún servicio.
 */
import type { ConfiguracionArchivoAuditoria } from "../configuracion"

/** Identificador de cuenta de R2 falso: 32 caracteres alfanuméricos. */
export const CUENTA_FALSA = "a".repeat(32)
/** Access Key ID falso: 32 caracteres alfanuméricos. */
export const ID_CLAVE_FALSA = "b".repeat(32)
/** Secret Access Key falso: 64 caracteres. */
export const CLAVE_SECRETA_FALSA = "c".repeat(64)
/** Secreto del cron falso: más largo que el mínimo de 32 caracteres. */
export const SECRETO_CRON_FALSO = "d".repeat(40)
/** Endpoint que arma `endpointR2` para la cuenta falsa. */
export const ENDPOINT_FALSO = `https://${CUENTA_FALSA}.r2.cloudflarestorage.com`

/** Configuración completa y válida con las credenciales falsas. */
export const CONFIGURACION_FALSA: ConfiguracionArchivoAuditoria = {
  cuentaR2: CUENTA_FALSA,
  accessKeyId: ID_CLAVE_FALSA,
  secretAccessKey: CLAVE_SECRETA_FALSA,
  bucket: "reporty-audit-archive",
  diasRetencion: 180,
  limitePorLote: 1000,
  purgaHabilitada: false,
  endpoint: ENDPOINT_FALSO,
}
