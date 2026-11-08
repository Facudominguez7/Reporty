import { createElement, type ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/components/ui/dialog", async () => {
  const React = await import("react")
  const Wrapper = ({ children }: { children?: ReactNode }) => React.createElement("div", null, children)
  return {
    Dialog: ({ open, children }: { open: boolean; children?: ReactNode }) => open ? React.createElement("div", null, children) : null,
    DialogContent: Wrapper,
    DialogDescription: Wrapper,
    DialogFooter: Wrapper,
    DialogHeader: Wrapper,
    DialogTitle: Wrapper,
  }
})

import { MascotasOnboardingModal } from "./onboarding-modal"

describe("MascotasOnboardingModal", () => {
  it("explains the four main actions for the pet map", () => {
    const html = renderToStaticMarkup(createElement(MascotasOnboardingModal, { open: true, onComplete: vi.fn() }))
    expect(html.match(/<li/g)).toHaveLength(4)
    expect(html).toContain("Explorá")
    expect(html).toContain("Contactá")
    expect(html).toContain("Publicá")
  })
})
