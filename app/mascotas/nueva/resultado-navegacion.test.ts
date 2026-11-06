import { Children, isValidElement, type ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ states: [] as unknown[], index: 0, push: vi.fn(), refs: [] as Array<{ current: unknown }>, refIndex: 0 }))
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useState: (initial: unknown) => [mocks.states[mocks.index++] ?? initial, vi.fn()],
  useRef: (initial: unknown) => mocks.refs[mocks.refIndex++] ??= { current: initial },
  useEffect: vi.fn(),
}))
vi.mock("next/dynamic", () => ({ default: () => () => null }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push, refresh: vi.fn() }) }))
vi.mock("./actions", () => ({ crearMascotaAction: vi.fn() }))

import { FormularioMascota, PetModerationDialog } from "./formulario-mascota"
import { Dialog } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

function find(node: ReactNode, type: unknown): Array<Record<string, any>> {
  if (!isValidElement(node)) return Array.isArray(node) ? node.flatMap((child) => find(child, type)) : []
  const props = node.props as Record<string, any>
  return [...(node.type === type ? [props] : []), ...Children.toArray(props.children).flatMap((child) => find(child, type))]
}

describe("pet result navigation", () => {
  beforeEach(() => { mocks.states = []; mocks.index = 0; mocks.refs = []; mocks.refIndex = 0; mocks.push.mockReset() })

  it.each(["APPROVED", "PENDING", "REVIEW", "REJECTED"] as const)("redirects once when %s closes through the dialog or button", (moderation) => {
    mocks.states[12] = moderation
    mocks.states[13] = "Resultado"
    mocks.states[14] = moderation === "APPROVED" ? { mascotaId: 1, pointsAwarded: 0 } : null
    mocks.states[15] = true
    const tree = FormularioMascota()
    const props = moderation === "APPROVED" ? find(tree, Dialog)[0] : find(tree, PetModerationDialog)[0]
    props.onOpenChange(true)
    expect(mocks.push).not.toHaveBeenCalled()
    if (moderation !== "APPROVED") {
      const dialog = PetModerationDialog(props as Parameters<typeof PetModerationDialog>[0])
      find(dialog, Button)[0].onClick()
    } else {
      props.onOpenChange(false)
    }
    props.onOpenChange(false)
    expect(mocks.push).toHaveBeenCalledOnce()
    expect(mocks.push).toHaveBeenCalledWith("/mapa")
  })

  it("does not navigate for the initial form or opening a dialog", () => {
    const tree = FormularioMascota()
    expect(find(tree, PetModerationDialog)).toHaveLength(0)
    expect(mocks.push).not.toHaveBeenCalled()
  })
})
