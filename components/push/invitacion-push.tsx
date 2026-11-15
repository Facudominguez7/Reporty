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

/**
 * Rutas sin aviso automático: crear un reporte ya tiene su invitación propia y el mapa ocupa la
 * pantalla completa (un cartel ahí tapa controles y leyenda).
 */
const RUTAS_SIN_AVISO_AUTOMATICO = ["/reportes/nuevo", "/mapa"]

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
 * @returns `false` al crear un reporte y en el mapa.
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
 * Barra compacta del aviso automático (solo presentación): una línea fija arriba de la
 * navegación inferior, con «Activar» y una cruz que equivale a «Ahora no».
 *
 * @param props.pregunta - Texto corto de la barra.
 * @param props.pendiente - Si la activación está en curso.
 * @param props.alActivar - Se llama al tocar «Activar».
 * @param props.alDescartar - Se llama al tocar la cruz.
 * @returns La barra.
 */
export function BarraAvisoPush({
  pregunta,
  pendiente,
  alActivar,
  alDescartar,
}: {
  pregunta: string
  pendiente: boolean
  alActivar: () => void
  alDescartar: () => void
}) {
  return (
    <div
      role="region"
      aria-label="Activar notificaciones"
      className="fixed inset-x-3 bottom-[calc(var(--bottom-nav-space,0px)+0.75rem)] z-50 flex items-center gap-2 rounded-full border border-border bg-card/95 py-1.5 pl-3 pr-1.5 text-sm shadow-md backdrop-blur sm:left-auto sm:right-6 sm:max-w-sm"
    >
      <Bell className="size-4 shrink-0 text-secondary" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">{pregunta}</span>
      <Button type="button" size="sm" className="h-8 rounded-full px-3" onClick={alActivar} disabled={pendiente}>
        {pendiente ? "Activando…" : "Activar"}
      </Button>
      <button
        type="button"
        onClick={alDescartar}
        disabled={pendiente}
        className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label="Ahora no"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  )
}

/**
 * Invitación a activar las notificaciones, pensada para el momento en que tienen sentido:
 * justo después de crear un reporte. Nunca pide el permiso sola; lo pide el botón.
 *
 * @param props.pregunta - Texto de la pregunta, según el contexto.
 * @param props.flotante - Si es el aviso automático: una barra compacta de una línea, fija arriba
 *   de la navegación inferior, con «Activar» y una cruz («Ahora no»). Los resultados se informan
 *   con un aviso breve en lugar de agrandar la barra.
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
      if (flotante) {
        if (respuesta === "activada") toast.success("Listo: te vamos a avisar en este dispositivo.")
        else toast.error(MENSAJES_ACTIVACION_PUSH[respuesta])
        // Si el permiso quedó bloqueado o no hay soporte, la barra no vuelve a servir.
        setResultado(respuesta === "activada" || respuesta === "error" ? respuesta : "descartada")
        return
      }
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

  if (flotante) {
    return <BarraAvisoPush pregunta={pregunta} pendiente={pendiente} alActivar={activar} alDescartar={descartar} />
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
  return <InvitacionPush pregunta="Avisos de tus reportes" flotante />
}
