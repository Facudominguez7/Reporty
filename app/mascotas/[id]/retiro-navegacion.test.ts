import { Children, isValidElement, type ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), retire: vi.fn(), setters: [] as Array<ReturnType<typeof vi.fn>> }))
vi.mock("react", async (original) => ({ ...await original<typeof import("react")>(), useState: (initial: unknown) => { const setter = vi.fn(); mocks.setters.push(setter); return [initial, setter] } }))
vi.mock("next/dynamic", () => ({ default: () => () => null }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }) }))
vi.mock("./actions", () => ({ marcarMascotaEncontradaAction: vi.fn(), retirarMascotaDetalleAction: mocks.retire }))

import { DetalleMascota } from "./detalle-mascota"
import { AlertDialogAction } from "@/components/ui/alert-dialog"

function find(node: ReactNode): Array<Record<string, any>> {
  if (!isValidElement(node)) return Array.isArray(node) ? node.flatMap(find) : []
  const props = node.props as Record<string, any>
  return [...(node.type === AlertDialogAction ? [props] : []), ...Children.toArray(props.children).flatMap(find)]
}

describe("owner withdrawal navigation", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.setters = [] })
  it.each(["success", "failure", "exception"])("handles %s", async (outcome) => {
    if (outcome === "exception") mocks.retire.mockRejectedValueOnce(new Error("offline"))
    else mocks.retire.mockResolvedValueOnce(outcome === "success" ? { success: true, data: { message: "Retirada" } } : { success: false, error: "No autorizado" })
    const tree = DetalleMascota({ pet: { id: 12, species: "Perro", status: "Perdida", description: "Collar", createdAt: "2026-11-01", phone: "123", image: "/api/mascotas/12/foto" }, isOwner: true })
    await find(tree).find((props) => props.children === "Retirar")!.onClick()
    expect(mocks.retire).toHaveBeenCalledWith(12)
    if (outcome === "success") expect(mocks.push).toHaveBeenCalledWith("/mapa")
    else {
      expect(mocks.push).not.toHaveBeenCalled()
      expect(mocks.setters[0]).toHaveBeenLastCalledWith(outcome === "failure" ? "No autorizado" : "No pudimos retirar la publicación. Intentá nuevamente.")
    }
  })
})
