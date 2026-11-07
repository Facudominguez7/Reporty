"use server"
/** Acciones administrativas: la frontera compartida autoriza cada invocación. */
import { revalidatePath } from "next/cache"
import { autorizarAdministracion } from "@/lib/moderation/administracion.server"
import { procesarAvisosMascota } from "@/lib/moderation/avisos-mascotas.server"
import { conciliarAvisoMascotaAdministrativamente, editarMascotaAdministrativamente, ejecutarRevision, type EdicionMascotaAdmin, type OperacionRevision, type ResultadoRevision } from "@/lib/moderation/administracion.server"
import { createClient } from "@/utils/supabase/server"

export async function cambiarEstadoMascotaAdminAction(id: number, estado: string): Promise<ResultadoRevision> {
  try {
    if (!Number.isSafeInteger(id) || id <= 0 || !["perdida", "encontrada"].includes(estado)) return { exito: false, mensaje: "Publicación no disponible." }
    const { servicio } = await autorizarAdministracion()
    const { error } = await servicio.from("mascotas_perdidas").update({ estado }).eq("id", id).is("retirada_at", null)
    if (error) return { exito: false, mensaje: "No se pudo actualizar el estado." }
    revalidatePath("/admin/mascotas")
    revalidatePath(`/mascotas/${id}`)
    revalidatePath("/mapa")
    return { exito: true, mascotaId: id, mensaje: "Estado actualizado." }
  } catch { return { exito: false, mensaje: "No se pudo actualizar el estado. Verificá tus permisos." }
  }
}

export async function retirarMascotaAdminAction(id: number): Promise<ResultadoRevision> {
  try {
    if (!Number.isSafeInteger(id) || id <= 0) return { exito: false, mensaje: "Publicación no disponible." }
    await autorizarAdministracion()
    const supabase = await createClient()
    const { data, error } = await supabase.rpc("retirar_mascota_moderacion", { p_mascota_id: id })
    if (error || !data) return { exito: false, mensaje: "No se pudo retirar la publicación." }
    for (const path of ["/admin/mascotas", `/mascotas/${id}`, "/mapa", "/reportes", "/sitemap.xml"]) revalidatePath(path)
    return { exito: true, mascotaId: id, mensaje: "Publicación retirada." }
  } catch { return { exito: false, mensaje: "No se pudo retirar la publicación. Verificá tus permisos." }
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
