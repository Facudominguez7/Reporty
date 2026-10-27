"use server"

/**
 * Acciones de servidor para iniciar, crear y cerrar sesiones de autenticación.
 */

import { revalidatePath } from "next/cache"
import { isAuthSessionMissingError, isAuthWeakPasswordError, type AuthError } from "@supabase/supabase-js"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { z } from "zod"

import { MIN_PASSWORD_LENGTH, PASSWORD_PENDING_METADATA_KEY } from "@/lib/authz/guest-account"
import { isAnonymousUser } from "@/lib/authz/roles"
import { createClient } from "@/utils/supabase/server"
import { obtenerOrigenAutenticacion, obtenerRutaInternaSegura, RUTA_NUEVA_CONTRASENA } from "./rutas-seguras"

export type AuthFormState = {
  error?: string
  message?: string
}

type ProveedorOAuth = "google"

const emailSchema = z.string().trim().toLowerCase().email().max(254)

/** Internal destination after a guest verifies the email linked to their account. */
const RUTA_CUENTA_VINCULADA = "/mis-reportes?cuenta=vinculada"
const RUTA_CUENTA_LISTA = "/mis-reportes?cuenta=lista"

/**
 * Builds the Supabase Auth redirect URL that lands on the PKCE callback route.
 *
 * @param next - Internal route to open once the session is exchanged.
 */
async function obtenerRedireccionCallback(next: string) {
  const cabeceras = await headers()
  const redirectTo = new URL("/auth/callback", obtenerOrigenAutenticacion(cabeceras))
  redirectTo.searchParams.set("next", next)
  return redirectTo.toString()
}

/**
 * Obtiene una ruta interna segura desde el formulario de autenticación.
 *
 * @param formData - FormData que puede incluir el campo `next`.
 * @returns Ruta interna validada para redirigir dentro de la aplicación.
 */
const obtenerSiguienteRutaSegura = (formData: FormData) => obtenerRutaInternaSegura(formData.get("next"))

/**
 * Translates a sign-in error into Spanish copy. Supabase messages are English and may be
 * technical, so they are never shown as is.
 */
function mensajeErrorLogin(error: AuthError) {
  if (error.code === "user_banned") {
    return "Tu usuario está bloqueado. Contactá a la administración para recuperar el acceso."
  }

  if (error.code === "invalid_credentials") {
    return "El correo o la contraseña no son correctos."
  }

  if (error.code === "email_not_confirmed") {
    return "Primero confirmá tu correo desde el enlace que te enviamos."
  }

  if (error.status === 429) {
    return "Hiciste demasiados intentos. Probá de nuevo en unos minutos."
  }

  console.error("No pudimos iniciar sesión:", { status: error.status, code: error.code, message: error.message })
  return "No pudimos iniciar sesión. Intentá nuevamente."
}

const TIPOS_DE_CARACTERES = [
  { muestra: "abcdefghijklmnopqrstuvwxyz", nombre: "minúsculas" },
  { muestra: "ABCDEFGHIJKLMNOPQRSTUVWXYZ", nombre: "mayúsculas" },
  { muestra: "0123456789", nombre: "números" },
  { muestra: "!@#$", nombre: "símbolos" },
]

/** Joins Spanish list items as "a, b y c". */
const unirLista = (items: string[]) =>
  items.length > 1 ? `${items.slice(0, -1).join(", ")} y ${items.at(-1)}` : items.join("")

/**
 * Explains why Supabase rejected a password. Its `reasons` say which rule failed, and the
 * English message carries the project settings (minimum length, required character types).
 */
function mensajeContrasenaDebil(error: AuthError) {
  const generico = "Elegí una contraseña más segura."

  if (!isAuthWeakPasswordError(error)) {
    return generico
  }

  const partes: string[] = []

  if (error.reasons.includes("length")) {
    const minimo = error.message.match(/at least (\d+) characters/)?.[1] ?? MIN_PASSWORD_LENGTH
    partes.push(`La contraseña debe tener al menos ${minimo} caracteres.`)
  }

  if (error.reasons.includes("characters")) {
    const tipos = TIPOS_DE_CARACTERES.filter(({ muestra }) => error.message.includes(muestra)).map(({ nombre }) => nombre)
    partes.push(tipos.length > 0 ? `La contraseña debe incluir ${unirLista(tipos)}.` : "Combiná letras, números y símbolos.")
  }

  if (error.reasons.includes("pwned")) {
    partes.push("Esa contraseña aparece en filtraciones conocidas. Elegí otra.")
  }

  // No reasons, or only ones this code does not know yet.
  return partes.join(" ") || generico
}

