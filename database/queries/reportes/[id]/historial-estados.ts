import { SupabaseClient } from "@supabase/supabase-js";

import { getPublicProfilesByIds, indexPublicProfilesById } from "@/database/queries/profiles";

/**
 * Registra en la tabla `historial_estados` un nuevo registro que representa el cambio de estado de un reporte.
 *
 * @param reporteId - Identificador numérico del reporte cuyo estado cambia
 * @param estadoAnteriorId - Identificador del estado anterior o `null` si no aplica
 * @param estadoNuevoId - Identificador del nuevo estado
 * @param usuarioId - Identificador del usuario que realiza el cambio, opcional
 * @param comentario - Comentario asociado al cambio, opcional
 * @returns Un objeto con `success: true` si la inserción se realizó correctamente, `success: false` y `error` con el detalle en caso de fallo
 */
export async function registrarCambioEstado(
  supabase: SupabaseClient,
  reporteId: number,
  estadoAnteriorId: number | null,
  estadoNuevoId: number,
  usuarioId?: string,
  comentario?: string
) {
  const { error } = await supabase.from("historial_estados").insert({
    reporte_id: reporteId,
    estado_anterior_id: estadoAnteriorId,
    estado_nuevo_id: estadoNuevoId,
    usuario_id: usuarioId || null,
    comentario: comentario || null,
  });

  if (error) {
    console.error("Error al registrar cambio de estado:", error);
    return { success: false, error };
  }

  return { success: true, error: null };
}

/**
 * Obtiene el historial de estados asociados a un reporte.
 *
 * @param reporteId - Identificador del reporte en formato string
 * @returns Un objeto con `data`: array de registros del historial (cada registro incluye relación con estado anterior, estado nuevo y usuario) y `error`: el error ocurrido o `null` si la consulta fue exitosa
 */
export async function getHistorialEstados(
  supabase: SupabaseClient,
  reporteId: string
) {
  const { data, error } = await supabase
    .from("historial_estados")
    .select(`
      *,
      estado_anterior:estados!historial_estados_estado_anterior_id_fkey(id, nombre),
      estado_nuevo:estados!historial_estados_estado_nuevo_id_fkey(id, nombre)
    `)
    .eq("reporte_id", reporteId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error al obtener historial de estados:", error);
    return { data: [], error };
  }

  const { data: profiles } = await getPublicProfilesByIds(
    supabase,
    (data ?? []).map((entry) => entry.usuario_id ?? ""),
  );
  const profilesById = indexPublicProfilesById(profiles);

  return {
    data: (data || []).map((entry) => ({
      ...entry,
      usuario: entry.usuario_id
        ? { username: profilesById.get(entry.usuario_id)?.username ?? null }
        : null,
    })),
    error: null,
  };
}

/**
 * Número de reclamo cuando la Defensoría del Pueblo tomó el reporte (S9). Es de lectura
 * pública por RLS; sin reclamo devuelve null sin fallar.
 */
export async function getNumeroReclamoDefensoria(
  supabase: SupabaseClient,
  reporteId: number,
): Promise<string | null> {
  const { data } = await supabase
    .from("reclamos_defensoria")
    .select("numero_reclamo")
    .eq("reporte_id", reporteId)
    .maybeSingle();
  return data?.numero_reclamo ?? null;
}
