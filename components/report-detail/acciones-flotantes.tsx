"use client"

/**
 * Botón flotante de acciones del detalle del reporte (S13, S18).
 *
 * Reúne en un solo botón ámbar las acciones que antes obligaban a recorrer la ficha
 * hasta el final: comentar, informar o ver la reparación, ubicación y organismos.
 * Cada acción abre una hoja inferior; acá solo vive la apertura del menú, el foco y
 * el cierre, nunca la lógica de negocio de la ficha.
 *
 * El botón queda por encima de la navegación inferior fija (`--bottom-nav-space`) y
 * por debajo de las hojas (`z-70`), así nunca tapa «+ Crear» ni queda tapado. El
 * estado abierto lo controla la ficha: cuando una hoja se abre, el menú se cierra
 * antes y nunca queda `aria-expanded="true"` detrás del velo.
 */

import { useCallback, useEffect, useId, useRef } from "react"
import { Building2, Camera, MapPin, MessageCircle, Pencil, X, type LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/** Las cuatro acciones que el diseño pone al alcance del pulgar. */
export type ClaveAccionFlotante = "contactos" | "ubicacion" | "reparacion" | "comentar"

/**
 * Acción concreta del menú. `onSeleccionar` recibe el botón que la abrió para que la
 * hoja sepa a quién devolverle el foco cuando se cierre.
 */
export type AccionFlotante = {
  clave: ClaveAccionFlotante
  etiqueta: string
  icono: LucideIcon
  onSeleccionar: (disparador: HTMLElement | null) => void
}

/** Etiquetas de las acciones; las mismas palabras que muestra el menú. */
export const ETIQUETAS_ACCION_FLOTANTE: Record<ClaveAccionFlotante, string> = {
  contactos: "Avisar a un organismo",
  ubicacion: "Ver ubicación",
  reparacion: "¿Ya lo arreglaron?",
  comentar: "Comentar",
}

/** Íconos de las acciones; siempre decorativos, nunca el único texto del botón. */
export const ICONOS_ACCION_FLOTANTE: Record<ClaveAccionFlotante, LucideIcon> = {
  contactos: Building2,
  ubicacion: MapPin,
  reparacion: Camera,
  comentar: MessageCircle,
}

/** Lo que la ficha sabe de la persona y del reporte para decidir qué ofrecer. */
export type ContextoAccionesFlotantes = {
  sesion: { haySesion: boolean; esAnonimo: boolean }
  reporteCerrado: boolean
  tieneUbicacion: boolean
  puedeContactar: boolean
  /** `null` cuando la ficha no tiene sección de reparación que mostrar. */
  reparacion: { hayEvidencia: boolean; puedeInformar: boolean } | null
}

/**
 * Decide qué acciones se ofrecen, en el orden en que las muestra el menú.
 *
 * Comentar exige una cuenta registrada y un reporte abierto, igual que el formulario
 * de aportes. La reparación aparece con evidencia visible o cuando se puede informar
 * una nueva; nunca se ofrece cargar otra foto mientras hay una evidencia activa.
 */
export function accionesDisponibles(contexto: ContextoAccionesFlotantes): ClaveAccionFlotante[] {
  const disponibles: ClaveAccionFlotante[] = []
  if (contexto.puedeContactar) disponibles.push("contactos")
  if (contexto.tieneUbicacion) disponibles.push("ubicacion")
  if (contexto.reparacion && (contexto.reparacion.hayEvidencia || contexto.reparacion.puedeInformar)) {
    disponibles.push("reparacion")
  }
  if (contexto.sesion.haySesion && !contexto.sesion.esAnonimo && !contexto.reporteCerrado) {
    disponibles.push("comentar")
  }
  return disponibles
}

/**
 * Arma las acciones completas a partir de las claves disponibles y de los manejadores
 * de la ficha, sin repetir etiquetas ni íconos en cada llamador.
 */
export function construirAccionesFlotantes(
  claves: ClaveAccionFlotante[],
  manejadores: Record<ClaveAccionFlotante, (disparador: HTMLElement | null) => void>,
): AccionFlotante[] {
  return claves.map((clave) => ({
    clave,
    etiqueta: ETIQUETAS_ACCION_FLOTANTE[clave],
    icono: ICONOS_ACCION_FLOTANTE[clave],
    onSeleccionar: manejadores[clave],
  }))
}

/**
 * Calcula el índice al que lleva una flecha dentro del menú, sin dar la vuelta.
 *
 * `actual` es `-1` cuando todavía no hay foco en ninguna acción: la primera flecha
 * entra por el extremo que corresponde. Devuelve `null` cuando no hay a dónde ir.
 */
export function indiceAccionSiguiente(actual: number, total: number, paso: number): number | null {
  if (total <= 0 || paso === 0) return null
  const destino = actual < 0 ? (paso > 0 ? 0 : total - 1) : actual + paso
  if (destino < 0 || destino >= total || destino === actual) return null
  return destino
}

/**
 * Ejecuta la acción elegida en dos pasos explícitos: primero cierra el menú y recién
 * después abre la hoja con el botón que la originó. Así el disparador sigue existiendo
 * cuando la hoja se cierra y el menú nunca queda desplegado detrás del velo.
 */
export function ejecutarAccionFlotante(
  accion: AccionFlotante,
  disparador: HTMLElement | null,
  cerrarMenu: () => void,
): void {
  cerrarMenu()
  accion.onSeleccionar(disparador)
}

const CLASE_ACCION =
  "group inline-flex items-center gap-2 rounded-[var(--radius-pill)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"

/**
 * Lista desplegada de acciones. Se monta sólo con el menú abierto, así el foco entra
 * en la primera acción al abrirlo y las flechas recorren la lista.
 */
export function ListaAcciones({
  id,
  acciones,
  onElegir,
  onSolicitarCierre,
}: {
  id: string
  acciones: AccionFlotante[]
  onElegir: (accion: AccionFlotante) => void
  onSolicitarCierre: () => void
}) {
  const listaRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const primero = listaRef.current?.querySelector<HTMLButtonElement>("button")
    primero?.focus()
  }, [])

  const alTeclear = (evento: React.KeyboardEvent<HTMLDivElement>) => {
    if (evento.key === "Escape") {
      evento.preventDefault()
      onSolicitarCierre()
      return
    }
    if (evento.key !== "ArrowUp" && evento.key !== "ArrowDown") return
    const botones = Array.from(evento.currentTarget.querySelectorAll<HTMLButtonElement>("button"))
    const actual = botones.indexOf(document.activeElement as HTMLButtonElement)
    const destino = indiceAccionSiguiente(actual, botones.length, evento.key === "ArrowDown" ? 1 : -1)
    if (destino === null) return
    evento.preventDefault()
    botones[destino]?.focus()
  }

  return (
    <div
      ref={listaRef}
      id={id}
      role="group"
      aria-label="Acciones del reporte"
      onKeyDown={alTeclear}
      className="pointer-events-auto flex flex-col items-end gap-2"
    >
      {acciones.map((accion) => {
        const Icono = accion.icono
        return (
          <button key={accion.clave} type="button" onClick={() => onElegir(accion)} className={CLASE_ACCION}>
            <span className="inline-flex min-h-9 items-center rounded-[var(--radius-pill)] bg-secondary px-3.5 text-xs font-medium text-secondary-foreground motion-safe:transition-colors group-hover:bg-secondary/85">
              {accion.etiqueta}
            </span>
            <span
              aria-hidden="true"
              className="inline-flex size-8 items-center justify-center rounded-[var(--radius-pill)] border border-secondary-foreground/20 bg-secondary text-secondary-foreground"
            >
              <Icono className="size-4" />
            </span>
          </button>
        )
      })}
    </div>
  )
}

