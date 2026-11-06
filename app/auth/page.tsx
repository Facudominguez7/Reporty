"use client"

/**
 * Pantalla de autenticación con email/contraseña y proveedores OAuth soportados.
 */

import type React from "react"

import { useActionState, useCallback, useEffect, useRef, useState } from "react"
import { useFormStatus } from "react-dom"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Eye, EyeOff, Lock, Mail, Phone, User } from "lucide-react"
import { toast } from "sonner"

import { iniciarSesionOAuth, login, signup, type AuthFormState } from "./actions"
import { obtenerRutaInternaSegura, RUTA_RECUPERAR_CONTRASENA } from "./rutas-seguras"
import {
  ETIQUETAS_PESTANA,
  PESTANAS_AUTH,
  VERIFICACION_INICIAL,
  abrirSesionInvitada,
  entregarTokenAlFormulario,
  envioDeLaPestana,
  liberarVerificacion,
  normalizarPestana,
  ofrecerToken,
  reclamarVerificacion,
  type EstadoVerificacion,
  type OperacionVerificada,
  type PestanaAuth,
  type ReclamacionVerificacion,
} from "./verificacion-compartida"
import { createClient } from "@/utils/supabase/client"
import {
  MENSAJE_CAPTCHA_NO_DISPONIBLE,
  TURNSTILE_CONFIGURADO,
  TURNSTILE_NO_DISPONIBLE,
  TurnstileWidget,
  valoresTrasIntentoFallido,
} from "@/components/turnstile-widget"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

/** Passwords the signup form holds once it has nothing left to protect. */
const CONTRASENAS_VACIAS = { password: "", confirmPassword: "" }

/**
 * Renderiza la experiencia principal de ingreso y registro de usuarios.
 *
 * @returns UI cliente para autenticación con formularios tradicionales y OAuth.
 */
