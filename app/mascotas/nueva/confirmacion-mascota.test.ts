import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ReactElement } from "react"

const hooks = vi.hoisted(() => ({ values: [] as unknown[], index: 0, action: vi.fn(), push: vi.fn() }))
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useState: (initial: unknown) => {
    const index = hooks.index++
    if (!(index in hooks.values)) hooks.values[index] = initial
    return [hooks.values[index], (value: unknown) => { hooks.values[index] = value }]
  },
  useRef: (initial: unknown) => {
    const index = hooks.index++
    if (!(index in hooks.values)) hooks.values[index] = { current: initial }
    return hooks.values[index]
  },
  useEffect: () => {},
}))
vi.mock("next/dynamic", () => ({ default: () => () => null }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: hooks.push, refresh: vi.fn() }) }))
vi.mock("./actions", () => ({ crearMascotaAction: hooks.action }))
vi.mock("@/lib/media/optimize-report-image", () => ({ optimizeReportImage: async (file: File) => ({ file }) }))

import { FormularioMascota } from "./formulario-mascota"
import { AlertDialog, AlertDialogAction, AlertDialogCancel } from "@/components/ui/alert-dialog"

function render() {
  hooks.index = 0
  return FormularioMascota() as ReactElement
}

function find(node: unknown, predicate: (element: ReactElement<any>) => boolean): ReactElement<any> | undefined {
  if (Array.isArray(node)) {
    for (const child of node) { const match = find(child, predicate); if (match) return match }
  } else if (node && typeof node === "object" && "props" in node) {
    const element = node as ReactElement<any>
    if (predicate(element)) return element
    return find(element.props.children, predicate)
  }
}

describe("pet submission confirmation", () => {
  afterEach(() => vi.unstubAllGlobals())
  beforeEach(() => {
    hooks.values = []
    hooks.action.mockReset()
    hooks.push.mockReset()
    vi.stubGlobal("URL", { createObjectURL: () => "blob:test", revokeObjectURL: () => {} })
  })

  it("validates first, cancels without creating, and guards repeated confirmation", async () => {
    let tree = render()
    expect(find(tree, (el) => el.props.href === "/reportes" && el.props.children === "Cancelar")).toBeDefined()
    const submit = () => find(tree, (el) => el.type === "form")!.props.onSubmit({ preventDefault() {} })
    submit()
    tree = render()
    expect(find(tree, (el) => el.type === AlertDialog)!.props.open).toBe(false)

    await find(tree, (el) => el.props.id === "foto-mascota" && el.type === "input")!.props.onChange({ target: { files: [new File(["photo"], "pet.jpg", { type: "image/jpeg" })], value: "" } })
    find(tree, (el) => el.type === "input" && el.props.name === "tipo-animal" && el.props.value === "perro")!.props.onChange()
    find(tree, (el) => el.props.id === "descripcion-mascota")!.props.onChange({ target: { value: "Brown dog" } })
    find(tree, (el) => el.props.id === "telefono-mascota")!.props.onChange({ target: { value: "123456" } })
    find(tree, (el) => el.props.id === "confirmar-telefono-publico")!.props.onChange({ target: { checked: true } })
    find(tree, (el) => el.props.onLocationSelect)!.props.onLocationSelect(-27, -55)
    tree = render()
    submit()
    tree = render()
    expect(find(tree, (el) => el.type === AlertDialog)!.props.open).toBe(true)
    expect(hooks.action).not.toHaveBeenCalled()
    expect(find(tree, (el) => el.type === AlertDialogCancel)).toBeDefined()
    find(tree, (el) => el.type === AlertDialog)!.props.onOpenChange(false)
    tree = render()
    expect(find(tree, (el) => el.type === AlertDialog)!.props.open).toBe(false)
    expect(hooks.action).not.toHaveBeenCalled()
    submit()
    tree = render()
    let finish!: (value: unknown) => void
    hooks.action.mockReturnValue(new Promise((resolve) => { finish = resolve }))
    const confirm = find(tree, (el) => el.type === AlertDialogAction)!.props.onClick
    const first = confirm()
    await confirm()
    expect(hooks.action).toHaveBeenCalledTimes(1)
    tree = render()
    expect(find(tree, (el) => el.type === AlertDialog)!.props.open).toBe(false)
    finish({ success: true, data: { moderation: "PENDING", message: "Pending" } })
    await first
    tree = render()
    const result = find(tree, (el) => el.props.open === true && el.props.message === "Pending")
    expect(result).toBeDefined()
    result!.props.onOpenChange(false)
    expect(hooks.push).toHaveBeenCalledWith("/mapa")
  })
})
