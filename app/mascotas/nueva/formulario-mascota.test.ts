import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("formulario de publicación de mascota", () => {
  const source = readFileSync(new URL("./formulario-mascota.tsx", import.meta.url), "utf8")

  it("requires photo, species, description, coordinates and public phone disclosure", () => {
    expect(source).toContain('htmlFor="foto-mascota"')
    expect(source).toContain('aria-required="true"')
    expect(source).not.toContain('type="file" accept="image/jpeg,image/png,image/webp" required')
    expect(source).toContain('if (!image) {')
    expect(source).toContain("Adjuntá una foto para publicar la mascota.")
    expect(source).toContain('value="perro"')
    expect(source).toContain('value="gato"')
    expect(source).toContain('value="otro"')
    expect(source).toContain('htmlFor="descripcion-mascota"')
    expect(source).toContain('htmlFor="telefono-mascota"')
    expect(source).toContain("cualquier persona podrá verlo")
    expect(source).toContain("Última ubicación conocida")
    expect(source).not.toMatch(/name=["'](?:nombre|fechaPerdida|estado)["']/)
  })

  it("binds only the action contract and distinguishes moderation outcomes", () => {
    expect(source).toContain('payload.set("tipoAnimal"')
    expect(source).toContain('payload.set("descripcion"')
    expect(source).toContain('payload.set("lat"')
    expect(source).toContain('payload.set("lon"')
    expect(source).toContain('payload.set("telefono"')
    expect(source).toContain('payload.set("image"')
    expect(source).not.toContain('payload.set("estado"')
    expect(source).not.toContain('payload.set("nombre"')
    expect(source).toContain('result.data.moderation === "APPROVED"')
    expect(source).toContain('moderation === "REVIEW" &&')
    expect(source).toContain('moderation === "REJECTED" &&')
    expect(source).toContain("Crear otra publicación")
    expect(source).toContain("disabled={busy || optimizingImage || moderation !== null}")
    expect(source).toContain('moderation === "APPROVED" &&')
    expect(source).toContain("result.error")
  })
})
