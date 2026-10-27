"use client"

/**
 * Pantalla de autenticación con email/contraseña y proveedores OAuth soportados.
 */

import type React from "react"

import { useActionState, useEffect, useState } from "react"
import { useFormStatus } from "react-dom"
import type { AuthError } from "@supabase/supabase-js"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Eye, EyeOff, Lock, Mail, Phone, User, UserRound } from "lucide-react"

import { iniciarSesionOAuth, login, signup, type AuthFormState } from "./actions"
import { obtenerRutaInternaSegura, RUTA_RECUPERAR_CONTRASENA } from "./rutas-seguras"
import { createClient } from "@/utils/supabase/client"
import { TURNSTILE_SITE_KEY, TurnstileWidget } from "@/components/turnstile-widget"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

function guestSessionErrorMessage(error: AuthError) {
  if (error.status === 429) return "Demasiados intentos desde tu conexión. Probá de nuevo en unos minutos."
  if (error.code === "anonymous_provider_disabled") return "No está disponible el acceso como invitado. Iniciá sesión para continuar."
  if (error.message.toLowerCase().includes("captcha")) return "Completá la verificación de seguridad e intentá nuevamente."
  return "No pudimos preparar tu sesión de invitado. Intentá nuevamente."
}

/**
 * Renderiza la experiencia principal de ingreso y registro de usuarios.
 *
 * @returns UI cliente para autenticación con formularios tradicionales y OAuth.
 */
export default function AuthPage() {
  const searchParams = useSearchParams()
  const supabase = createClient()
  const [checkingSession, setCheckingSession] = useState(true)
  const [guestCaptchaToken, setGuestCaptchaToken] = useState<string | null>(null)
  const [guestCaptchaReset, setGuestCaptchaReset] = useState(0)
  const [guestError, setGuestError] = useState<string | null>(null)
  const [guestPending, setGuestPending] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const initialState: AuthFormState = { error: undefined, message: undefined }
  const [loginState, loginAction] = useActionState(login, initialState)
  const [signupState, signupAction] = useActionState(signup, initialState)
  const nextPath = obtenerRutaInternaSegura(searchParams.get("next"))
  const oauthError = searchParams.get("error") === "oauth"
  const enlaceError = searchParams.get("error") === "enlace"
  const needsGuestCaptcha = TURNSTILE_SITE_KEY !== ""

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

  const continueAsGuest = async () => {
    if (guestPending || (needsGuestCaptcha && !guestCaptchaToken)) return

    setGuestPending(true)
    setGuestError(null)
    const { error } = await supabase.auth.signInAnonymously(
      guestCaptchaToken ? { options: { captchaToken: guestCaptchaToken } } : undefined,
    )

    if (error) {
      setGuestPending(false)
      setGuestCaptchaToken(null)
      setGuestCaptchaReset((signal) => signal + 1)
      setGuestError(guestSessionErrorMessage(error))
      return
    }

    window.location.assign(nextPath)
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

            <Tabs defaultValue="login" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">Ingresar</TabsTrigger>
                <TabsTrigger value="register">Registrarme</TabsTrigger>
              </TabsList>

              <TabsContent value="login" className="space-y-5 pt-2">
                {loginState?.error && (
                  <Alert variant="destructive">
                    <AlertTitle>Error al iniciar sesión</AlertTitle>
                    <AlertDescription>{loginState.error}</AlertDescription>
                  </Alert>
                )}

                <form action={loginAction} className="space-y-4">
                  <input type="hidden" name="next" value={nextPath} />
                  <Field label="Correo electrónico" htmlFor="login-email">
                    <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="login-email"
                        name="email"
                        type="email"
                        placeholder="tu@email.com"
                        className="pl-10"
                        autoComplete="email"
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

                  <SubmitButton label="Ingresar" pendingLabel="Ingresando..." />
                </form>

              </TabsContent>

              <TabsContent value="register" className="space-y-5 pt-2">
                {signupState?.message && (
                  <Alert>
                    <AlertTitle>Verificá tu correo</AlertTitle>
                    <AlertDescription>{signupState.message}</AlertDescription>
                  </Alert>
                )}
                {signupState?.error && (
                  <Alert variant="destructive">
                    <AlertTitle>No se pudo crear la cuenta</AlertTitle>
                    <AlertDescription>{signupState.error}</AlertDescription>
                  </Alert>
                )}

                <form action={signupAction} className="space-y-4">
                  <input type="hidden" name="next" value={nextPath} />
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

                  <label className="flex items-start gap-2 rounded-md border border-border bg-background p-4 text-sm text-muted-foreground">
                    <input type="checkbox" className="mt-0.5 size-4 rounded border-border" required />
                    <span>
                      {/* A new tab keeps what was already typed in the form. */}
                      Acepto los <Link href="/terminos" target="_blank" className="text-primary hover:underline">términos y condiciones</Link> y la{" "}
                      <Link href="/privacidad" target="_blank" className="text-primary hover:underline">política de privacidad</Link>.
                    </span>
                  </label>

                  <Button type="submit" className="w-full">
                    Crear cuenta
                  </Button>
                </form>
              </TabsContent>
            </Tabs>

            <div className="space-y-3 border-t border-border pt-5">
              <div className="space-y-1 text-center">
                <p className="text-sm font-medium">¿Querés continuar como invitado?</p>
                <p className="text-xs text-muted-foreground">Podés crear y seguir reportes, pero no comentar ni votar.</p>
              </div>
              {needsGuestCaptcha && <TurnstileWidget onTokenChange={setGuestCaptchaToken} resetSignal={guestCaptchaReset} />}
              {guestError && <Alert variant="destructive"><AlertDescription>{guestError}</AlertDescription></Alert>}
              <Button type="button" variant="outline" className="w-full" onClick={continueAsGuest} disabled={guestPending || (needsGuestCaptcha && !guestCaptchaToken)}>
                <UserRound className="size-4" aria-hidden="true" />
                {guestPending ? "Preparando sesión..." : "Continuar como invitado"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
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
 * Botón de envío que refleja el estado pendiente del formulario actual.
 *
 * @param props - Textos a mostrar según el estado de envío.
 * @returns Botón deshabilitado durante el envío del formulario.
 */
function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" className="w-full" disabled={pending}>
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
