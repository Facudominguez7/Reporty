"use client"

import { useActionState, useEffect, useRef, useState } from "react"
import { useFormStatus } from "react-dom"
import { Mail } from "lucide-react"

import { solicitarRecuperacionContrasena, type AuthFormState } from "../actions"
import {
  MENSAJE_CAPTCHA_NO_DISPONIBLE,
  TURNSTILE_CONFIGURADO,
  TURNSTILE_NO_DISPONIBLE,
  TurnstileWidget,
} from "@/components/turnstile-widget"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const initialState: AuthFormState = { error: undefined, message: undefined }

/** Requests the password recovery email. */
export function RecoveryForm() {
  const [state, formAction] = useActionState(solicitarRecuperacionContrasena, initialState)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [captchaReset, setCaptchaReset] = useState(0)
  const lastState = useRef(state)
  const needsCaptcha = TURNSTILE_CONFIGURADO
  // Production without a site key fails closed instead of sending an unprotected request.
  const captchaNoDisponible = TURNSTILE_NO_DISPONIBLE

  useEffect(() => {
    // Supabase consumed the submitted token: keep the typed email and request a new one.
    if (state === lastState.current) return
    lastState.current = state
    setCaptchaToken(null)
    setCaptchaReset((signal) => signal + 1)
  }, [state])

  return (
    <form action={formAction} className="space-y-4">
      {captchaNoDisponible && (
        <Alert variant="destructive">
          <AlertTitle>Verificación de seguridad no disponible</AlertTitle>
          <AlertDescription>{MENSAJE_CAPTCHA_NO_DISPONIBLE}</AlertDescription>
        </Alert>
      )}
      {state?.message && (
        <Alert>
          <AlertTitle>Revisá tu correo</AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}
      {state?.error && (
        <Alert variant="destructive">
          <AlertTitle>No pudimos enviar el enlace</AlertTitle>
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <Label htmlFor="recovery-email">Correo electrónico</Label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            id="recovery-email"
            name="email"
            type="email"
            placeholder="tu@email.com"
            className="pl-10"
            autoComplete="email"
            required
          />
        </div>
      </div>

      {/* Consumed by Supabase as `captchaToken`; empty until the challenge passes. */}
      <input type="hidden" name="captcha_token" value={captchaToken ?? ""} />

      {needsCaptcha && <TurnstileWidget onTokenChange={setCaptchaToken} resetSignal={captchaReset} />}

      <SubmitButton disabled={captchaNoDisponible || (needsCaptcha && !captchaToken)} />
    </form>
  )
}

function SubmitButton({ disabled = false }: { disabled?: boolean }) {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" className="w-full" disabled={pending || disabled}>
      {pending ? "Enviando..." : "Enviarme el enlace"}
    </Button>
  )
}
