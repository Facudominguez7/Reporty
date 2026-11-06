"use server"
/** Acciones administrativas: la frontera compartida autoriza cada invocación. */
import { revalidatePath } from "next/cache"
import { autorizarAdministracion } from "@/lib/moderation/administracion.server"
import { procesarAvisosMascota } from "@/lib/moderation/avisos-mascotas.server"
import { conciliarAvisoMascotaAdministrativamente, editarMascotaAdministrativamente, ejecutarRevision, subirFotoReemplazoMascotaAdministrativamente, type EdicionMascotaAdmin, type OperacionRevision, type ResultadoRevision } from "@/lib/moderation/administracion.server"

/** Decide o recupera evidencia sin aceptar identidades administrativas desde el navegador. */
export async function reemplazarFotoMascotaAction(form: FormData): Promise<ResultadoRevision> {
  try {
    const mascotaId = Number(form.get("mascotaId"))
    const foto = form.get("foto")
    if (typeof foto === "string" || !(foto instanceof File)) return { exito: false, mensaje: "Seleccioná una foto válida." }
    const resultado = await subirFotoReemplazoMascotaAdministrativamente(mascotaId, foto)
    if (resultado.exito) revalidatePath("/dashboard/moderacion")
    return resultado
  } catch {
    return { exito: false, mensaje: "No se pudo enviar la foto a revisión privada." }
  }
}

export async function reintentarAvisosMascotaAction(mascotaId: number): Promise<ResultadoRevision> {
  try {
    if (!Number.isSafeInteger(mascotaId) || mascotaId <= 0) return { exito: false, mensaje: "Publicación no disponible." }
    const { servicio } = await autorizarAdministracion()
    const estado = await procesarAvisosMascota(servicio, mascotaId)
    return { exito: estado === "enviado" || estado === "sin_pendientes", mascotaId,
      mensaje: estado === "conciliacion" ? "Aceptación incierta fuera de la ventana segura: verificá el proveedor antes de conciliar; no se reenviará automáticamente."
        : estado === "pendiente" ? "El aviso sigue pendiente; se reintentará con la clave idempotente dentro de la ventana segura."
          : "Avisos pendientes procesados." }
  } catch { return { exito: false, mensaje: "No se pudo procesar el aviso. Verificá permisos y reintentá." }
  }
}

export async function conciliarAvisoMascotaAction(avisoId: number): Promise<ResultadoRevision> {
  try {
    const conciliado = await conciliarAvisoMascotaAdministrativamente(avisoId)
    return { exito: conciliado, mensaje: conciliado ? "Aceptación del proveedor registrada con tu identidad; no se envió otro correo." : "El aviso cambió o no está habilitado para conciliación." }
  } catch { return { exito: false, mensaje: "No se pudo conciliar el aviso. Verificá permisos y el estado de la cola." }
  }
}

export async function editarMascotaAction(input: EdicionMascotaAdmin): Promise<ResultadoRevision> {
  try {
    const resultado = await editarMascotaAdministrativamente(input)
    if (resultado.exito) {
      for (const ruta of ["/dashboard/moderacion", `/mascotas/${resultado.mascotaId}`, "/mapa", "/reportes", "/sitemap.xml"]) revalidatePath(ruta)
    }
    return resultado
  } catch {
    return { exito: false, mensaje: "No se pudo actualizar la publicación. Verificá tus permisos y los datos." }
  }
}

export async function revisarImagenAction(id: string, operacion: OperacionRevision): Promise<ResultadoRevision> {
  try {
    const resultado = await ejecutarRevision(id, operacion)
    if (resultado.exito) {
      for (const ruta of ["/dashboard/moderacion", ...(resultado.reporteId ? [`/reportes/${resultado.reporteId}`] : []), ...(resultado.mascotaId ? [`/mascotas/${resultado.mascotaId}`] : []), "/mapa", "/reportes", "/mis-reportes", "/dashboard", "/", "/sitemap.xml"]) revalidatePath(ruta)
    }
    return resultado
  } catch {
    return { exito: false, mensaje: "No se pudo completar la operación. Verificá tus permisos y actualizá la cola." }
  }
}
