import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const rutaPublica = (ruta: string) => fileURLToPath(new URL(`../../public${ruta}`, import.meta.url))
const manifest = JSON.parse(readFileSync(rutaPublica("/favicon_io/site.webmanifest"), "utf8"))

describe("manifest web de Reporty", () => {
  it("declara identidad, inicio y alcance estables para PWA y TWA", () => {
    expect(manifest.id).toBe("/")
    expect(manifest.start_url).toBe("/mapa")
    expect(manifest.scope).toBe("/")
    expect(manifest.display).toBe("standalone")
  })

  it("describe la app en español de Argentina", () => {
    expect(manifest.name).toBe("Reporty")
    expect(manifest.short_name).toBe("Reporty")
    expect(manifest.lang).toBe("es-AR")
    expect(manifest.dir).toBe("ltr")
    expect(manifest.description).toMatch(/Posadas/)
    expect(manifest.categories).toContain("government")
  })

  it("mantiene los colores de marca", () => {
    expect(manifest.theme_color).toBe("#2e7d5b")
    expect(manifest.background_color).toBe("#2e7d5b")
  })

  it("ofrece íconos de 192 y 512, normales y maskable, y todos existen", () => {
    const claves = manifest.icons.map((icono: { sizes: string; purpose?: string }) => `${icono.sizes}:${icono.purpose ?? "any"}`)
    expect(claves).toEqual(expect.arrayContaining(["192x192:any", "512x512:any", "192x192:maskable", "512x512:maskable"]))
    for (const icono of manifest.icons) expect(existsSync(rutaPublica(icono.src))).toBe(true)
  })

  it("expone los mismos atajos que la TWA, con rutas dentro del alcance", () => {
    const atajos = manifest.shortcuts.map((atajo: { name: string; url: string }) => [atajo.name, atajo.url])
    expect(atajos).toEqual([
      ["Mapa", "/mapa"],
      ["Reportes", "/reportes"],
      ["Crear reporte", "/reportes/nuevo"],
    ])
    for (const atajo of manifest.shortcuts) {
      for (const icono of atajo.icons) expect(existsSync(rutaPublica(icono.src))).toBe(true)
    }
  })
})
