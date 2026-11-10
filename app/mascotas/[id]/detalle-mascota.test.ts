import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

const navigationMocks = vi.hoisted(() => ({ returnTo: null as string | null }))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(navigationMocks.returnTo ? { returnTo: navigationMocks.returnTo } : {}),
}))
vi.mock("./actions", () => ({ marcarMascotaEncontradaAction: vi.fn(), retirarMascotaDetalleAction: vi.fn() }))
import { DetalleMascota } from "./detalle-mascota"
import type { MascotaDetail } from "@/database/queries/mascotas/detalle"

const pet: MascotaDetail = { id: 12, species: "Perro", status: "Perdida", description: "Collar rojo", createdAt: "2026-11-01T12:00:00Z", phone: "123456", image: "/api/mascotas/12/foto" }
const render = (isOwner: boolean, status: MascotaDetail["status"] = "Perdida") =>
  renderToStaticMarkup(createElement(DetalleMascota, { pet: { ...pet, status }, isOwner }))

describe("pet detail", () => {
  it("shows the written street of the pet location", () => {
    const html = renderToStaticMarkup(createElement(DetalleMascota, { pet: { ...pet, coordinates: [-27.36, -55.89], address: "Bolívar 1450, Posadas" }, isOwner: false }))
    expect(html).toContain("Bolívar 1450, Posadas")
  })

  it.each([["Perdida", "Perdido", "--destructive"], ["Encontrada", "Encontrado", "--primary"]] as const)("shows %s status as a soft chip like the report detail", (status, label, tono) => {
    const html = render(false, status)
    expect(html).toMatch(new RegExp(`--tono-chip:var\\(${tono}\\)[^>]*><span class="sr-only">Estado: </span><svg[^>]*>.*?</svg>${label}</span>`))
    expect(html).toMatch(/<span class="sr-only">Animal: <\/span><svg[^>]*lucide-paw-print[^>]*>.*?<\/svg>Perro<\/span>/)
    expect(html).toContain(`Perro ${label.toLowerCase()}`)
  })

  it("shows the publication date with its age, like the report detail", () => {
    expect(render(false)).toMatch(/Publicada el día <time[^>]*>1 de nov de 2026<\/time> <span class="font-bold">\(hace \d+ días?\)<\/span>/)
  })

  it("puts share in a labeled action bar below the photo", () => {
    const html = render(false)
    expect(html).toMatch(/role="group" aria-label="Acciones sobre la publicación"[\s\S]*?aria-label="Compartir publicación"[^>]*><svg[^>]*lucide-share2[\s\S]*?<\/svg>Compartir<\/button>/)
  })

  it("shows public pet information and sharing without owner controls", () => {
    const html = render(false)
    expect(html).toContain("Collar rojo")
    expect(html).toContain('href="tel:123456"')
    expect(html).toContain("Compartir")
    expect(html).toContain("Detalle de la mascota")
    expect(html).toContain('href="/reportes?vista=mascotas"')
    expect(html).toContain('alt="Foto de perro"')
    expect(html).not.toContain("Ubicación")
    expect(html).not.toContain("Prioridad")
    expect(html).not.toContain("Comentarios")
    expect(html).not.toContain("Marcar encontrada")
    expect(html).not.toContain("Retirar publicación")
  })

  it("returns to the exact filtered pet list when its return URL is present", () => {
    navigationMocks.returnTo = "/reportes?vista=mascotas&tipo=perro&estadoMascota=Perdida&searchMascota=collar"
    const html = render(false)
    navigationMocks.returnTo = null
    expect(html).toContain('href="/reportes?vista=mascotas&amp;tipo=perro&amp;estadoMascota=Perdida&amp;searchMascota=collar"')
  })

  it("shows the location card only for actual coordinates", () => {
    const html = renderToStaticMarkup(createElement(DetalleMascota, { pet: { ...pet, coordinates: [-34, -58] }, isOwner: false }))
    expect(html).toContain("Ubicación")
    expect(html).toContain('href="#mascota-ubicacion"')
    expect(html).toContain('href="/mapa"')
  })

  it("offers only the appropriate actions for the owner and current status", () => {
    expect(render(true)).toContain("Marcar encontrada")
    expect(render(true)).toContain("Retirar publicación")
    expect(render(true, "Encontrada")).not.toContain("Marcar encontrada")
    expect(render(true, "Encontrada")).not.toContain("Retirar publicación")
  })

  it("shows owner actions with their labels in the action bar", () => {
    const html = render(true)
    expect(html).toMatch(/aria-label="Acciones sobre la publicación"[\s\S]*?>Compartir<\/button>[\s\S]*?<svg[^>]*lucide-circle-check[\s\S]*?<\/svg>Marcar encontrada<\/button>[\s\S]*?aria-label="Retirar publicación"[^>]*><svg[^>]*lucide-trash2[\s\S]*?<\/svg>Retirar<\/button>/)
  })

  it("offers editing to administrators independently of ownership and status", () => {
    for (const status of ["Perdida", "Encontrada"] as const) {
      const html = renderToStaticMarkup(createElement(DetalleMascota, { pet: { ...pet, status }, isOwner: false, isAdmin: true }))
      expect(html).toContain('aria-label="Editar publicación"')
      // S8 y S14: administración puede editar, corregir el estado o retirar la publicación.
      expect(html).toContain('aria-label="Retirar publicación"')
    }
    expect(render(false)).not.toContain('aria-label="Editar publicación"')
  })
})
