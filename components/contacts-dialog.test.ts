import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { ContactRow } from "./contacts-dialog"
import type { ReportContact } from "../lib/report-contacts/contact-actions"

describe("contact directory row", () => {
  it("does not display verification status and preserves the phone action", () => {
    const contact: ReportContact = { id: 1, organization: "Municipio", purpose: "Consulta", channel_type: "phone", channel_value: "3761234567", verification_status: "pending" }
    const pending = renderToStaticMarkup(createElement(ContactRow, { contact }))
    const verified = renderToStaticMarkup(createElement(ContactRow, { contact: { ...contact, verification_status: "verified" } }))
    expect(pending).not.toContain("Contacto sin verificar")
    expect(verified).not.toContain("Contacto sin verificar")
    expect(pending).toContain('href="tel:3761234567"')
  })
})
