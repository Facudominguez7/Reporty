"use server"
/** Acciones administrativas: la frontera compartida autoriza cada invocación. */
import { revalidatePath } from "next/cache"
import { ejecutarRevision, type OperacionRevision, type ResultadoRevision } from "@/lib/moderation/administracion.server"

/** Decide o recupera evidencia sin aceptar identidades administrativas desde el navegador. */
export async function revisarImagenAction(id: string, operacion: OperacionRevision): Promise<ResultadoRevision> {
  try {
    const resultado = await ejecutarRevision(id, operacion)
    if (resultado.exito) {
      for (const ruta of ["/dashboard/moderacion", `/reportes/${resultado.reporteId}`, "/mapa", "/reportes", "/mis-reportes", "/dashboard"]) revalidatePath(ruta)
    }
    return resultado
  } catch {
    return { exito: false, mensaje: "No se pudo completar la operación. Verificá tus permisos y actualizá la cola." }
  }
}
