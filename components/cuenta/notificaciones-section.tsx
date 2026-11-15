"use client"

import { useEffect, useId, useState, useTransition } from "react"
import { Bell, BellOff } from "lucide-react"
import { toast } from "sonner"

import { actualizarPreferenciaPushAction, obtenerEstadoPushAction, type EstadoPush } from "@/app/cuenta/push-actions"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import {
  activarPushEnEsteDispositivo,
  desactivarPushEnEsteDispositivo,
  leerSuscripcionPush,
  navegadorSoportaPush,
  type ResultadoActivacionPush,
} from "@/lib/push/cliente"
import { ETIQUETAS_TIPO_PUSH, TIPOS_PUSH, type PreferenciasPush, type TipoPush } from "@/lib/push/tipos"

/** Mensaje para cada forma en que puede terminar la activación. */
export const MENSAJES_ACTIVACION_PUSH: Record<Exclude<ResultadoActivacionPush, "activada">, string> = {
  denegada: "El permiso de notificaciones está bloqueado. Activalo desde la configuración del navegador o de la app.",
  "no-soportado": "Este navegador no admite notificaciones. En iPhone, primero agregá Reporty a la pantalla de inicio.",
  error: "No pudimos activar las notificaciones. Probá de nuevo.",
}

/**
 * Sección «Notificaciones» de «Mi cuenta».
 *
 * Activa o desactiva las push en este dispositivo y ofrece un interruptor por tipo. Las
 * preferencias valen para todos los dispositivos de la cuenta. El tipo «Contenido para
 * moderar» solo se muestra a administradores. Si las push no están configuradas en el
 * servidor, o la sesión es de invitado, la sección no se muestra.
 *
 * @returns La sección, o `null` mientras carga o si no corresponde.
 */
export function NotificacionesSection() {
  const idTitulo = useId()
  const [estado, setEstado] = useState<EstadoPush | null>(null)
  const [activaEnDispositivo, setActivaEnDispositivo] = useState(false)
  const [preferencias, setPreferencias] = useState<PreferenciasPush | null>(null)
  const [pendiente, startTransition] = useTransition()

  useEffect(() => {
    let vigente = true
    Promise.all([obtenerEstadoPushAction(), leerSuscripcionPush()])
      .then(([estadoServidor, suscripcion]) => {
        if (!vigente) return
        setEstado(estadoServidor)
        if (estadoServidor.disponible) setPreferencias(estadoServidor.preferencias)
        setActivaEnDispositivo(Boolean(suscripcion))
      })
      .catch(() => vigente && setEstado({ disponible: false }))
    return () => {
      vigente = false
    }
  }, [])

  if (!estado?.disponible || !preferencias) return null

  const tiposVisibles = TIPOS_PUSH.filter((tipo) => !ETIQUETAS_TIPO_PUSH[tipo].soloAdmin || estado.esAdmin)
  const soportado = navegadorSoportaPush()

  /** Activa o desactiva las push en este dispositivo. */
  const alternarDispositivo = () => {
    startTransition(async () => {
      if (activaEnDispositivo) {
        const ok = await desactivarPushEnEsteDispositivo()
        if (ok) {
          setActivaEnDispositivo(false)
          toast.success("Desactivamos las notificaciones en este dispositivo.")
        } else {
          toast.error("No pudimos desactivar las notificaciones. Probá de nuevo.")
        }
        return
      }
      const resultado = await activarPushEnEsteDispositivo(estado.clavePublica)
      if (resultado === "activada") {
        setActivaEnDispositivo(true)
        toast.success("Listo: te vamos a avisar en este dispositivo.")
      } else {
        toast.error(MENSAJES_ACTIVACION_PUSH[resultado])
      }
    })
  }

  /** Guarda un interruptor; si falla, lo vuelve a su valor anterior. */
  const cambiarTipo = (tipo: TipoPush, activo: boolean) => {
    const anterior = preferencias
    setPreferencias({ ...preferencias, [tipo]: activo })
    startTransition(async () => {
      const resultado = await actualizarPreferenciaPushAction(tipo, activo)
      if (!resultado.success) {
        setPreferencias(anterior)
        toast.error(resultado.error)
      }
    })
  }

  return (
    <section aria-labelledby={idTitulo} className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-start gap-3">
        {activaEnDispositivo ? (
          <Bell className="mt-0.5 size-4 shrink-0 text-secondary" aria-hidden="true" />
        ) : (
          <BellOff className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        )}
        <div className="min-w-0 flex-1 space-y-1">
          <h2 id={idTitulo} className="text-sm font-semibold">
            Notificaciones
          </h2>
          <p className="text-xs text-muted-foreground">
            {activaEnDispositivo
              ? "Activadas en este dispositivo. Elegí qué avisos querés recibir."
              : "Recibí un aviso en este dispositivo cuando pase algo con tus publicaciones."}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={alternarDispositivo}
          disabled={pendiente || (!soportado && !activaEnDispositivo)}
        >
          {activaEnDispositivo ? "Desactivar" : "Activar"}
        </Button>
      </div>

      {!soportado && <p className="mt-3 text-xs text-muted-foreground">{MENSAJES_ACTIVACION_PUSH["no-soportado"]}</p>}

      <ul className="mt-4 space-y-3 border-t border-border pt-4">
        {tiposVisibles.map((tipo) => {
          const idInterruptor = `${idTitulo}-${tipo}`
          return (
            <li key={tipo} className="flex items-start justify-between gap-4">
              <label htmlFor={idInterruptor} className="min-w-0 space-y-0.5">
                <span className="block text-sm font-medium">{ETIQUETAS_TIPO_PUSH[tipo].titulo}</span>
                <span className="block text-xs text-muted-foreground">{ETIQUETAS_TIPO_PUSH[tipo].descripcion}</span>
              </label>
              <Switch
                id={idInterruptor}
                checked={preferencias[tipo]}
                onCheckedChange={(activo) => cambiarTipo(tipo, activo)}
                disabled={pendiente}
              />
            </li>
          )
        })}
      </ul>
    </section>
  )
}
