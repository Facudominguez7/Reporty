import { createElement, type ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("next/dynamic", () => ({ default: () => () => null }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock("./actions", () => ({ crearMascotaAction: vi.fn() }))
vi.mock("@/components/ui/dialog", () => {
  const Container = ({ children }: { children: ReactNode }) => createElement("div", null, children)
  return { Dialog: Container, DialogContent: Container, DialogDescription: Container, DialogHeader: Container, DialogTitle: Container }
})

import { PetModerationDialog } from "./formulario-mascota"

describe("pet moderation result dialog", () => {
  it.each([
    ["REJECTED", "La foto no fue aprobada", "La foto no cumple las normas de contenido y no se publicó."],
    ["REVIEW", "Revisión pendiente", "La foto quedó privada y pendiente de revisión administrativa. No la vuelvas a enviar."],
    ["REVIEW", "Revisión pendiente", "No pudimos guardar la foto para revisión. La publicación no está disponible y necesita revisión administrativa."],
    ["PENDING", "Publicación pendiente", "La foto fue aprobada, pero la publicación quedó pendiente. No la vuelvas a enviar; necesita revisión administrativa."],
  ] as const)("shows %s without claiming publication", (moderation, title, message) => {
    const html = renderToStaticMarkup(createElement(PetModerationDialog, { moderation, message, open: true, onOpenChange: () => {} }))
    expect(html).toContain(title)
    expect(html).toContain(message)
    expect(html).not.toContain("Mascota publicada en Reporty")
    expect(html).not.toContain("Ver la publicación")
  })
})
