"use client"

import { useEffect, useState, useTransition } from "react"
import { Bell } from "lucide-react"

import { obtenerEstadoPushAction } from "@/app/cuenta/push-actions"
import { MENSAJES_ACTIVACION_PUSH } from "@/components/cuenta/notificaciones-section"
import { Button } from "@/components/ui/button"
import { activarPushEnEsteDispositivo, leerSuscripcionPush, navegadorSoportaPush } from "@/lib/push/cliente"

/** Clave de `localStorage` que recuerda que la persona eligió «Ahora no» en este navegador. */
export const CLAVE_INVITACION_PUSH_DESCARTADA = "reporty:invitacion-push-descartada"

/**
 * Decide si conviene ofrecer las notificaciones en este momento.
 *
 * Solo se ofrecen si el servidor las tiene configuradas, el navegador las soporta, este
 * dispositivo todavía no está suscripto, el permiso no está bloqueado (pedirlo de nuevo no
 * muestra nada) y la persona no eligió «Ahora no» antes.
 *
 * @param condiciones - Estado del servidor, del navegador y de este dispositivo.
 * @returns `true` si hay que mostrar la invitación.
 */
export function debeOfrecerPush({
  disponible,
  soportado,
  suscripto,
  permiso,
  descartada,
}: {
  disponible: boolean
  soportado: boolean
  suscripto: boolean
  permiso: NotificationPermission | "desconocido"
  descartada: boolean
}): boolean {
  return disponible && soportado && !suscripto && permiso !== "denied" && !descartada
}

/**
 * Lee si la invitación se descartó en este navegador; sin almacenamiento disponible, no.
 *
 * @returns `true` si la persona eligió «Ahora no».
 */
function invitacionDescartada(): boolean {
  try {
    return window.localStorage.getItem(CLAVE_INVITACION_PUSH_DESCARTADA) === "1"
  } catch {
    return false
  }
}

/**
 * Invitación a activar las notificaciones, pensada para el momento en que tienen sentido:
 * justo después de crear un reporte. Nunca pide el permiso sola; lo pide el botón.
 *
 * @param props.pregunta - Texto de la pregunta, según el contexto.
 * @returns La invitación, o `null` si no corresponde ofrecerla.
 */
export function InvitacionPush({ pregunta }: { pregunta: string }) {
  const [clavePublica, setClavePublica] = useState<string | null>(null)
  const [resultado, setResultado] = useState<"activada" | "descartada" | string | null>(null)
  const [pendiente, startTransition] = useTransition()

  useEffect(() => {
    let vigente = true
    Promise.all([obtenerEstadoPushAction(), leerSuscripcionPush()])
      .then(([estado, suscripcion]) => {
        if (!vigente || !estado.disponible) return
        const ofrecer = debeOfrecerPush({
          disponible: estado.disponible,
          soportado: navegadorSoportaPush(),
          suscripto: Boolean(suscripcion),
          permiso: typeof Notification === "undefined" ? "desconocido" : Notification.permission,
          descartada: invitacionDescartada(),
        })
        if (ofrecer) setClavePublica(estado.clavePublica)
      })
      .catch(() => {})
    return () => {
      vigente = false
    }
  }, [])

  if (!clavePublica || resultado === "descartada") return null

  if (resultado === "activada") {
    return (
      <p role="status" className="rounded-xl border border-border/70 bg-muted/40 p-3 text-center text-sm">
        Listo: te vamos a avisar en este dispositivo.
      </p>
    )
  }

  /** Pide el permiso (desde el clic) y suscribe el dispositivo. */
  const activar = () => {
    startTransition(async () => {
      const respuesta = await activarPushEnEsteDispositivo(clavePublica)
      setResultado(respuesta === "activada" ? "activada" : MENSAJES_ACTIVACION_PUSH[respuesta])
    })
  }

  /** Recuerda la elección en este navegador y oculta la invitación. */
  const descartar = () => {
    try {
      window.localStorage.setItem(CLAVE_INVITACION_PUSH_DESCARTADA, "1")
    } catch {
      // Sin almacenamiento: solo se oculta por ahora.
    }
    setResultado("descartada")
  }

  return (
    <div className="rounded-xl border border-border/70 bg-muted/40 p-4 text-center">
      <p className="flex items-center justify-center gap-2 text-sm font-medium">
        <Bell className="size-4 text-secondary" aria-hidden="true" />
        {pregunta}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">Lo podés cambiar cuando quieras desde Mi cuenta.</p>
      {resultado && (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {resultado}
        </p>
      )}
      <div className="mt-3 flex justify-center gap-2">
        <Button type="button" size="sm" onClick={activar} disabled={pendiente}>
          {pendiente ? "Activando…" : "Sí, avisame"}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={descartar} disabled={pendiente}>
          Ahora no
        </Button>
      </div>
    </div>
  )
}
