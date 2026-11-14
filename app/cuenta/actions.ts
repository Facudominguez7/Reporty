"use server"

import { revalidatePath } from "next/cache"

import { getUserRoleContext, isAdminRole, isAnonymousUser } from "@/lib/authz/roles"
import { confirmaEliminacion, CONFIRMACION_ELIMINAR_CUENTA, ERROR_ADMIN_NO_ELIMINABLE } from "@/lib/cuenta/eliminacion"
import { validarFormatoNombreUsuario } from "@/lib/cuenta/nombre-usuario"
import { moderateText } from "@/lib/moderation/texto-determinista.server"
import { eliminarCuentaWorkflow } from "@/lib/use-cases/cuenta/eliminar-cuenta"
import { createAdminClient } from "@/utils/supabase/admin"
import { createClient } from "@/utils/supabase/server"

/** Resultado que consume el diálogo de eliminación. */
export type ResultadoEliminarCuenta = { success: true } | { success: false; error: string }

/**
 * Elimina la cuenta del usuario de la sesión actual y todo su contenido.
 *
 * Valida la sesión con el cliente de servidor y ejecuta el borrado con el cliente de servicio
 * (patrón de mutación del proyecto). Solo borra la cuenta propia: el id sale de la sesión,
 * nunca del cliente. Los administradores quedan excluidos (también lo impide la RPC).
 *
 * @param confirmacion - Texto que escribió el usuario; tiene que ser «ELIMINAR».
 * @returns Éxito, o el error en español para mostrar en el diálogo.
 */
export async function eliminarCuentaAction(confirmacion: string): Promise<ResultadoEliminarCuenta> {
  if (typeof confirmacion !== "string" || !confirmaEliminacion(confirmacion)) {
    return { success: false, error: `Escribí ${CONFIRMACION_ELIMINAR_CUENTA} para confirmar.` }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: "Tenés que iniciar sesión para eliminar tu cuenta." }
  }

  const { data: contextoRol } = await getUserRoleContext(supabase, user.id)
  if (isAdminRole(contextoRol?.roleId)) {
    return { success: false, error: ERROR_ADMIN_NO_ELIMINABLE }
  }

  const resultado = await eliminarCuentaWorkflow(createAdminClient(), user.id)
  if (!resultado.success) {
    return { success: false, error: resultado.error }
  }

  // La identidad ya no existe: solo se borran las cookies de este navegador.
  try {
    await supabase.auth.signOut({ scope: "local" })
  } catch (error) {
    console.error("No pudimos limpiar la sesión tras eliminar la cuenta:", error)
  }
  revalidatePath("/", "layout")

  return { success: true }
}

/** Resultado que consume el formulario del nombre de usuario. */
export type ResultadoNombreUsuario = { success: true; nombre: string } | { success: false; error: string }

/** Código de Postgres para una violación de unicidad (`profiles_username_key`). */
const CODIGO_VALOR_DUPLICADO = "23505"

/**
 * Cambia el nombre de usuario público de la persona de la sesión actual.
 *
 * Valida la sesión con el cliente de servidor y escribe con el cliente de servicio (patrón de
 * mutación del proyecto): el id sale de la sesión, nunca del cliente. Los invitados no eligen
 * nombre. Antes de tocar la base controla formato, nombres reservados y lenguaje ofensivo; la
 * unicidad la garantiza la restricción `profiles_username_key`.
 *
 * @param valor - Nombre que escribió la persona.
 * @returns El nombre guardado (normalizado), o el error en español para mostrar en el formulario.
 */
export async function actualizarNombreUsuarioAction(valor: unknown): Promise<ResultadoNombreUsuario> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: "Tenés que iniciar sesión para cambiar tu nombre de usuario." }
  }
  if (isAnonymousUser(user)) {
    return { success: false, error: "Creá una cuenta para elegir tu nombre de usuario." }
  }

  const validacion = validarFormatoNombreUsuario(valor)
  if (!validacion.valido) {
    return { success: false, error: validacion.error }
  }
  // Se moderan también las partes separadas por guion bajo, como si fueran palabras.
  if (!moderateText(validacion.nombre.replaceAll("_", " ")).allowed) {
    return { success: false, error: "Ese nombre de usuario contiene lenguaje ofensivo. Elegí otro." }
  }

  const { error } = await createAdminClient()
    .from("profiles")
    .update({ username: validacion.nombre })
    .eq("id", user.id)

  if (error) {
    if (error.code === CODIGO_VALOR_DUPLICADO) {
      return { success: false, error: "Ese nombre de usuario ya está en uso. Elegí otro." }
    }
    console.error("No pudimos actualizar el nombre de usuario:", error)
    return { success: false, error: "No pudimos guardar tu nombre de usuario. Probá de nuevo." }
  }

  // El nombre aparece en reportes, comentarios y el ranking.
  revalidatePath("/", "layout")
  return { success: true, nombre: validacion.nombre }
}
