import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { FiltrosMascotas } from "./filtros-mascotas"

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }), useSearchParams: () => new URLSearchParams("vista=mascotas&tipo=gato") }))
vi.mock("@/components/ui/drawer", () => ({
  Drawer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DrawerTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DrawerContent: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
  DrawerDescription: ({ children, className }: { children: React.ReactNode; className?: string }) => <p className={className}>{children}</p>,
  DrawerTitle: ({ children, className }: { children: React.ReactNode; className?: string }) => <h2 className={className}>{children}</h2>,
}))
describe("pet filter drawer", () => {
  it("offers animal type choices in the shared drawer and reflects the active filter", () => {
    const html = renderToStaticMarkup(<FiltrosMascotas />)
    expect(html).toContain("Filtros (1)")
    expect(html).toContain(">Filtros</h2>")
    expect(html).toContain("Filtrá publicaciones por tipo de animal.")
    expect(html).toContain("text-sm font-semibold tracking-tight md:text-base")
    expect(html).toContain("text-xs text-muted-foreground md:text-sm")
    expect(html).toContain("Aplicar filtros")
    expect(html).toContain('aria-pressed="true"')
    expect(html).toContain("sticky bottom-0")
    expect(html).not.toContain("<select")
    expect(html).toContain("Tipo de animal")
    expect(html).toContain("Todos los animales")
    expect(html).toContain("1 filtro activo")
    expect(html).toContain("1 seleccionado")
    expect(html).toContain("Perro")
    expect(html).toContain("Gato")
    expect(html).toContain("Otro")
    expect(html).not.toContain("Todos los estados")
    expect(html).toContain("bg-secondary text-secondary-foreground")
    expect(html).toContain("size-9")
    expect(html).toContain("sm:size-auto")
    expect(html).toContain('aria-label="Abrir filtros, 1 activos"')
  })
})