/** Translates a sign-up error into Spanish copy, logging the unexpected ones server-side. */
function mensajeErrorRegistro(error: AuthError) {
  if (error.code === "user_already_exists" || error.code === "email_exists") {
    return "Ya existe una cuenta con ese correo. Iniciá sesión o recuperá tu contraseña."
  }

  if (error.code === "weak_password") {
    return mensajeContrasenaDebil(error)
  }

  if (error.code === "email_address_invalid") {
    return "Ingresá un correo electrónico válido."
  }

  if (error.status === 429) {
    return "Enviamos demasiados correos. Probá de nuevo en unos minutos."
  }

  // Includes a failed confirmation email, such as a broken SMTP setup.
  console.error("No pudimos crear la cuenta:", { status: error.status, code: error.code, message: error.message })
  return "No pudimos crear tu cuenta. Intentá nuevamente."
}

/**
 * Valida que el proveedor OAuth enviado desde la UI esté permitido por la app.
 *
 * @param proveedor - Valor recibido desde el formulario OAuth.
 * @returns Proveedor OAuth soportado o `null` cuando el valor no es seguro.
 */
const obtenerProveedorOAuth = (proveedor: FormDataEntryValue | null): ProveedorOAuth | null => {
  if (proveedor === "google") {
    return proveedor
  }

  return null
}

/**
 * Inicia sesión con correo y contraseña conservando un destino interno seguro.
 *
 * @param _prevState - Estado anterior del formulario.
 * @param formData - FormData con `email`, `password` y opcionalmente `next`.
 * @returns Estado con error controlado o redirección al destino seguro.
 */
export async function login(_prevState: AuthFormState | void, formData: FormData): Promise<AuthFormState> {
  const supabase = await createClient()

  const data = {
    email: formData.get('email') as string,
    password: formData.get('password') as string,
  }

  const { error } = await supabase.auth.signInWithPassword(data)

  if (error) {
    return { error: mensajeErrorLogin(error) }
  }

  revalidatePath("/", "layout")
  redirect(obtenerSiguienteRutaSegura(formData))
  return {}
}

/**
 * Inicia el flujo OAuth de Supabase para Google desde el servidor.
 *
 * @param formData - FormData con `provider` y opcionalmente `next`.
 * @returns Redirección a Supabase o al formulario con error controlado.
 */
export async function iniciarSesionOAuth(formData: FormData): Promise<void> {
  const proveedor = obtenerProveedorOAuth(formData.get("provider"))
  const next = obtenerSiguienteRutaSegura(formData)

  if (!proveedor) {
    redirect(`/auth?error=oauth&next=${encodeURIComponent(next)}`)
  }

  const cabeceras = await headers()
  const redirectTo = new URL("/auth/callback", obtenerOrigenAutenticacion(cabeceras))
  redirectTo.searchParams.set("next", next)

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: proveedor,
    options: {
      redirectTo: redirectTo.toString(),
    },
  })

  if (error || !data.url) {
    redirect(`/auth?error=oauth&next=${encodeURIComponent(next)}`)
  }

  redirect(data.url)
}

/**
 * Registra un nuevo usuario usando los campos del formulario y gestiona la navegación tras el registro.
 *
 * @param _prevState - Estado anterior del formulario (no utilizado).
 * @param formData - FormData que debe contener los campos `name`, `lastname`, `email` y `password`.
 * @returns Un objeto `AuthFormState` que contiene:
 *  - `error`: mensaje de error si la creación de la cuenta falla,
 *  - `message`: instrucción para confirmar el correo si se requiere verificación,
 *  - o un objeto vacío en caso de que la sesión se cree y se redirija al inicio.
 * Además, si el registro crea una sesión activa, la función revalida la caché del layout raíz y redirige a `/`.
 */