/**
 * Botón flotante con su menú. El disparador anuncia si está abierto, controla la
 * lista, cierra con Escape o al tocar afuera y devuelve el foco al botón al cerrar.
 * La apertura la controla la ficha (`abierta`/`onCambiarAbierta`), así una hoja nunca
 * se abre con el menú desplegado.
 */
export function AccionesFlotantes({
  acciones,
  abierta,
  onCambiarAbierta,
  etiqueta = "Acciones rápidas del reporte",
}: {
  acciones: AccionFlotante[]
  abierta: boolean
  onCambiarAbierta: (abierta: boolean) => void
  etiqueta?: string
}) {
  const botonRef = useRef<HTMLButtonElement>(null)
  const contenedorRef = useRef<HTMLDivElement>(null)
  const idMenu = `acciones-flotantes-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`

  const cerrar = useCallback(
    (devolverFoco: boolean) => {
      onCambiarAbierta(false)
      if (devolverFoco) botonRef.current?.focus()
    },
    [onCambiarAbierta],
  )

  useEffect(() => {
    if (!abierta) return
    const alTeclear = (evento: KeyboardEvent) => {
      if (evento.key !== "Escape") return
      evento.preventDefault()
      cerrar(true)
    }
    const alSeñalar = (evento: Event) => {
      if (contenedorRef.current?.contains(evento.target as Node)) return
      onCambiarAbierta(false)
    }
    document.addEventListener("keydown", alTeclear)
    document.addEventListener("pointerdown", alSeñalar)
    return () => {
      document.removeEventListener("keydown", alTeclear)
      document.removeEventListener("pointerdown", alSeñalar)
    }
  }, [abierta, cerrar, onCambiarAbierta])

  if (acciones.length === 0) return null

  return (
    <div
      ref={contenedorRef}
      data-acciones-flotantes=""
      className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--bottom-nav-space)+0.5rem)] z-[65] flex flex-col items-end gap-2 px-3 md:px-4"
    >
      {abierta && (
        <ListaAcciones
          id={idMenu}
          acciones={acciones}
          onElegir={(accion) => ejecutarAccionFlotante(accion, botonRef.current, () => onCambiarAbierta(false))}
          onSolicitarCierre={() => cerrar(true)}
        />
      )}
      <button
        ref={botonRef}
        type="button"
        aria-expanded={abierta}
        aria-controls={idMenu}
        aria-label={abierta ? "Cerrar acciones del reporte" : etiqueta}
        onClick={() => onCambiarAbierta(!abierta)}
        className={cn(
          "pointer-events-auto inline-flex size-[3.25rem] shrink-0 items-center justify-center rounded-[var(--radius-pill)]",
          "border border-foreground/25 bg-[var(--semantic-warning)] text-foreground shadow-[var(--elevation-soft)]",
          "motion-safe:transition-colors hover:bg-[color-mix(in_oklab,var(--semantic-warning)_88%,var(--foreground))]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        )}
      >
        {abierta ? <X className="size-[1.375rem]" aria-hidden="true" /> : <Pencil className="size-[1.375rem]" aria-hidden="true" />}
      </button>
    </div>
  )
}
