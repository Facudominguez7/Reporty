import { readFileSync } from "node:fs"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { Camera } from "lucide-react"
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
  { clave: "reparacion", etiqueta: "¿Ya lo arreglaron?", icono: Camera, onSeleccionar: vi.fn() },
]

describe("disponibilidad de las acciones flotantes", () => {
  const contextoBase = {
    reparacion: { hayEvidencia: false, puedeInformar: true },
  }

  it("ofrece sólo la acción de reparación cuando está disponible", () => {
    expect(accionesDisponibles(contextoBase)).toEqual(["reparacion"])
  })

  it("sólo ofrece la reparación cuando hay evidencia visible o se puede informar una", () => {
    expect(accionesDisponibles({ ...contextoBase, reparacion: null })).not.toContain("reparacion")
    expect(accionesDisponibles({ ...contextoBase, reparacion: { hayEvidencia: false, puedeInformar: false } })).not.toContain("reparacion")
    expect(accionesDisponibles({ ...contextoBase, reparacion: { hayEvidencia: true, puedeInformar: false } })).toContain("reparacion")
    expect(accionesDisponibles({ ...contextoBase, reparacion: { hayEvidencia: true, puedeInformar: true } })).toContain("reparacion")
  })

  it("arma cada acción con su etiqueta visible y su manejador", () => {
    const manejadores = { reparacion: vi.fn() }

    const armadas = construirAccionesFlotantes(["reparacion"], manejadores)

    expect(armadas).toHaveLength(1)
    expect(armadas[0]).toMatchObject({ clave: "reparacion", etiqueta: "¿Ya lo arreglaron?" })
    expect(armadas[0].onSeleccionar).toBe(manejadores.reparacion)
  })
})

describe("botón flotante cerrado", () => {
  it("publica su estado, su nombre accesible y el menú que controla", () => {
    const html = renderToStaticMarkup(createElement(AccionesFlotantes, { acciones, abierta: false, onCambiarAbierta: () => {} }))

    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain('aria-label="Acciones de reparación"')
    expect(html).toMatch(/aria-controls="[^"]+"/)
    expect(html).toContain("data-acciones-flotantes")
  })

  it("no muestra las acciones hasta abrirlo", () => {
    const html = renderToStaticMarkup(createElement(AccionesFlotantes, { acciones, abierta: false, onCambiarAbierta: () => {} }))

    expect(html).not.toContain("¿Ya lo arreglaron?")
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
    expect(html).toContain('aria-label="Acciones de reparación"')
    expect(html).not.toContain("¿Ya lo arreglaron?")
  })

  it("pinta las acciones cuando el padre lo mantiene abierto", () => {
    const html = renderToStaticMarkup(
      createElement(AccionesFlotantes, { acciones, abierta: true, onCambiarAbierta: () => {} }),
    )

    expect(html).toContain('aria-expanded="true"')
    expect(html).toContain('aria-label="Cerrar acciones del reporte"')
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
      { clave: "reparacion", etiqueta: "¿Ya lo arreglaron?", icono: Camera, onSeleccionar },
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