export async function signup(_prevState: AuthFormState | void, formData: FormData): Promise<AuthFormState> {
  const supabase = await createClient()

  const name = formData.get('name') as string
  const lastname = formData.get('lastname') as string
  const phone = (formData.get('phone') as string | null)?.trim() ?? ''
  const password = formData.get('password') as string
  const confirmPassword = formData.get('confirm_password') as string
  const displayName = `${name} ${lastname}`.trim()

  if (password !== confirmPassword) {
    return { error: 'Las contraseñas no coinciden' }
  }

  const data = {
    email: formData.get('email') as string,
    password,
    options: {
      // Without it the confirmation link lands on the Site URL root and the session is never exchanged.
      emailRedirectTo: await obtenerRedireccionCallback(obtenerSiguienteRutaSegura(formData)),
      data: {
        display_name: displayName,
        name: name,
        lastname: lastname,
        phone: phone || undefined,
      }
    }
  }

  const { data: signUpData, error } = await supabase.auth.signUp(data)

  if (error) {
    return { error: mensajeErrorRegistro(error) }
  }

  if (!signUpData?.session) {
    return {
      message:
        'Te enviamos un correo de confirmación. Revisa tu bandeja de entrada y sigue el enlace para activar tu cuenta.',
    }
  }

  revalidatePath('/', 'layout')
  redirect(obtenerSiguienteRutaSegura(formData))
  return {}
}

/**
 * Resultado de `signout`. La acción no redirige ni arma textos: el cliente decide qué
 * mostrar y adónde navegar.
 * - `failed`: Supabase no pudo cerrar la sesión y el usuario sigue conectado.
 */
export type SignOutResult = { ok: true } | { ok: false; reason: 'failed' }

/**
 * Cierra la sesión en todos los dispositivos (el alcance por defecto de Supabase, explícito
 * acá porque la interfaz lo comunica) y refresca el layout autenticado.
 *
 * La acción solo se invoca después de que la interfaz confirma el cierre, incluso para
 * identidades anónimas que perderán acceso a sus reportes.
 */
export async function signout(): Promise<SignOutResult> {
  const supabase = await createClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  // Sin poder leer la sesión no se sabe si es de invitado, así que no se cierra. Un
  // AuthSessionMissingError solo indica que no hay sesión, y cerrarla no tiene riesgo.
  if (userError && !isAuthSessionMissingError(userError)) {
    return { ok: false, reason: 'failed' }
  }

  const { error } = await supabase.auth.signOut({ scope: 'global' })
  revalidatePath('/', 'layout')

  if (!error) {
    return { ok: true }
  }

  // Supabase pudo invalidar la sesión antes de fallar. Solo un AuthSessionMissingError prueba
  // que la sesión ya no existe; cualquier otro error (caída, timeout) deja el estado en duda y
  // la sesión puede seguir activa, así que se informa el fallo.
  const { error: sessionError } = await supabase.auth.getUser()

  return isAuthSessionMissingError(sessionError) ? { ok: true } : { ok: false, reason: 'failed' }
}

/**
 * Links an email to the current anonymous (guest) identity with `updateUser`, which
 * keeps the same `auth.users.id`, so every guest report stays attached. Supabase sends a
 * verification email; the account only becomes permanent (and the DB trigger promotes
 * the guest role to ciudadano) after the user opens that link.
 *
 * `signUp()` is intentionally not used: it would create a different identity.
 * If the email already belongs to an account nothing is merged or reassigned.
 *
 * @param _prevState - Previous form state.
 * @param formData - FormData with `email`.
 * @returns Form state with a confirmation message or a controlled error.
 */
