import { SupabaseClient } from "@supabase/supabase-js";
import { sumarPuntos, PUNTOS } from "@/database/queries/puntos";
import { getPublicProfilesByIds, indexPublicProfilesById } from "@/database/queries/profiles";

export type Comentario = {
  id: number;
  reporte_id: number;
  usuario_id: string;
  contenido: string;
  tipo_aporte?: string | null;
  created_at: string;
  profiles:
    | {
        username: string;
      }
    | {
        username: string;
      }[];
};

function attachPublicProfilesToComments<T extends { usuario_id: string }>(
  comments: T[],
  profilesById: Map<string, { username: string | null }>,
) {
  return comments.map((comment) => ({
    ...comment,
    profiles: {
      username: profilesById.get(comment.usuario_id)?.username ?? "Usuario",
    },
  }));
}

/**
 * Recupera los comentarios no eliminados de un reporte, ordenados por fecha de creación ascendente.
 *
 * Cada comentario incluye `id`, `reporte_id`, `usuario_id`, `contenido`, `created_at` y `profiles.username`.
 *
 * @param reporteId - Identificador del reporte cuyos comentarios se desean obtener
 * @returns Objeto con `data`: arreglo de comentarios (vacío si no hay) y `error`: el error ocurrido o `null` si la operación fue exitosa
 */
export async function getComentariosReporte(
  supabase: SupabaseClient,
  reporteId: string
) {
  const { data, error } = await supabase
    .from("comentarios_reporte")
    .select(
      `
      id,
      reporte_id,
      usuario_id,
      contenido,
      tipo_aporte,
      created_at
    `
    )
    .eq("reporte_id", reporteId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Error al obtener comentarios:", error);
    return { data: [], error };
  }

  const { data: profiles } = await getPublicProfilesByIds(
    supabase,
    (data ?? []).map((comment) => comment.usuario_id),
  );
  const profilesById = indexPublicProfilesById(profiles);

  return {
    data: attachPublicProfilesToComments(data || [], profilesById),
    error: null,
  };
}

/**
 * Crea un comentario en un reporte y concede puntos al autor.
 *
 * @param reporteId - ID del reporte al que se asocia el comentario
 * @param usuarioId - ID del usuario que crea el comentario
 * @param contenido - Texto del comentario
 * @returns Objeto con `data`: el comentario insertado (campos `id`, `reporte_id`, `usuario_id`, `contenido`, `created_at` y `profiles.username`) o `null` si hubo un error; y `error`: el objeto de error o `null` si la operación fue exitosa
 */
export async function crearComentario(
  supabase: SupabaseClient,
  reporteId: number,
  usuarioId: string,
  contenido: string
) {
  const { data, error } = await supabase
    .from("comentarios_reporte")
    .insert({
      reporte_id: reporteId,
      usuario_id: usuarioId,
      contenido: contenido,
    })
    .select(
      `
      id,
      reporte_id,
      usuario_id,
      contenido,
      created_at
    `
    )
    .single();

  if (error) {
    console.error("Error al crear comentario:", error);
    return { data: null, error };
  }

  // Sumar puntos por comentar
  await sumarPuntos(
    supabase,
    usuarioId,
    PUNTOS.COMENTAR_REPORTE,
    "Comentar en reporte"
  );

  const { data: profiles } = await getPublicProfilesByIds(supabase, [usuarioId]);
  const profilesById = indexPublicProfilesById(profiles);

  return {
    data: {
      ...data,
      profiles: {
        username: profilesById.get(usuarioId)?.username ?? "Usuario",
      },
    },
    error: null,
  };
}

/**
 * Marca un comentario como eliminado estableciendo su `deleted_at` con la hora actual.
 *
 * Actualiza solo el comentario cuyo `id` coincide con `comentarioId` y cuyo `usuario_id`
 * coincide con `usuarioId`, de modo que solo el autor puede realizar la eliminación.
 *
 * @param comentarioId - Identificador del comentario a eliminar
 * @param usuarioId - Identificador del usuario que intenta eliminar el comentario
 * @returns Un objeto con `success: true` y `error: null` si la operación tuvo éxito; `success: false` y `error` en caso de fallo
 */
export async function eliminarComentario(
  supabase: SupabaseClient,
  comentarioId: number,
  usuarioId: string
) {
  const { error } = await supabase
    .from("comentarios_reporte")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", comentarioId)
    .eq("usuario_id", usuarioId); // Solo el autor puede eliminar

  if (error) {
    console.error("Error al eliminar comentario:", error);
    return { success: false, error };
  }

  return { success: true, error: null };
}
