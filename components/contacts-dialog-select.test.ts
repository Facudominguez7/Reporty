import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("contacts dialog filters", () => {
  const source = readFileSync(new URL("./contacts-dialog.tsx", import.meta.url), "utf8")

  it("uses the incident form select pattern for both labelled filters", () => {
    expect(source.match(/<SelectTrigger /g)).toHaveLength(2)
    expect(source.match(/<SelectContent className="w-full">/g)).toHaveLength(2)
    expect(source).not.toContain("<select")
    expect(source).toContain('htmlFor="contact-city"')
    expect(source).toContain('id="contact-city" className="w-full min-w-0"')
    expect(source).toContain('htmlFor="contact-category"')
    expect(source).toContain('id="contact-category" className="w-full min-w-0"')
  })

  it("retains filter choices and clears stale results when either changes", () => {
    for (const city of ["Posadas", "Candelaria", "Garupá"]) expect(source).toContain(`<SelectItem value="${city}">${city}</SelectItem>`)
    for (const category of ["Alumbrado", "Bache", "Arbol caido", "Residuos", "Seguridad", "Semaforo", "Agua", "Otros"]) expect(source).toContain(category)
    expect(source).toContain("setResult(null); setMunicipality(value)")
    expect(source).toContain("setResult(null); setCategory(value as keyof typeof GROUP_LABELS)")
    expect(source).toContain("getMunicipalityContacts(createClient(), municipality, category)")
  })
})
