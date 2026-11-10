import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { InvitacionDonar } from "./invitacion-donar"

describe("InvitacionDonar", () => {
  it("invita a donar después de publicar y lleva a /donar", () => {
    const html = renderToStaticMarkup(createElement(InvitacionDonar))
    expect(html).toContain("Reporty es gratis. Si te sirvió, podés ayudarnos a mantenerlo.")
    expect(html).toMatch(/<a [^>]*href="\/donar"[^>]*>(?:(?!<\/a>).)*Donar a Reporty<\/a>/)
  })
})
