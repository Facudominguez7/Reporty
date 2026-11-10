import { readFileSync } from "node:fs"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { BotonDonarMapa, MAP_LAYER_OPTIONS, PetLayerError, shouldShowMascotasOnboarding } from "./mapa-client"

describe("map layer labels", () => {
  it("calls the report layer Incidentes", () => {
    expect(MAP_LAYER_OPTIONS[0]).toEqual(["reportes", "Incidentes"])
  })
})

describe("shouldShowMascotasOnboarding", () => {
  it("shows the guide only the first time the pet layer is selected", () => {
    expect(shouldShowMascotasOnboarding("mascotas", false)).toBe(true)
    expect(shouldShowMascotasOnboarding("mascotas", true)).toBe(false)
    expect(shouldShowMascotasOnboarding("reportes", false)).toBe(false)
  })
})

describe("PetLayerError", () => {
  it("shows pet query failures as a visible alert only when a failure exists", () => {
    const markup = renderToStaticMarkup(createElement(PetLayerError, { error: "pet read denied" }))
    expect(markup).toContain('role="alert"')
    expect(markup).toContain("No se pudieron cargar las mascotas: pet read denied")
    expect(renderToStaticMarkup(createElement(PetLayerError, { error: null }))).toBe("")
  })
})

describe("BotonDonarMapa", () => {
  it("es un botón redondo verde con el corazón que lleva a /donar", () => {
    const markup = renderToStaticMarkup(createElement(BotonDonarMapa))
    expect(markup).toMatch(/^<a [^>]*href="\/donar"/)
    expect(markup).toContain('aria-label="Donar a Reporty"')
    expect(markup).toContain("size-9")
    expect(markup).toContain("rounded-full")
    expect(markup).toContain("bg-primary")
    expect(markup).toContain("lucide-heart-handshake")
    expect(markup).not.toContain(">Donar<")
  })

  it("va en la fila de arriba, junto a contactos y ayuda, y reemplaza a la píldora", () => {
    const fuente = readFileSync(new URL("./mapa-client.tsx", import.meta.url), "utf8")
    expect(fuente).toMatch(/<BotonDonarMapa \/>\s*<ContactsDialog \/>\s*<HowToUseDialog/)
    expect(fuente).not.toContain("BotonDonarEncabezado")
    expect(fuente).not.toContain("AccesoDonarMapa")
  })
})

describe("acciones del botón flotante", () => {
  it("usan el tamaño chico y quedan pegadas al botón", () => {
    const fuente = readFileSync(new URL("./mapa-client.tsx", import.meta.url), "utf8")
    expect(fuente).toContain('buttonVariants({ size: "sm", variant: "floating" })')
    expect(fuente).toContain('<div className="flex flex-col items-end gap-1.5">')
  })
})
