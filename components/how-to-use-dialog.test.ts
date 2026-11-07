import { createElement, type ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/components/ui/dialog", async () => {
  const React = await import("react")
  const Wrapper = ({ children }: { children?: ReactNode }) => React.createElement("div", null, children)
  return {
    Dialog: Wrapper,
    DialogClose: Wrapper,
    DialogContent: Wrapper,
    DialogDescription: Wrapper,
    DialogFooter: Wrapper,
    DialogHeader: Wrapper,
    DialogTitle: Wrapper,
    DialogTrigger: Wrapper,
  }
})

import { HowToUseDialog } from "./how-to-use-dialog"

describe("HowToUseDialog", () => {
  it("introduces incident and lost-pet flows from the shared header help", () => {
    const html = renderToStaticMarkup(createElement(HowToUseDialog))
    expect(html).toContain("mascotas perdidas")
    expect(html).toContain("incidentes urbanos")
  })

  it("shows pet-specific guidance while the map is on the pets layer", () => {
    const html = renderToStaticMarkup(createElement(HowToUseDialog, { layer: "mascotas" }))
    expect(html.match(/<li/g)).toHaveLength(4)
    expect(html).toContain("teléfono disponible")
  })
})