export default function AuthPage() {
  const searchParams = useSearchParams()
  const supabase = createClient()
  const [checkingSession, setCheckingSession] = useState(true)
  // Una sola verificación atiende al ingreso, al registro y al acceso como invitado.
  const [verificacion, setVerificacion] = useState<EstadoVerificacion>(VERIFICACION_INICIAL)
  // El ref es la fuente de verdad del reclamo: se actualiza antes de cualquier re-render.
  const verificacionRef = useRef<EstadoVerificacion>(VERIFICACION_INICIAL)
  const [guestError, setGuestError] = useState<string | null>(null)
  // Pestaña activa: define qué envío acompaña a la verificación compartida.
  const [pestana, setPestana] = useState<PestanaAuth>("ingreso")
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [loginEmail, setLoginEmail] = useState("")
  const [signupFields, setSignupFields] = useState({ name: "", lastname: "", email: "", phone: "" })
  const [signupPassword, setSignupPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const passwordsMatch = signupPassword === confirmPassword
  const initialState: AuthFormState = { error: undefined, message: undefined }
  const [loginState, loginAction, loginPending] = useActionState(login, initialState)
  const [signupState, signupAction, signupPending] = useActionState(signup, initialState)
  const nextPath = obtenerRutaInternaSegura(searchParams.get("next"))
  const oauthError = searchParams.get("error") === "oauth"
  const enlaceError = searchParams.get("error") === "enlace"
  const needsCaptcha = TURNSTILE_CONFIGURADO
  // Production without a site key cannot challenge anybody: the forms fail closed instead
  // of submitting an unprotected request that the provider may accept.
  const captchaNoDisponible = TURNSTILE_NO_DISPONIBLE
  const lastLoginState = useRef(loginState)
  const lastSignupState = useRef(signupState)

  /**
   * Aplica el estado siguiente de la verificación de forma síncrona.
   *
   * @param siguiente - Estado que reemplaza al actual.
   */
  const aplicarVerificacion = useCallback((siguiente: EstadoVerificacion) => {
    if (siguiente === verificacionRef.current) return
    verificacionRef.current = siguiente
    setVerificacion(siguiente)
  }, [])

  /**
   * Reclama la verificación compartida para una operación.
   *
   * El reclamo se resuelve contra el ref, así que dos envíos en el mismo instante no pueden
   * quedarse con el mismo token: el segundo no encuentra la verificación libre.
   *
   * @param operacion - Acción que va a consumir el token.
   * @returns Reclamo con el token a enviar, o `null` si la operación no puede enviarse.
   */
  const reclamar = useCallback(
    (operacion: OperacionVerificada): ReclamacionVerificacion | null => {
      const reclamacion = reclamarVerificacion(verificacionRef.current, operacion, needsCaptcha)
      if (!reclamacion) return null
      aplicarVerificacion(reclamacion.estado)
      return reclamacion
    },
    [aplicarVerificacion, needsCaptcha],
  )

  /**
   * Libera la verificación cuando la operación que la tomó terminó.
   *
   * @param operacion - Acción que dejó de estar en curso.
   */
  const liberar = useCallback(
    (operacion: OperacionVerificada) => {
      aplicarVerificacion(liberarVerificacion(verificacionRef.current, operacion))
    },
    [aplicarVerificacion],
  )

  /**
   * Registra el token que entregó el desafío compartido.
   *
   * @param token - Token emitido, o `null` cuando expiró o falló el desafío.
   */
  const recibirToken = useCallback(
    (token: string | null) => {
      aplicarVerificacion(ofrecerToken(verificacionRef.current, token))
    },
    [aplicarVerificacion],
  )

  /**
   * Construye el manejador de envío de un formulario protegido.
   *
   * El reclamo es síncrono: un segundo envío en el mismo instante no encuentra la
   * verificación libre y se cancela antes de que React llame a la acción del servidor.
   *
   * @param operacion - Acción que consume la verificación.
   * @returns Manejador de `onSubmit` para ese formulario.
   */
  const enviarFormulario =
    (operacion: OperacionVerificada) => (evento: React.FormEvent<HTMLFormElement>) => {
      const reclamacion = reclamar(operacion)
      if (!reclamacion) {
        evento.preventDefault()
        return
      }
      entregarTokenAlFormulario(evento.currentTarget, reclamacion.token)
    }

  useEffect(() => {
    // The effect also runs while the passwords are edited: only a new attempt is announced.
    if (signupState === lastSignupState.current) return
    lastSignupState.current = signupState
    if (signupState?.error) toast.error(signupState.error)
    if (signupState?.message) toast.success(signupState.message)
    // El token ya se descartó al reclamarlo, antes de enviarlo: el formulario conserva lo
    // tipeado y el desafío nuevo llega por su propio reinicio.
    // Keep what was typed after any failure (a rejected CAPTCHA included); only a created
    // account clears the passwords.
    const contrasenas = valoresTrasIntentoFallido(
      signupState,
      { password: signupPassword, confirmPassword },
      CONTRASENAS_VACIAS,
    )
    setSignupPassword(contrasenas.password)
    setConfirmPassword(contrasenas.confirmPassword)
  }, [confirmPassword, signupPassword, signupState])

  useEffect(() => {
    if (loginState?.error) toast.error(loginState.error)
    if (loginState === lastLoginState.current) return
    lastLoginState.current = loginState
  }, [loginState])

  // La acción del servidor terminó y la verificación vuelve a estar libre. Se libera con el
  // pendiente en `false`, nunca con un token gastado: el token se descartó al reclamarlo,
  // antes de que el pedido saliera.
  useEffect(() => {
    if (!loginPending) liberar("ingreso")
  }, [liberar, loginPending])

  useEffect(() => {
    if (!signupPending) liberar("registro")
  }, [liberar, signupPending])

  useEffect(() => {
    let cancelled = false
    createClient().auth.getUser().then(({ data, error }) => {
      if (cancelled) return
      if (!error && data.user) {
        window.location.replace(nextPath)
        return
      }
      setCheckingSession(false)
    }).catch(() => {
      if (!cancelled) setCheckingSession(false)
    })
    return () => { cancelled = true }
  }, [nextPath])

  /**
   * Abre la sesión anónima con la verificación compartida.
   *
   * @returns Promesa que resuelve cuando la sesión se abrió o el error quedó visible.
   */
  const continueAsGuest = async () => {
    if (captchaNoDisponible) {
      setGuestError(MENSAJE_CAPTCHA_NO_DISPONIBLE)
      return
    }

    setGuestError(null)
    const abierta = await abrirSesionInvitada({
      reclamar,
      liberar,
      abrirSesion: (token) =>
        supabase.auth.signInAnonymously(token ? { options: { captchaToken: token } } : undefined),
      alFallar: setGuestError,
    })

    if (abierta) window.location.assign(nextPath)
  }

  if (checkingSession) {
    return <div className="auth-shell px-4 py-6 text-center text-sm text-muted-foreground">Comprobando tu sesión…</div>
  }

  return (
    <div className="auth-shell px-4 py-6">
      <div className="mx-auto w-full max-w-md">
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-xl">Tu cuenta Reporty</CardTitle>
            <CardDescription>Ingresá o registrate para comentar, votar y sumar puntos. Para reportar también podés continuar como invitado.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {captchaNoDisponible && (
              <Alert variant="destructive">
                <AlertTitle>Verificación de seguridad no disponible</AlertTitle>
                <AlertDescription>{MENSAJE_CAPTCHA_NO_DISPONIBLE}</AlertDescription>
              </Alert>
            )}
            {oauthError && (
              <Alert variant="destructive">
                <AlertTitle>No se pudo iniciar sesión</AlertTitle>
                <AlertDescription>Intentá nuevamente con Google.</AlertDescription>
              </Alert>
            )}
            {enlaceError && (
              <Alert variant="destructive">
                <AlertTitle>El enlace no es válido</AlertTitle>
                <AlertDescription>Venció o ya se usó. Iniciá sesión o pedí un correo nuevo.</AlertDescription>
              </Alert>
            )}

            <div className="space-y-3">
              <form action={iniciarSesionOAuth}>
                <input type="hidden" name="provider" value="google" />
                <input type="hidden" name="next" value={nextPath} />
                <BotonOAuth proveedor="Google" />
              </form>
            </div>

            <div className="flex items-center gap-3 text-xs uppercase tracking-[0.2em] text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              o continuá con email
              <span className="h-px flex-1 bg-border" />
            </div>

            <Tabs
              value={pestana}
              onValueChange={(valor) => setPestana(normalizarPestana(valor))}
              className="w-full"
            >
              <PestanasAuth />

              <TabsContent value="ingreso" className="space-y-5 pt-2">
                {loginState?.error && (
                  <Alert variant="destructive">
                    <AlertTitle>Error al iniciar sesión</AlertTitle>
                    <AlertDescription>{loginState.error}</AlertDescription>
                  </Alert>
                )}

                <form
                  id="formulario-ingreso"
                  action={loginAction}
                  className="space-y-4"
                  onSubmit={enviarFormulario("ingreso")}
                >
                  <input type="hidden" name="next" value={nextPath} />
                  {/* Consumed by Supabase as `captchaToken`; empty until the challenge passes. */}
                  <input type="hidden" name="captcha_token" value={verificacion.token ?? ""} />
                  <Field label="Correo electrónico" htmlFor="login-email">
                    <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="login-email"
                        name="email"
                        type="email"
                        placeholder="tu@email.com"
                        className="pl-10"
                        autoComplete="email"
                        value={loginEmail}
                        onChange={(event) => setLoginEmail(event.target.value)}
                        required
                      />
                  </Field>

                  <Field label="Contraseña" htmlFor="login-password">
                    <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="login-password"
                        name="password"
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••"
                        className="pl-10 pr-10"
                        autoComplete="current-password"
                        required
                      />
                    <Button
                      type="button"
                      variant="muted"
                      size="icon-sm"
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                      className="absolute right-1 top-1/2 -translate-y-1/2"
                    >
                      {showPassword ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
                    </Button>
                  </Field>

                  <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground">
                    <Link href={RUTA_RECUPERAR_CONTRASENA} className="text-primary hover:underline">
                      ¿Olvidaste tu contraseña?
                    </Link>
                  </div>
                </form>

              </TabsContent>

              <TabsContent value="registro" className="space-y-5 pt-2">
                {signupState?.error && (
                  <Alert variant="destructive">
                    <AlertTitle>No se pudo crear la cuenta</AlertTitle>
                    <AlertDescription>{signupState.error}</AlertDescription>
                  </Alert>
                )}

                <form
                  id="formulario-registro"
                  action={signupAction}
                  className="space-y-4"
                  onSubmit={enviarFormulario("registro")}
                >
                  <input type="hidden" name="next" value={nextPath} />
                  {/* Consumed by Supabase as `captchaToken`; empty until the challenge passes. */}
                  <input type="hidden" name="captcha_token" value={verificacion.token ?? ""} />
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Nombre" htmlFor="register-name">
                      <User className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          id="register-name"
                          name="name"
                          type="text"
                          placeholder="Juan"
                          className="pl-10"
                          autoComplete="given-name"
                          value={signupFields.name}
                          onChange={(event) => setSignupFields({ ...signupFields, name: event.target.value })}
                          required
                        />
                    </Field>

                    <Field label="Apellido" htmlFor="register-lastname">
                        <Input
                          id="register-lastname"
                          name="lastname"
                          type="text"
                          placeholder="Pérez"
                          className=""
                          autoComplete="family-name"
                          value={signupFields.lastname}
                          onChange={(event) => setSignupFields({ ...signupFields, lastname: event.target.value })}
                          required
                        />
                    </Field>
                  </div>

                  <Field label="Correo electrónico" htmlFor="register-email">
                    <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="register-email"
                        name="email"
                        type="email"
                        placeholder="tu@email.com"
                        className="pl-10"
                        autoComplete="email"
                        value={signupFields.email}
                        onChange={(event) => setSignupFields({ ...signupFields, email: event.target.value })}
                        required
                      />
                  </Field>

                  <Field label="Teléfono (opcional)" htmlFor="register-phone">
                    <Phone className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="register-phone"
                        name="phone"
                        type="tel"
                        placeholder="+54 376 123-4567"
                        className="pl-10"
                        autoComplete="tel"
                        value={signupFields.phone}
                        onChange={(event) => setSignupFields({ ...signupFields, phone: event.target.value })}
                      />
                  </Field>

                  <Field label="Contraseña" htmlFor="register-password">
                    <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="register-password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      className="pl-10 pr-10"
                      autoComplete="new-password"
                      value={signupPassword}
                      onChange={(event) => setSignupPassword(event.target.value)}
                      required
                    />
                    <Button
                      type="button"
                      variant="muted"
                      size="icon-sm"
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                      className="absolute right-1 top-1/2 -translate-y-1/2"
                    >
                      {showPassword ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
                    </Button>
                  </Field>

                  <Field label="Confirmar contraseña" htmlFor="register-confirm-password">
                    <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="register-confirm-password"
                      name="confirm_password"
                      type={showConfirmPassword ? "text" : "password"}
                      placeholder="••••••••"
                      className="pl-10 pr-10"
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      aria-invalid={confirmPassword.length > 0 && !passwordsMatch}
                      aria-describedby="register-password-match"
                      required
                    />
                    <Button
                      type="button"
                      variant="muted"
                      size="icon-sm"
                      onClick={() => setShowConfirmPassword((prev) => !prev)}
                      aria-label={
                        showConfirmPassword
                          ? "Ocultar confirmación de contraseña"
                          : "Mostrar confirmación de contraseña"
                      }
                      className="absolute right-1 top-1/2 -translate-y-1/2"
                    >
                      {showConfirmPassword ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
                    </Button>
                  </Field>

                  {confirmPassword.length > 0 && !passwordsMatch && (
                    <p id="register-password-match" className="text-sm text-destructive" role="status">
                      Las contraseñas no coinciden.
                    </p>
                  )}

                  <label className="flex items-start gap-2 rounded-md border border-border bg-background p-4 text-sm text-muted-foreground">
                    <input type="checkbox" className="mt-0.5 size-4 rounded border-border" required />
                    <span>
                      {/* A new tab keeps what was already typed in the form. */}
                      Acepto los <Link href="/terminos" target="_blank" className="text-primary hover:underline">términos y condiciones</Link> y la{" "}
                      <Link href="/privacidad" target="_blank" className="text-primary hover:underline">política de privacidad</Link>.
                    </span>
                  </label>

                  {signupState?.message && (
                    <Alert>
                      <AlertTitle>Verificá tu correo</AlertTitle>
                      <AlertDescription>{signupState.message}</AlertDescription>
                    </Alert>
                  )}
                </form>
              </TabsContent>

              <TabsContent value="invitado" className="space-y-5 pt-2">
                <p className="text-sm leading-6 text-muted-foreground">
                  Podés crear y seguir reportes, pero no comentar ni votar.
                </p>
                {guestError && (
                  <Alert variant="destructive">
                    <AlertDescription>{guestError}</AlertDescription>
                  </Alert>
                )}
              </TabsContent>

              {/* Una sola verificación para las tres acciones: ingreso, registro e invitado.
                  Vive fuera de los paneles para que cambiar de pestaña no desmonte el desafío
                  ni descarte su token, y el envío de la pestaña activa queda justo debajo. */}
              <GrupoVerificacionYEnvio
                pestana={pestana}
                verificacion={verificacion}
                needsCaptcha={needsCaptcha}
                captchaNoDisponible={captchaNoDisponible}
                loginPending={loginPending}
                signupPending={signupPending}
                passwordsMatch={passwordsMatch}
                onToken={recibirToken}
                onContinuarComoInvitado={continueAsGuest}
              />
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

/**
 * Lista de pestañas de la tarjeta: ingreso, registro e invitado.
 *
 * Las tres opciones están siempre a la vista, así el acceso como invitado no obliga a buscar
 * una sección al final de la tarjeta. El ancho se reparte en tres columnas y el texto reduce su
 * relleno en pantallas angostas para que ninguna etiqueta desborde.
 *
 * @returns Lista de pestañas con sus valores y etiquetas del sistema.
 */
function PestanasAuth() {
  return (
    <TabsList className="grid w-full grid-cols-3">
      {PESTANAS_AUTH.map((valor) => (
        <TabsTrigger key={valor} value={valor} className="px-2 sm:px-3">
          {ETIQUETAS_PESTANA[valor]}
        </TabsTrigger>
      ))}
    </TabsList>
  )
}

/**
 * Superficie que reúne el desafío de seguridad con el envío de la pestaña activa.
 *
 * El grupo vive fuera de los paneles de pestañas: cambiar entre Ingresar, Registrarme e
 * Invitado no desmonta el desafío ni descarta el token vigente. El botón de envío permanece
 * dentro del grupo y sigue referenciando su formulario con `form`, así el pedido usa el
 * `FormData` real del formulario aunque el botón viva fuera de él.
 *
 * @param props.pestana - Pestaña activa: define qué envío acompaña al desafío.
 * @param props.verificacion - Estado de la verificación compartida.
 * @param props.needsCaptcha - Indica si la pantalla exige resolver el desafío.
 * @param props.captchaNoDisponible - Indica que producción se quedó sin site key.
 * @param props.loginPending - Acción de ingreso en curso.
 * @param props.signupPending - Acción de registro en curso.
 * @param props.passwordsMatch - Indica si el registro puede enviarse.
 * @param props.onToken - Recibe el token del desafío o `null` cuando se invalida.
 * @param props.onContinuarComoInvitado - Abre la sesión anónima.
 * @returns Grupo con el desafío arriba del envío de la pestaña activa.
 */
function GrupoVerificacionYEnvio({
  pestana,
  verificacion,
  needsCaptcha,
  captchaNoDisponible,
  loginPending,
  signupPending,
  passwordsMatch,
  onToken,
  onContinuarComoInvitado,
}: {
  pestana: PestanaAuth
  verificacion: EstadoVerificacion
  needsCaptcha: boolean
  captchaNoDisponible: boolean
  loginPending: boolean
  signupPending: boolean
  passwordsMatch: boolean
  onToken: (token: string | null) => void
  onContinuarComoInvitado: () => void
}) {
  // El envío de la pestaña activa y su bloqueo los decide el módulo de la verificación.
  const envio = envioDeLaPestana({
    pestana,
    verificacion,
    exigeDesafio: needsCaptcha,
    captchaNoDisponible,
    ingresoPendiente: loginPending,
    registroPendiente: signupPending,
    contrasenasCoinciden: passwordsMatch,
  })

  return (
    <div
      role="group"
      aria-label="Verificación de seguridad y envío"
      className="space-y-3"
    >
      {needsCaptcha && <TurnstileWidget onTokenChange={onToken} resetSignal={verificacion.desafios} />}

      {envio.operacion === "ingreso" && (
        <SubmitButton
          form="formulario-ingreso"
          label={envio.etiqueta}
          pendingLabel={envio.etiquetaPendiente}
          pending={envio.pendiente}
          disabled={envio.bloqueado}
        />
      )}

      {envio.operacion === "registro" && (
        <SubmitButton
          form="formulario-registro"
          label={envio.etiqueta}
          pendingLabel={envio.etiquetaPendiente}
          pending={envio.pendiente}
          disabled={envio.bloqueado}
        />
      )}

      {envio.operacion === "invitado" && (
        <Button type="button" className="w-full" onClick={onContinuarComoInvitado} disabled={envio.bloqueado}>
          {envio.pendiente ? envio.etiquetaPendiente : envio.etiqueta}
        </Button>
      )}
    </div>
  )
}

/**
 * Agrupa una etiqueta accesible con su control de formulario.
 *
 * @param props - Propiedades con texto de etiqueta, id del control y contenido.
 * @returns Campo de formulario con estructura visual consistente.
 */
function Field({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      <div className="relative">{children}</div>
    </div>
  )
}

/**
 * Botón de envío de un formulario protegido por la verificación compartida.
 *
 * Vive fuera del formulario para que el desafío de Cloudflare quede justo arriba de él, así
 * que lo referencia con `form` y recibe el estado pendiente de la acción en lugar de leerlo
 * con `useFormStatus`.
 *
 * @param props.form - Id del formulario que envía.
 * @param props.label - Texto del botón en reposo.
 * @param props.pendingLabel - Texto mientras la acción está en curso.
 * @param props.pending - Indica si la acción de ese formulario está en curso.
 * @param props.disabled - Indica si el envío todavía no es válido.
 * @returns Botón de envío deshabilitado durante el envío o mientras falta una verificación.
 */
function SubmitButton({
  form,
  label,
  pendingLabel,
  pending = false,
  disabled = false,
}: {
  form: string
  label: string
  pendingLabel: string
  pending?: boolean
  disabled?: boolean
}) {
  return (
    <Button type="submit" form={form} className="w-full" disabled={pending || disabled}>
      {pending ? pendingLabel : label}
    </Button>
  )
}

/**
 * Botón accesible para iniciar sesión con un proveedor OAuth soportado.
 *
 * @param props - Proveedor mostrado al usuario.
 * @returns Botón de formulario con estado pendiente y etiqueta explícita.
 */
function BotonOAuth({ proveedor }: { proveedor: "Google" }) {
  const { pending } = useFormStatus()

  return (
    <Button
      type="submit"
      variant="outline"
      className="w-full"
      disabled={pending}
      aria-label={`Continuar con ${proveedor}`}
    >
      {pending ? (
        "Redirigiendo..."
      ) : (
        <span className="inline-flex items-center gap-2">
          <svg
            aria-hidden="true"
            focusable="false"
            className="h-5 w-5 shrink-0"
            viewBox="0 0 24 24"
          >
            <path
              fill="#4285F4"
              d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.63h6.46a5.52 5.52 0 0 1-2.39 3.62v3h3.87c2.26-2.08 3.58-5.16 3.58-8.8Z"
            />
            <path
              fill="#34A853"
              d="M12 24c3.24 0 5.95-1.07 7.94-2.93l-3.87-3c-1.07.72-2.44 1.14-4.07 1.14-3.13 0-5.78-2.11-6.72-4.96h-4v3.09A12 12 0 0 0 12 24Z"
            />
            <path
              fill="#FBBC05"
              d="M5.28 14.25A7.21 7.21 0 0 1 4.9 12c0-.78.14-1.54.38-2.25V6.66h-4A12 12 0 0 0 0 12c0 1.93.46 3.75 1.28 5.34l4-3.09Z"
            />
            <path
              fill="#EA4335"
              d="M12 4.79c1.76 0 3.35.61 4.6 1.8l3.43-3.43A11.51 11.51 0 0 0 12 0 12 12 0 0 0 1.28 6.66l4 3.09C6.22 6.9 8.87 4.79 12 4.79Z"
            />
          </svg>
          <span>{`Continuar con ${proveedor}`}</span>
        </span>
      )}
    </Button>
  )
}
