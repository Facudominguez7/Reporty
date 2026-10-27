import "server-only"

import { autorizarAdministracion } from "./administracion.server"

/** Count only images still awaiting a human decision, not publication/cleanup work. */
export async function getPendingReviewCount(): Promise<number | null> {
  const { servicio } = await autorizarAdministracion()
  const { count, error } = await servicio.from("moderacion_imagenes")
    .select("id", { count: "exact", head: true })
    .eq("decision", "REVIEW")
    .eq("estado_publicacion", "pendiente")
  return error ? null : count
}