export async function vincularCorreoInvitado(
  _prevState: AuthFormState | void,
  formData: FormData,
): Promise<AuthFormState> {
  const email = emailSchema.safeParse(formData.get("email"))

  if (!email.success) {
    return { error: "Ingresá un correo electrónico válido." }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "No encontramos tu sesión de invitado en este navegador." }
  }

  if (!isAnonymousUser(user)) {
    return { error: "Tu cuenta ya está guardada con un correo electrónico." }
  }

  const { error } = await supabase.auth.updateUser(
    { email: email.data, data: { [PASSWORD_PENDING_METADATA_KEY]: true } },
    { emailRedirectTo: await obtenerRedireccionCallback(RUTA_CUENTA_VINCULADA) },
  )

  if (error) {
    if (error.code === "email_exists" || error.code === "user_already_exists" || /already/i.test(error.message)) {
      return {
        error:
          "Ese correo ya pertenece a una cuenta de Reporty. Podés iniciar sesión con esa cuenta, pero los reportes hechos como invitado no se transfieren automáticamente.",
      }
    }

    if (error.status === 429) {
      return { error: "Enviamos demasiados correos. Probá de nuevo en unos minutos." }
    }

    return { error: "No pudimos enviar el correo de verificación. Intentá nuevamente." }
  }

  revalidatePath("/mis-reportes")
  return {
    message: `Te enviamos un enlace a ${email.data}. Abrilo desde este mismo navegador y después creá tu contraseña para terminar de guardar tu cuenta.`,
  }
}

/**
 * Sets the password of the signed-in permanent account. It serves two flows: a guest that
 * just verified its linked email (Supabase only lets anonymous users add a password after
 * the email is verified), and a recovery session opened from the reset-password email.
 * Once set, the account signs in with the regular email + password form on `/auth`.
 *
 * @param _prevState - Previous form state.
 * @param formData - FormData with `password` and `confirm_password`.
 * @returns A controlled error; on success it redirects to "Mis reportes" with a confirmation.
 */
export async function crearContrasenaCuenta(
  _prevState: AuthFormState | void,
  formData: FormData,
): Promise<AuthFormState> {
  const password = String(formData.get("password") ?? "")
  const confirmPassword = String(formData.get("confirm_password") ?? "")

  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.` }
  }

  if (password !== confirmPassword) {
    return { error: "Las contraseñas no coinciden" }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Tu sesión expiró. Pedí un enlace nuevo desde «¿Olvidaste tu contraseña?» para crear tu contraseña." }
  }

  if (isAnonymousUser(user) || !user.email) {
    return { error: "Primero confirmá tu correo desde el enlace que te enviamos." }
  }

  const { error } = await supabase.auth.updateUser({
    password,
    data: { [PASSWORD_PENDING_METADATA_KEY]: false },
  })

  if (error) {
    if (error.code === "weak_password") {
      return { error: mensajeContrasenaDebil(error) }
    }

    if (error.code === "reauthentication_needed") {
      return { error: "Por seguridad, pedí un enlace nuevo desde «¿Olvidaste tu contraseña?» y creá tu contraseña desde ahí." }
    }

    return { error: "No pudimos guardar tu contraseña. Intentá nuevamente." }
  }

  revalidatePath("/", "layout")
  // Redirect instead of returning a message: once the flag is cleared the password card
  // unmounts on revalidation, so the confirmation lives on the page itself.
  redirect(RUTA_CUENTA_LISTA)
}

/**
 * Sends a password recovery email. The link goes through `/auth/callback` (PKCE) to the
 * new-password page, so it must be opened in the same browser. It also unblocks accounts
 * that never had a password, such as converted guests whose session expired. The answer
 * is the same whether the account exists or not.
 *
 * @param _prevState - Previous form state.
 * @param formData - FormData with `email`.
 * @returns Form state with a neutral confirmation message or a controlled error.
 */
export async function solicitarRecuperacionContrasena(
  _prevState: AuthFormState | void,
  formData: FormData,
): Promise<AuthFormState> {
  const email = emailSchema.safeParse(formData.get("email"))

  if (!email.success) {
    return { error: "Ingresá un correo electrónico válido." }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.resetPasswordForEmail(email.data, {
    redirectTo: await obtenerRedireccionCallback(RUTA_NUEVA_CONTRASENA),
  })

  if (error?.status === 429) {
    return { error: "Enviamos demasiados correos. Probá de nuevo en unos minutos." }
  }

  if (error) {
    // The user still gets the neutral answer, so log it server-side (without the email)
    // to notice failures such as a broken SMTP setup.
    console.error("No pudimos enviar el correo de recuperación:", {
      status: error.status,
      code: error.code,
      message: error.message,
    })
  }

  return {
    message:
      "Si existe una cuenta con ese correo, te enviamos un enlace para crear una nueva contraseña. Abrilo desde este mismo navegador.",
  }
}
