import { createElement, forwardRef, Fragment, type ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

// Vaul sólo pinta su contenido en el navegador; el doble respeta `open` para que una
// prueba pueda mirar la hoja abierta sin montar un DOM.
vi.mock("vaul", () => {
  const contenedor = (etiqueta: string) =>
    forwardRef<HTMLDivElement, { children?: ReactNode; onCloseAutoFocus?: () => void }>(function Mock(props, ref) {
      const foco = props.onCloseAutoFocus ? { "data-foco-al-cerrar": "si" } : {}
      return createElement(etiqueta, { ...props, ...foco, ref }, props.children)
    })
  const Drawer = {
    Root: ({ children, open }: { children?: ReactNode; open?: boolean }) =>
      createElement(Fragment, null, open ? children : null),
    Trigger: ({ children }: { children?: ReactNode }) => createElement(Fragment, null, children),
    Close: ({ children }: { children?: ReactNode }) => createElement(Fragment, null, children),
    Portal: ({ children }: { children?: ReactNode }) => createElement(Fragment, null, children),
    Overlay: contenedor("div"),
    Handle: contenedor("div"),
    Content: contenedor("div"),
    Title: contenedor("h2"),
    Description: contenedor("p"),
  }
  return { Drawer }
})

import { HojaReporte, crearManejadorFocoAlCerrar, type HojaReporteProps } from "./hojas-reporte"

/** Renderiza una hoja abierta con su título, su descripción y su contenido. */
function renderizar(extra: Partial<Omit<HojaReporteProps, "children">> = {}) {
  return renderToStaticMarkup(
    createElement(
      HojaReporte,
      {
        abierta: true,
        cambiandoAbierta: () => {},
        titulo: "Ubicación",
        descripcion: "Coordenadas cargadas en el reporte.",
        etiquetaCerrar: "Cerrar la ubicación",
        ...extra,
      },
      createElement("p", null, "Contenido de la hoja"),
    ),
  )
}

describe("hoja inferior del detalle", () => {
  it("usa el mismo Drawer que el filtro del mapa con su alto y su recorte de escritorio", () => {
    const html = renderizar()

    expect(html).toContain("max-h-[85dvh]")
    expect(html).toContain("md:inset-x-[15%]")
    expect(html).toContain("rounded-t-[1.75rem]")
  })

  it("siempre lleva título y descripción accesibles", () => {
    const html = renderizar()

    expect(html).toContain("Ubicación")
    expect(html).toContain("Coordenadas cargadas en el reporte.")
  })

  it("ofrece un cierre con nombre propio además del gesto del Drawer", () => {
    const html = renderizar()

    expect(html).toContain('aria-label="Cerrar la ubicación"')
  })

  it("no pinta nada con la hoja cerrada", () => {
    expect(renderizar({ abierta: false })).toBe("")
  })

  it("conecta la devolución de foco con el cierre del Drawer", () => {
    const disparador = { isConnected: true, focus: () => {} } as unknown as HTMLElement

    expect(renderizar({ disparador })).toContain('data-foco-al-cerrar="si"')
  })

  it("deja un pie opcional para la acción principal", () => {
    const html = renderizar({ pie: createElement("button", { type: "button" }, "Ver en mapa completo") })

    expect(html).toContain("Ver en mapa completo")
  })
})

describe("foco al cerrar la hoja", () => {
  it("devuelve el foco al disparador vivo y cancela la restauración automática del Drawer", () => {
    const destino = { isConnected: true, focus: vi.fn() } as unknown as HTMLElement
    const evento = { preventDefault: vi.fn() } as unknown as Event

    crearManejadorFocoAlCerrar(destino)(evento)

    expect(evento.preventDefault).toHaveBeenCalledTimes(1)
    expect(destino.focus).toHaveBeenCalledTimes(1)
  })

  it("deja que el Drawer decida cuando no hay disparador o ya salió del documento", () => {
    const evento = { preventDefault: vi.fn() } as unknown as Event
    const desconectado = { isConnected: false, focus: vi.fn() } as unknown as HTMLElement

    crearManejadorFocoAlCerrar(null)(evento)
    crearManejadorFocoAlCerrar(desconectado)(evento)

    expect(evento.preventDefault).not.toHaveBeenCalled()
    expect(desconectado.focus).not.toHaveBeenCalled()
  })
})
