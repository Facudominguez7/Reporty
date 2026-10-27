import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { AuditFiltersForm } from "./audit-filters"

describe("AuditFiltersForm", () => {
  it("keeps the form visible on desktop while collapsed on mobile", () => {
    const html = renderToStaticMarkup(createElement(AuditFiltersForm, { user: "Ana", action: "report_created", days: 7 }))
    expect(html).toContain('class="hidden gap-3')
    expect(html).toContain("md:grid")
    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain('name="usuario"')
    expect(html).toContain('value="Ana"')
    expect(html).not.toContain("<details")
  })
})
