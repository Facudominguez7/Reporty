import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("formulario de publicación de mascota", () => {
  const source = readFileSync(new URL("./formulario-mascota.tsx", import.meta.url), "utf8")

  it("requires photo, species, description, coordinates and public phone disclosure", () => {
    expect(source).toContain('htmlFor="foto-mascota"')
    expect(source).toContain('aria-required="true"')
    expect(source).not.toContain('type="file" accept="image/jpeg,image/png,image/webp" required')
    expect(source).toContain("Adjuntá una foto para publicar la mascota.")
    expect(source).toContain('{ value: "perro", label: "Perro", Icon: Dog }')
    expect(source).toContain('{ value: "gato", label: "Gato", Icon: Cat }')
    expect(source).toContain('{ value: "otro", label: "Otro", Icon: PawPrint }')
    expect(source).toContain('type="radio"')
    expect(source).toContain('name="tipo-animal"')
    expect(source).toContain('checked={tipoAnimal === value}')
    expect(source).toContain('setTipoAnimal("")')
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
    expect(source).toContain("disabled={busy || optimizingImage || moderation !== null || !canSubmit}")
    expect(source).toContain("result.error")
  })

  it("keeps the report-style single image preview, removal and optimization feedback", () => {
    expect(source).toContain('className="grid grid-cols-2 gap-4 md:grid-cols-3"')
    expect(source).toContain('aria-label="Eliminar imagen"')
    expect(source).toContain('onClick={() => { setImage(null); setImagePreview(null) }}')
    expect(source).toContain('disabled={busy || optimizingImage} className="sr-only"')
    expect(source).toContain('role="status" aria-live="polite" className="text-xs text-primary">Optimizando imagen...')
    expect(source).toContain('setImageError(cause instanceof Error ? cause.message')
    expect(source).toContain('URL.revokeObjectURL(imagePreview)')
  })

  it("uses the report loading screen, success dialog and inline required messages", () => {
    expect(source).not.toMatch(/\(obligatori[oa]\)/)
    expect(source).toContain("La IA está analizando tu foto")
    expect(source).toContain('aria-busy="true"')
    expect(source).toContain("<Dialog open={showResultDialog}")
    expect(source).toContain('href={`/mascotas/${createdPet.mascotaId}`}')
    expect(source).toContain('result.data.mascotaId')
    expect(source).toContain('moderation === "PENDING"')
    expect(source).toContain('result.data.message')
    expect(source).toContain("Seleccioná el tipo de animal.")
    expect(source).toContain('aria-describedby={!tipoAnimal ? "tipo-animal-error" : undefined}')
    expect(source).toContain("Completá la descripción de la mascota.")
    expect(source).toContain("Completá el teléfono de contacto.")
    expect(source).toContain("Confirmá que entendés que el teléfono será público.")
  })

  it("opens a result dialog for every successful action without treating pending as published", () => {
    expect(source).toMatch(/setShowResultDialog\(true\)\s+if \(result\.data\.moderation === "APPROVED" && Number\.isSafeInteger\(result\.data\.mascotaId\) && result\.data\.mascotaId! > 0\)/)
    expect(source).toContain('moderation && moderation !== "APPROVED" && <PetModerationDialog')
    expect(source).toContain('result.data.moderation === "APPROVED" && (!Number.isSafeInteger(result.data.mascotaId) || result.data.mascotaId! <= 0) ? "PENDING"')
  })
})
