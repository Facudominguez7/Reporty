import { beforeEach, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ values: [] as unknown[], index: 0, save: vi.fn(), refresh: vi.fn() }))
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useRef: (inicial: unknown) => ({ current: inicial }),
  useState: (initial: unknown) => {
    const index = mocks.index++
    if (!(index in mocks.values)) mocks.values[index] = typeof initial === "function" ? (initial as () => unknown)() : initial
    return [mocks.values[index], (value: unknown) => { mocks.values[index] = typeof value === "function" ? (value as (old: unknown) => unknown)(mocks.values[index]) : value }]
  },
}))
vi.mock("next/dynamic", () => ({ default: () => () => null }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }), useSearchParams: () => new URLSearchParams() }))
vi.mock("./actions", () => ({ marcarMascotaEncontradaAction: vi.fn(), retirarMascotaDetalleAction: vi.fn() }))
vi.mock("@/app/dashboard/moderacion/actions", () => ({ editarMascotaAction: mocks.save }))

import { DetalleMascota } from "./detalle-mascota"
import type { MascotaDetail } from "@/database/queries/mascotas/detalle"

const pet: MascotaDetail = { id: 12, species: "Perro", status: "Perdida", description: "Collar rojo", createdAt: "2026-11-01T12:00:00Z", phone: "123456", image: "/photo", coordinates: [-27.3671, -55.8961] }
type Element = { props?: Record<string, any> }
function find(node: any, predicate: (element: Element) => boolean): Element | undefined {
  if (!node || typeof node !== "object") return undefined
  if (Array.isArray(node)) return node.map((child) => find(child, predicate)).find(Boolean)
  return predicate(node) ? node : find(node.props?.children, predicate)
}
function render(isAdmin = true) { mocks.index = 0; return DetalleMascota({ pet, isOwner: false, isAdmin }) }
function edit() { find(render(), (node) => node.props?.["aria-label"] === "Editar publicación")!.props!.onClick() }

beforeEach(() => { mocks.values = []; mocks.index = 0; mocks.save.mockReset(); mocks.refresh.mockReset() })

it("keeps the map and other edits in the draft, and saves the selected coordinates", async () => {
  edit()
  let tree = render()
  find(tree, (node) => node.props?.value === "Collar rojo")!.props!.onChange({ target: { value: "Collar azul" } })
  find(tree, (node) => typeof node.props?.onLocationSelect === "function")!.props!.onLocationSelect(-27.38, -55.9)
  tree = render()
  expect(find(tree, (node) => node.props?.initialLat === -27.38)?.props?.initialLon).toBe(-55.9)
  mocks.save.mockResolvedValue({ exito: true, mensaje: "Guardado" })
  await find(tree, (node) => typeof node.props?.onSave === "function")!.props!.onSave()
  await Promise.resolve()
  expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ descripcion: "Collar azul", lat: -27.38, lon: -55.9, telefono: "123456", estado: "perdida" }))
  expect(mocks.refresh).toHaveBeenCalled()
})

it("discards location changes on cancel and does not offer editing to non-admins", () => {
  expect(find(render(false), (node) => node.props?.["aria-label"] === "Editar publicación")).toBeUndefined()
  edit()
  find(render(), (node) => typeof node.props?.onLocationSelect === "function")!.props!.onLocationSelect(-27.38, -55.9)
  find(render(), (node) => typeof node.props?.onCancel === "function")!.props!.onCancel()
  edit()
  expect(find(render(), (node) => typeof node.props?.onLocationSelect === "function")!.props!.initialLat).toBe(-27.3671)
})

it("shows admin retirement and keeps edit controls inside the pet card", () => {
  edit()
  const tree = render()
  expect(find(tree, (node) => node.props?.["aria-label"] === "Retirar publicación")).toBeDefined()
  expect(find(tree, (node) => node.props?.className?.includes("rounded-xl border border-border/70 bg-card p-4"))).toBeUndefined()
  const card = find(tree, (node) => node.props?.className === "gap-0")!
  expect(find(card, (node) => node.props?.value === "Collar rojo")).toBeDefined()
})
