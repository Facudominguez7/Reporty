import { readFileSync } from "node:fs"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { Camera, MapPin, MessageCircle, Building2 } from "lucide-react"
import { describe, expect, it, vi } from "vitest"

import {
  AccionesFlotantes,
  ListaAcciones,
  accionesDisponibles,
  construirAccionesFlotantes,
  ejecutarAccionFlotante,
  indiceAccionSiguiente,
  type AccionFlotante,
} from "./acciones-flotantes"

const acciones: AccionFlotante[] = [
  { clave: "contactos", etiqueta: "Avisar a un organismo", icono: Building2, onSeleccionar: vi.fn() },
  { clave: "ubicacion", etiqueta: "Ver ubicación", icono: MapPin, onSeleccionar: vi.fn() },
  { clave: "reparacion", etiqueta: "¿Ya lo arreglaron?", icono: Camera, onSeleccionar: vi.fn() },
  { clave: "comentar", etiqueta: "Comentar", icono: MessageCircle, onSeleccionar: vi.fn() },
]

describe("disponibilidad de las acciones flotantes", () => {
  const contextoBase = {
    sesion: { haySesion: true, esAnonimo: false },
    reporteCerrado: false,
    tieneUbicacion: true,
    puedeContactar: true,
    reparacion: { hayEvidencia: false, puedeInformar: true },
  }

  it("ofrece las cuatro acciones en el orden del diseño cuando todo está disponible", () => {
    expect(accionesDisponibles(contextoBase)).toEqual(["contactos", "ubicacion", "reparacion", "comentar"])
  })

  it("no ofrece comentar sin sesión, como invitado ni en un reporte cerrado", () => {
    expect(accionesDisponibles({ ...contextoBase, sesion: { haySesion: false, esAnonimo: false } })).not.toContain("comentar")
    expect(accionesDisponibles({ ...contextoBase, sesion: { haySesion: true, esAnonimo: true } })).not.toContain("comentar")
    expect(accionesDisponibles({ ...contextoBase, reporteCerrado: true })).not.toContain("comentar")
  })

  it("sólo ofrece la reparación cuando hay evidencia visible o se puede informar una", () => {
    expect(accionesDisponibles({ ...contextoBase, reparacion: null })).not.toContain("reparacion")
    expect(accionesDisponibles({ ...contextoBase, reparacion: { hayEvidencia: false, puedeInformar: false } })).not.toContain("reparacion")
    expect(accionesDisponibles({ ...contextoBase, reparacion: { hayEvidencia: true, puedeInformar: false } })).toContain("reparacion")
    expect(accionesDisponibles({ ...contextoBase, reparacion: { hayEvidencia: true, puedeInformar: true } })).toContain("reparacion")
  })

  it("sólo ofrece ubicación y organismos cuando el reporte los tiene", () => {
    expect(accionesDisponibles({ ...contextoBase, tieneUbicacion: false })).not.toContain("ubicacion")
    expect(accionesDisponibles({ ...contextoBase, puedeContactar: false })).not.toContain("contactos")
  })

  it("arma cada acción con su etiqueta visible y su manejador", () => {
    const manejadores = {
      contactos: vi.fn(),
      ubicacion: vi.fn(),
      reparacion: vi.fn(),
      comentar: vi.fn(),
    }

    const armadas = construirAccionesFlotantes(["comentar", "ubicacion"], manejadores)

    expect(armadas).toHaveLength(2)
    expect(armadas[0]).toMatchObject({ clave: "comentar", etiqueta: "Comentar" })
    expect(armadas[1]).toMatchObject({ clave: "ubicacion", etiqueta: "Ver ubicación" })
    expect(armadas[0].onSeleccionar).toBe(manejadores.comentar)
  })
})

