import { createElement, type ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { ReporteBandeja } from "./bandeja-client"

const mocks = vi.hoisted(() => ({ tomar: vi.fn(), seleccionado: null as ReporteBandeja | null }))

vi.mock("react", async (importOriginal) => {
  const original = await importOriginal<typeof import("react")>()
  return {
    ...original,
    useState: (inicial: unknown) => {
      if (inicial === null && mocks.seleccionado) {
        const seleccionado = mocks.seleccionado
        mocks.seleccionado = null
        return original.useState(seleccionado)
      }
      return original.useState(inicial)
    },
  }
})

vi.mock("@/hooks/use-media-query", () => ({ useMediaQuery: () => true }))

vi.mock("@/app/reportes/[id]/actions", () => ({
  tomarReporteDefensoriaAction: mocks.tomar,
}))

vi.mock("next/link", () => ({
  default: ({ href, children, scroll: _scroll, ...props }: { href: string; children: ReactNode; scroll?: boolean }) =>
    createElement("a", { href, ...props }, children),
}))

vi.mock("next/image", () => ({
  default: (props: { src?: string; alt?: string }) => createElement("img", { src: props.src, alt: props.alt }),
}))

vi.mock("@/components/ui/dialog", async () => {
  const React = await import("react")
  const Wrapper = ({ children }: { children?: ReactNode }) => React.createElement("div", null, children)
  return {
    Dialog: ({ open, children }: { open: boolean; children?: ReactNode }) =>
      open ? React.createElement("div", null, children) : null,
    DialogContent: Wrapper,
    DialogDescription: Wrapper,
    DialogFooter: Wrapper,
    DialogHeader: Wrapper,
    DialogTitle: Wrapper,
  }
})

import { BandejaClient } from "./bandeja-client"

const pendienteAlta: ReporteBandeja = {
  id: 7,
  titulo: "Bache profundo sobre Av. Freyre",
  descripcion: "El bache tiene unos 60 cm de diámetro.",
  categoria: "Calles y veredas",
  prioridad: "Alta",
  estado: "Pendiente",
  autor: "vecino",
  createdAt: "2026-11-20T10:00:00.000Z",
  imageUrl: null,
  numeroReclamo: null,
}

const pendienteMedia: ReporteBandeja = { ...pendienteAlta, id: 8, titulo: "Alumbrado apagado en Ituzaingón", prioridad: "Media" }

const tomado: ReporteBandeja = {
  ...pendienteAlta,
  id: 9,
  titulo: "Basural espontáneo en Blas Parera",
  estado: "Tomado por Defensoría",
  numeroReclamo: "RE-2026-01482",
}

describe("BandejaClient (toma sin salir del panel, S2/S11)", () => {
  beforeEach(() => {
    mocks.tomar.mockReset()
    mocks.seleccionado = null
  })

  it("separa Pendientes y Tomados con filtros accesibles y arranca en Pendientes", () => {
    const html = renderToStaticMarkup(createElement(BandejaClient, { reportes: [pendienteAlta, pendienteMedia, tomado] }))
    expect(html).toContain('aria-label="Estado del reporte"')
    expect(html).toContain('aria-label="Detalle seleccionado"')
    expect(html).toContain('Buscar reportes')
    expect(html).toContain(">Pendientes<")
    expect(html).toContain(">Tomados<")
    expect(html).toContain('aria-pressed="true"')
    // Los tomados quedan en su pestaña: el número de reclamo no aparece en la vista inicial.
    expect(html).not.toContain("RE-2026-01482")
  })

  it("ancla el detalle de escritorio al borde superior de la segunda tarjeta seleccionada", () => {
    mocks.seleccionado = pendienteMedia
    const html = renderToStaticMarkup(createElement(BandejaClient, { reportes: [pendienteAlta, pendienteMedia] }))
    const filas = html.match(/<li\b[^>]*>[\s\S]*?<\/li>/g) ?? []
    expect(filas).toHaveLength(2)
    expect(filas[0]).not.toContain('aria-label="Detalle seleccionado"')
    expect(filas[1]).toContain('aria-label="Detalle seleccionado"')
    expect(filas[1]).toContain("lg:top-[var(--desfase-detalle,0px)]")
    expect(filas[1]).toContain("lg:max-h-[var(--alto-detalle,100dvh)]")
    expect(filas[1]).toContain("lg:overflow-y-auto")
    expect(filas[1]).toContain("lg:overscroll-contain")
    expect(filas[1]).not.toContain("lg:sticky")
  })

  it("muestra la dirección y el aviso de ausencia en las filas", () => {
    const html = renderToStaticMarkup(createElement(BandejaClient, { reportes: [
      { ...pendienteAlta, ubicacion: "Av. Freyre 123, Santa Fe" },
      { ...pendienteMedia, ubicacion: "Dirección no disponible" },
    ] }))
    expect(html).toContain("Av. Freyre 123, Santa Fe")
    expect(html).toContain("Dirección no disponible")
  })

  it("muestra el barrio con la atribución de la IDE en el detalle (#299)", () => {
    mocks.seleccionado = { ...pendienteAlta, barrio: "Villa Sarita" }
    const html = renderToStaticMarkup(createElement(BandejaClient, { reportes: [mocks.seleccionado] }))
    expect(html).toContain(">Barrio<")
    expect(html).toContain("Villa Sarita")
    expect(html).toContain("Secretaría de Movilidad Urbana, Dirección SIG-IDE, Municipalidad de Posadas (ODbL)")
  })

  it("sin barrio no muestra el dato ni la atribución", () => {
    mocks.seleccionado = { ...pendienteAlta, barrio: null }
    const html = renderToStaticMarkup(createElement(BandejaClient, { reportes: [mocks.seleccionado] }))
    expect(html).not.toContain(">Barrio<")
    expect(html).not.toContain("ODbL")
  })

  it("muestra la misma ubicación escrita o su aviso en el detalle", () => {
    for (const ubicacion of ["Av. Freyre 123, Santa Fe", "Dirección no disponible"]) {
      const reporte = { ...pendienteAlta, ubicacion }
      mocks.seleccionado = reporte
      const html = renderToStaticMarkup(createElement(BandejaClient, { reportes: [reporte] }))
      expect(html.match(new RegExp(ubicacion, "g"))).toHaveLength(2)
    }
  })

  it("abre el detalle como paso previo a tomar, sin enlaces que saquen del panel", () => {
    const html = renderToStaticMarkup(createElement(BandejaClient, { reportes: [pendienteAlta] }))
    expect(html).toContain("Ver el detalle")
    expect(html).not.toContain("Tomar y asignar reclamo")
    expect(html).toContain("Elegí un reporte")
    expect(html).not.toContain('href="/reportes/')
  })

  it("muestra los tomados con su número de reclamo y sin botón de tomar", () => {
    const html = renderToStaticMarkup(
      createElement(BandejaClient, { reportes: [pendienteAlta, tomado], vistaInicial: "tomados" }),
    )
    expect(html).toContain("RE-2026-01482")
    expect(html).not.toContain("Tomar y asignar reclamo")
    expect(html).toContain("Ver el detalle")
  })

  it("muestra el reporte #2 y su estado aunque esté en la otra pestaña", () => {
    const html = renderToStaticMarkup(createElement(BandejaClient, {
      reportes: [{ ...tomado, id: 2 }], vistaInicial: "pendientes", busquedaInicial: "reporte 2",
    }))
    expect(html).toContain('data-reporte="2"')
    expect(html).toContain("Tomado por Defensoría")
  })

  it("ofrece páginas vecinas incluso si el estado elegido no tiene filas en la página actual", () => {
    const html = renderToStaticMarkup(createElement(BandejaClient, {
      reportes: [pendienteAlta], vistaInicial: "tomados", pagina: 2, hayMas: true,
    }))
    expect(html).toContain("No hay reportes tomados en esta página.")
    expect(html).toContain('href="/defensoria?pagina=1&amp;vista=tomados"')
    expect(html).toContain('href="/defensoria?pagina=3&amp;vista=tomados"')
    expect(html).toContain("reportes en esta página")
  })

  it("conserva la búsqueda aplicada en pestañas y páginas y ofrece envío explícito", () => {
    const html = renderToStaticMarkup(createElement(BandejaClient, { reportes: [tomado], vistaInicial: "tomados", busquedaInicial: "Av. Freyre", pagina: 2, hayMas: true }))
    expect(html).toContain('name="busqueda"')
    expect(html).toContain('value="Av. Freyre"')
    expect(html).toContain('name="vista"')
    expect(html).toContain('>Buscar</button>')
    expect(html).toContain('pagina=3&amp;vista=tomados&amp;busqueda=Av.+Freyre')
    expect(html).toContain("RE-2026-01482")
  })

  it.each(["pendientes", "tomados"] as const)("limita el estado vacío a la página consultada (%s)", (vistaInicial) => {
    const html = renderToStaticMarkup(createElement(BandejaClient, {
      reportes: [], vistaInicial, pagina: 2,
    }))
    expect(html).toContain(`No hay reportes ${vistaInicial} en esta página.`)
    expect(html).toContain(">Anterior</a>")
  })
})
