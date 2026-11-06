import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import { enviarAvisoEstadoMascota, type EstadoAvisoMascota } from "@/lib/notifications/mascota-notifications"

// Keep in sync with the provider's 24-hour idempotency window, with a five-minute safety margin.
export const VENTANA_REINTENTO_AVISO_MASCOTA_MS = (24 * 60 - 5) * 60_000
export type EstadoAvisoMascotaProceso = "enviado" | "pendiente" | "conciliacion" | "sin_pendientes"

/** Claims a durable event before network I/O; never reports accepted until DB confirms the lease token. */
export async function enviarAvisoMascotaPendiente(servicio: SupabaseClient, avisoId: number): Promise<EstadoAvisoMascotaProceso> {
  try {
    const claim = await servicio.rpc("reclamar_aviso_estado_mascota", { p_id: avisoId })
    if (claim.error) return "pendiente"
    if (typeof claim.data !== "string") {
      const { data, error } = await servicio.from("avisos_estado_mascota").select("estado").eq("id", avisoId).single()
      if (error || !data) return "pendiente"
      return data.estado === "conciliacion" ? "conciliacion" : data.estado === "enviado" ? "enviado" : "pendiente"
    }
    const { data: row, error } = await servicio.from("avisos_estado_mascota")
      .select("id,mascota_id,destinatario,evento,token,reclamado_hasta,primer_intento_at")
      .eq("id", avisoId).single()
    if (error || !row || row.token !== claim.data || !(Date.parse(row.reclamado_hasta) > Date.now())) return "pendiente"
    const primerIntento = Date.parse(row.primer_intento_at)
    if (!Number.isFinite(primerIntento) || Date.now() - primerIntento >= VENTANA_REINTENTO_AVISO_MASCOTA_MS) {
      return "conciliacion"
    }
    const result = await enviarAvisoEstadoMascota({
      destinatario: row.destinatario, mascotaId: row.mascota_id,
      estado: row.evento as EstadoAvisoMascota, eventoId: String(row.id),
    })
    if (result.error || !result.data?.id) return "pendiente"
    const confirmed = await servicio.rpc("confirmar_aviso_estado_mascota", { p_id: avisoId, p_token: claim.data })
    return !confirmed.error && confirmed.data === true ? "enviado" : "pendiente"
  } catch {
    // Provider timeout/acceptance is uncertain; stable provider idempotency permits retry only inside the window.
    return "pendiente"
  }
}

/** A stale/expired event becomes human-visible reconciliation after the safe provider retry window. */
export async function procesarAvisosMascota(servicio: SupabaseClient, mascotaId: number): Promise<EstadoAvisoMascotaProceso> {
  try {
    const { data, error } = await servicio.from("avisos_estado_mascota").select("id,estado")
      .eq("mascota_id", mascotaId).neq("estado", "enviado").order("id", { ascending: true })
    if (error) return "pendiente"
    if (!data?.length) return "sin_pendientes"
    const outcomes = await Promise.all(data.map((row) => row.estado === "conciliacion"
      ? Promise.resolve("conciliacion" as const) : enviarAvisoMascotaPendiente(servicio, row.id)))
    if (outcomes.includes("conciliacion")) return "conciliacion"
    if (outcomes.includes("pendiente")) return "pendiente"
    return "enviado"
  } catch {
    return "pendiente"
  }
}