describe("botón flotante cerrado", () => {
  it("publica su estado, su nombre accesible y el menú que controla", () => {
    const html = renderToStaticMarkup(createElement(AccionesFlotantes, { acciones, abierta: false, onCambiarAbierta: () => {} }))

    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain('aria-label="Acciones rápidas del reporte"')
    expect(html).toMatch(/aria-controls="[^"]+"/)
    expect(html).toContain("data-acciones-flotantes")
  })

  it("no muestra las acciones hasta abrirlo", () => {
    const html = renderToStaticMarkup(createElement(AccionesFlotantes, { acciones, abierta: false, onCambiarAbierta: () => {} }))

    expect(html).not.toContain("Comentar")
    expect(html).not.toContain("Ver ubicación")
  })

  it("queda sobre la navegación inferior y no anima por su cuenta", () => {
    const html = renderToStaticMarkup(createElement(AccionesFlotantes, { acciones, abierta: false, onCambiarAbierta: () => {} }))

    expect(html).toContain("bottom-[calc(var(--bottom-nav-space)+0.5rem)]")
    expect(html).toContain("z-[65]")
    expect(html).not.toMatch(/animate-|transition-all/)
  })
})

describe("apertura controlada por el padre", () => {
  it("refleja el estado cerrado cuando el padre ya lo cerró", () => {
    const html = renderToStaticMarkup(
      createElement(AccionesFlotantes, { acciones, abierta: false, onCambiarAbierta: () => {} }),
    )

    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain('aria-label="Acciones rápidas del reporte"')
    expect(html).not.toContain("¿Ya lo arreglaron?")
  })

  it("pinta las acciones cuando el padre lo mantiene abierto", () => {
    const html = renderToStaticMarkup(
      createElement(AccionesFlotantes, { acciones, abierta: true, onCambiarAbierta: () => {} }),
    )

    expect(html).toContain('aria-expanded="true"')
    expect(html).toContain('aria-label="Cerrar acciones del reporte"')
    expect(html).toContain("Comentar")
    expect(html).toContain("¿Ya lo arreglaron?")
  })
})

describe("elegir una acción del menú", () => {
  it("cierra el menú antes de abrir la hoja y entrega el botón que la abrió", () => {
    const orden: string[] = []
    const cerrarMenu = vi.fn(() => { orden.push("cerrar") })
    const onSeleccionar = vi.fn(() => { orden.push("seleccionar") })
    const disparador = { isConnected: true } as unknown as HTMLElement

    ejecutarAccionFlotante(
      { clave: "ubicacion", etiqueta: "Ver ubicación", icono: MapPin, onSeleccionar },
      disparador,
      cerrarMenu,
    )

    // La hoja nunca convive con el menú desplegado (`aria-expanded="true"` detrás del velo).
    expect(orden).toEqual(["cerrar", "seleccionar"])
    expect(onSeleccionar).toHaveBeenCalledWith(disparador)
  })
})

describe("menú de acciones abierto", () => {
  it("lista cada acción con etiqueta de texto e ícono decorativo", () => {
    const html = renderToStaticMarkup(createElement(ListaAcciones, { id: "menu-acciones", acciones, onElegir: vi.fn(), onSolicitarCierre: vi.fn() }))

    for (const { etiqueta } of acciones) expect(html).toContain(etiqueta)
    expect(html).toMatch(/<span aria-hidden="true"[^>]*><svg/)
    expect(html).toContain('id="menu-acciones"')
    expect(html).toContain('aria-label="Acciones del reporte"')
  })
})

describe("navegación con teclado", () => {
  it("mueve el foco una acción por flecha sin salir de la lista", () => {
    expect(indiceAccionSiguiente(-1, 4, -1)).toBe(3)
    expect(indiceAccionSiguiente(-1, 4, 1)).toBe(0)
    expect(indiceAccionSiguiente(0, 4, 1)).toBe(1)
    expect(indiceAccionSiguiente(3, 4, 1)).toBeNull()
    expect(indiceAccionSiguiente(0, 4, -1)).toBeNull()
    expect(indiceAccionSiguiente(1, 0, 1)).toBeNull()
  })

  it("cierra con Escape y devuelve el foco al botón que lo abrió", () => {
    const fuente = readFileSync(new URL("./acciones-flotantes.tsx", import.meta.url), "utf8")

    expect(fuente).toContain('evento.key === "Escape"')
    expect(fuente).toContain("botonRef.current?.focus()")
    expect(fuente).toContain('"pointerdown"')
    expect(fuente).toContain('"keydown"')
  })
})
