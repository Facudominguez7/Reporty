"use client"

import { useEffect, useState, useTransition } from "react"
import { usePathname } from "next/navigation"
import { Bell, X } from "lucide-react"
import { toast } from "sonner"

import { obtenerEstadoPushAction } from "@/app/cuenta/push-actions"
import { MENSAJES_ACTIVACION_PUSH } from "@/components/cuenta/notificaciones-section"
import { Button } from "@/components/ui/button"
import { activarPushEnEsteDispositivo, leerSuscripcionPush, navegadorSoportaPush } from "@/lib/push/cliente"

/** Clave de `localStorage` que guarda cuándo la persona eligió «Ahora no» en este navegador. */
export const CLAVE_INVITACION_PUSH_DESCARTADA = "reporty:invitacion-push-descartada"

/** Días que la invitación queda escondida después de «Ahora no»; después se vuelve a ofrecer. */
export const DIAS_PARA_REOFRECER_PUSH = 14

/** Rutas donde no va el aviso automático porque ya hay una invitación propia. */
const RUTAS_SIN_AVISO_AUTOMATICO = ["/reportes/nuevo"]

/**
 * Decide si un «Ahora no» guardado todavía esconde la invitación.
 *
 * @param valor - Lo guardado en `localStorage`: el instante del descarte en milisegundos.
 * @param ahora - Instante actual en milisegundos.
 * @returns `true` si pasaron menos de `DIAS_PARA_REOFRECER_PUSH` días. Un valor sin fecha
 *   (incluido el «1» de versiones anteriores) no esconde nada.
 */
export function descarteVigente(valor: string | null, ahora: number): boolean {
  if (!valor || !/^\d+$/.test(valor)) return false
  return ahora - Number(valor) < DIAS_PARA_REOFRECER_PUSH * 24 * 60 * 60 * 1000
}

/**
 * Decide si en esta ruta se muestra el aviso automático de notificaciones.
 *
 * @param ruta - `pathname` actual.
 * @returns `false` donde ya existe una invitación propia (crear un reporte).
 */
export function rutaAdmiteAvisoPush(ruta: string): boolean {
  return !RUTAS_SIN_AVISO_AUTOMATICO.some((excluida) => ruta === excluida || ruta.startsWith(`${excluida}/`))
}

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
 * Lee si la invitación se descartó hace poco en este navegador; sin almacenamiento disponible, no.
 *
 * @returns `true` si la persona eligió «Ahora no» hace menos de `DIAS_PARA_REOFRECER_PUSH` días.
 */
function invitacionDescartada(): boolean {
  try {
    return descarteVigente(window.localStorage.getItem(CLAVE_INVITACION_PUSH_DESCARTADA), Date.now())
  } catch {
    return false
  }
}

/**
 * Invitación a activar las notificaciones, pensada para el momento en que tienen sentido:
 * justo después de crear un reporte. Nunca pide el permiso sola; lo pide el botón.
 *
 * @param props.pregunta - Texto de la pregunta, según el contexto.
 * @param props.flotante - Si es el aviso automático: se muestra fijo abajo, con botón de cerrar,
 *   y al activarse desaparece con un aviso breve en lugar de dejar el mensaje en pantalla.
 * @returns La invitación, o `null` si no corresponde ofrecerla.
 */
export function InvitacionPush({ pregunta, flotante = false }: { pregunta: string; flotante?: boolean }) {
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

  if (!clavePublica || resultado === "descartada" || (flotante && resultado === "activada")) return null

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
      if (respuesta === "activada" && flotante) toast.success("Listo: te vamos a avisar en este dispositivo.")
      setResultado(respuesta === "activada" ? "activada" : MENSAJES_ACTIVACION_PUSH[respuesta])
    })
  }

  /** Recuerda la elección en este navegador y oculta la invitación. */
  const descartar = () => {
    try {
      window.localStorage.setItem(CLAVE_INVITACION_PUSH_DESCARTADA, String(Date.now()))
    } catch {
      // Sin almacenamiento: solo se oculta por ahora.
    }
    setResultado("descartada")
  }

  const contenedor = flotante
    ? "fixed inset-x-4 bottom-4 z-50 rounded-xl border border-border bg-card p-4 text-center shadow-lg sm:left-auto sm:right-6 sm:bottom-6 sm:max-w-sm"
    : "rounded-xl border border-border/70 bg-muted/40 p-4 text-center"

  return (
    <div className={contenedor} role={flotante ? "region" : undefined} aria-label={flotante ? "Activar notificaciones" : undefined}>
      {flotante && (
        <button
          type="button"
          onClick={descartar}
          className="absolute right-2 top-2 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Cerrar"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      )}
      <p className="flex items-center justify-center gap-2 px-4 text-sm font-medium">
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

/**
 * Aviso automático de notificaciones para todo el sitio: aparece solo, abajo, a las cuentas
 * registradas que todavía no las activaron en este dispositivo. El permiso del sistema se pide
 * recién al tocar «Sí, avisame». Los invitados no lo ven (el servidor responde no disponible).
 *
 * @returns El aviso, o `null` en las rutas que ya tienen su propia invitación.
 */
export function AvisoPushAutomatico() {
  const ruta = usePathname()
  if (!rutaAdmiteAvisoPush(ruta ?? "/")) return null
  return <InvitacionPush pregunta="¿Te avisamos cuando haya novedades de tus reportes?" flotante />
}
