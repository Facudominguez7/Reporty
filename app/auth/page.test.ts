import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("auth verification and submit group", () => {
  it("keeps its accessible functional grouping and spacing without an outer box", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8")
    const group = source.match(/<div\s+role="group"\s+aria-label="Verificación de seguridad y envío"\s+className="([^"]+)"/)

    expect(group).not.toBeNull()
    expect(group?.[1]).toContain("space-y-3")
    expect(group?.[1]).not.toMatch(/\b(?:border|bg-surface-subtle|p-3)\b/)
    expect(source).toMatch(/<SubmitButton\s+form="formulario-ingreso"/)
  })
})
