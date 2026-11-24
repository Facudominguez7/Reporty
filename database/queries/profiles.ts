import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

const PUBLIC_PROFILE_COLUMNS = "id, username, puntos, created_at, es_invitado";

export type PublicProfile = {
  id: string;
  username: string | null;
  puntos: number | null;
  created_at: string | null;
  es_invitado: boolean;
};

export type PrivateProfileContact = {
  id: string;
  username: string | null;
  email: string | null;
};

function dedupeUserIds(userIds: string[]) {
  return Array.from(new Set(userIds.filter(Boolean)));
}

/**
 * Lee el nombre de un perfil público traído como relación de PostgREST, que puede llegar como
 * objeto, como lista de uno o vacío.
 *
 * @param perfil - Valor de la relación `public_profiles(username)`.
 * @returns El nombre de usuario, o `null` si no hay perfil o no tiene nombre.
 */
export function nombreDePerfil(
  perfil: { username: string | null } | { username: string | null }[] | null | undefined,
): string | null {
  const unico = Array.isArray(perfil) ? perfil[0] : perfil;
  return unico?.username ?? null;
}

export function indexPublicProfilesById(profiles: PublicProfile[] | null | undefined) {
  return new Map((profiles ?? []).map((profile) => [profile.id, profile]));
}

export async function getPublicProfilesByIds(
  supabase: SupabaseClient,
  userIds: string[],
): Promise<{ data: PublicProfile[]; error: PostgrestError | null }> {
  const uniqueUserIds = dedupeUserIds(userIds);

  if (uniqueUserIds.length === 0) {
    return { data: [], error: null };
  }

  const { data, error } = await supabase
    .from("public_profiles")
    .select(PUBLIC_PROFILE_COLUMNS)
    .in("id", uniqueUserIds)
    .returns<PublicProfile[]>();

  if (error) {
    console.error("Error al obtener perfiles públicos:", error);
    return { data: [], error };
  }

  return { data: data ?? [], error: null };
}

export async function getPublicProfile(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ data: PublicProfile | null; error: PostgrestError | null }> {
  const { data, error } = await getPublicProfilesByIds(supabase, [userId]);

  if (error) {
    return { data: null, error };
  }

  return { data: data[0] ?? null, error: null };
}

export async function getPublicProfilesCount(
  supabase: SupabaseClient,
): Promise<{ count: number; error: PostgrestError | null }> {
  // Guests keep a profile so their reports resolve an author, but never count as community members.
  const { count, error } = await supabase
    .from("public_profiles")
    .select("id", { count: "exact", head: true })
    .eq("es_invitado", false);

  if (error) {
    console.error("Error al contar perfiles públicos:", error);
    return { count: 0, error };
  }

  return { count: count ?? 0, error: null };
}

export async function getTopPublicProfiles(
  supabase: SupabaseClient,
  limite: number,
): Promise<{ data: Pick<PublicProfile, "id" | "username" | "puntos">[]; error: PostgrestError | null }> {
  const { data, error } = await supabase
    .from("public_profiles")
    .select("id, username, puntos")
    .eq("es_invitado", false)
    .order("puntos", { ascending: false })
    .limit(limite)
    .returns<Array<Pick<PublicProfile, "id" | "username" | "puntos">>>();

  if (error) {
    console.error("Error al obtener ranking público de usuarios:", error);
    return { data: [], error };
  }

  return { data: data ?? [], error: null };
}

/**
 * Recupera el nombre de usuario asociado a un ID de usuario desde la tabla `profiles`.
 *
 * @param supabase - Cliente de Supabase configurado para realizar la consulta
 * @param userId - ID del usuario cuyo nombre de usuario se desea obtener
 * @returns Un objeto con `data` siendo el nombre de usuario o `"Usuario"` si no existe o ocurre un error, y `error` con el error ocurrido o `null` en caso de éxito
 */
export async function getUserUsername(
  supabase: SupabaseClient,
  userId: string
) {
  try {
    const { data, error } = await getPublicProfile(supabase, userId);

    if (error) {
      console.error("Error al obtener username:", error);
      return { data: "Usuario", error };
    }

    return { data: data?.username || "Usuario", error: null };
  } catch (error) {
    console.error("Error en getUserUsername:", error);
    return { data: "Usuario", error };
  }
}

/**
 * Obtiene el registro completo del perfil de un usuario.
 *
 * @param userId - ID del usuario cuyo perfil se desea recuperar
 * @returns `data` es el registro del perfil o `null` si ocurre un error; `error` contiene el error devuelto por Supabase o `null` en caso de éxito
 */
export async function getUserProfile(
  supabase: SupabaseClient,
  userId: string
) {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (error) {
      console.error("Error al obtener perfil:", error);
      return { data: null, error };
    }

    return { data, error: null };
  } catch (error) {
    console.error("Error en getUserProfile:", error);
    return { data: null, error };
  }
}

export async function getPrivateProfileContact(
  supabase: SupabaseClient,
  userId: string,
) {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, username, email")
      .eq("id", userId)
      .single()
      .returns<PrivateProfileContact>();

    if (error) {
      console.error("Error al obtener contacto privado del perfil:", error);
      return { data: null, error };
    }

    return { data, error: null };
  } catch (error) {
    console.error("Error en getPrivateProfileContact:", error);
    return { data: null, error };
  }
}
