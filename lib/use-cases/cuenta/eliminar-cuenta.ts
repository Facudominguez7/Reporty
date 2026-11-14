import type { SupabaseClient } from "@supabase/supabase-js"

import { ERROR_ADMIN_NO_ELIMINABLE } from "@/lib/cuenta/eliminacion"

/** Resultado de un caso de uso: datos en el éxito o un mensaje en español en el error. */
export type ResultadoEliminacion<T> = { success: true; data: T } | { success: false; error: string }

/** Cuántos archivos se pudieron borrar del Storage después de eliminar la cuenta. */
export type ResumenEliminacion = { archivosEliminados: number; archivosConError: number }

/** Archivo de Storage que la RPC devuelve para limpiar. */
type ArchivoPendiente = { bucket: string; path: string }

/** Máximo de rutas por llamada a `storage.remove`. */
const TAMANO_TANDA = 100

/**
 * Elimina la cuenta del usuario y todo su contenido.
 *
 * La RPC `eliminar_cuenta_usuario` borra los datos y la identidad en una sola transacción y
 * devuelve los archivos huérfanos. Recién después se limpia el Storage: si esa limpieza falla,
 * la cuenta ya no existe y el fallo solo se registra (los archivos quedan sin referencias).
 *
 * @param servicio - Cliente con service role (`createAdminClient`).
 * @param usuarioId - Usuario autenticado que pidió eliminar su cuenta.
 * @returns Resumen de archivos borrados, o el error para mostrar al usuario.
 */
export async function eliminarCuentaWorkflow(
  servicio: SupabaseClient,
  usuarioId: string,
): Promise<ResultadoEliminacion<ResumenEliminacion>> {
  const { data, error } = await servicio.rpc("eliminar_cuenta_usuario", { p_usuario: usuarioId })

  if (error) {
    if (error.message?.includes("administrador_no_eliminable")) {
      return { success: false, error: ERROR_ADMIN_NO_ELIMINABLE }
    }
    console.error("No pudimos eliminar la cuenta:", error.message)
    return { success: false, error: "No pudimos eliminar tu cuenta. Probá de nuevo en unos minutos." }
  }

  return { success: true, data: await borrarArchivos(servicio, (data ?? []) as ArchivoPendiente[]) }
}

/**
 * Borra los archivos agrupados por bucket y en tandas, sin cortar ante un error.
 *
 * @param servicio - Cliente con service role.
 * @param archivos - Archivos que devolvió la RPC.
 * @returns Cuántos se borraron y cuántos fallaron.
 */
async function borrarArchivos(servicio: SupabaseClient, archivos: ArchivoPendiente[]): Promise<ResumenEliminacion> {
  const porBucket = new Map<string, string[]>()
  for (const { bucket, path } of archivos) {
    porBucket.set(bucket, [...(porBucket.get(bucket) ?? []), path])
  }

  const resumen: ResumenEliminacion = { archivosEliminados: 0, archivosConError: 0 }
  for (const [bucket, rutas] of porBucket) {
    for (let inicio = 0; inicio < rutas.length; inicio += TAMANO_TANDA) {
      const tanda = rutas.slice(inicio, inicio + TAMANO_TANDA)
      const { error } = await servicio.storage.from(bucket).remove(tanda)
      if (error) {
        console.error(`No pudimos borrar ${tanda.length} archivos de ${bucket} tras eliminar una cuenta:`, error.message)
        resumen.archivosConError += tanda.length
      } else {
        resumen.archivosEliminados += tanda.length
      }
    }
  }
  return resumen
}
