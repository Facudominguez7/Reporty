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
  it.each([["Perdida", "Perdido", "bg-destructive"], ["Encontrada", "Encontrado", "bg-primary"]] as const)("styles %s status consistently with its species", (status, label, color) => {
    const html = render(false, status)
    expect(html).toMatch(new RegExp(`class="[^"]*${color}[^"]*"><span[^>]*>Estado</span><span>${label}</span>`))
    expect(html).toContain(`Perro ${label.toLowerCase()}`)
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
    expect(html).toContain("1/11/2026")
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

  it("places an accessible destructive withdrawal icon next to sharing", () => {
    const html = render(true)
    expect(html).toMatch(/aria-label="Compartir publicación"[\s\S]*?<button[^>]*class="[^"]*bg-destructive[^"]*"[^>]*aria-label="Retirar publicación"[^>]*title="Retirar publicación"[^>]*><svg[^>]*lucide-trash2/)
    expect(html).not.toContain(">Retirar publicación</button>")
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
