import { createElement, forwardRef, Fragment } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("@radix-ui/react-dialog", () => ({
  Root: ({ children }: { children: React.ReactNode }) => createElement(Fragment, null, children),
  Trigger: ({ children }: { children: React.ReactNode }) => createElement("button", null, children),
  Portal: ({ children }: { children: React.ReactNode }) => createElement(Fragment, null, children),
  Overlay: forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(function MockOverlay(props, ref) {
    return createElement("div", { ...props, ref, "data-testid": "dialog-overlay" })
  }),
  Content: forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(function MockContent(props, ref) {
    return createElement("div", { ...props, ref, "data-testid": "dialog-content" })
  }),
  Close: ({ children }: { children: React.ReactNode }) => createElement("button", null, children),
  Title: ({ children }: { children: React.ReactNode }) => createElement("h2", null, children),
  Description: ({ children }: { children: React.ReactNode }) => createElement("p", null, children),
}))

import { Dialog, DialogContent } from "./dialog"

function renderDialog(overlayClassName?: string, contentClassName = overlayClassName) {
  return renderToStaticMarkup(createElement(
    Dialog,
    { open: true },
    createElement(DialogContent, { overlayClassName, className: contentClassName, showClose: false }, "Content"),
  ))
}

function elementWithTestId(html: string, testId: string) {
  return html.match(new RegExp(`<div\\b(?=[^>]*data-testid="${testId}")[^>]*>`))?.[0] ?? ""
}

describe("DialogContent layering", () => {
  it("keeps the existing default layer for dialogs without an override", () => {
    const html = renderDialog()
    expect(elementWithTestId(html, "dialog-overlay")).toContain("z-50")
    expect(elementWithTestId(html, "dialog-content")).toContain("z-50")
  })

  it("layers content above its scrim and both above fixed navigation", () => {
    const html = renderDialog("z-[70]", "z-[80]")
    const overlay = elementWithTestId(html, "dialog-overlay")
    const content = elementWithTestId(html, "dialog-content")
    expect(overlay).toContain("z-[70]")
    expect(content).toContain("z-[80]")
    expect(overlay).not.toContain("z-50")
    expect(content).not.toContain("z-50")
  })
})
