import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import sharp from "sharp"
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
    // Reporty es una iniciativa ciudadana independiente, no una app de gobierno.
    expect(manifest.categories).not.toContain("government")
    expect(manifest.categories).toEqual(expect.arrayContaining(["utilities", "social"]))
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

  it.each(["/favicon_io/maskable-icon-512x512.png", "/favicon_io/maskable-icon-192x192.png"])(
    "%s tiene fondo verde opaco y el logo dentro de la zona segura",
    async (ruta) => {
      // Bubblewrap pone blanco detrás del ícono adaptativo: un fondo transparente esconde el logo.
      const { data, info } = await sharp(rutaPublica(ruta)).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
      const centro = info.width / 2
      const radioSeguro = info.width * 0.4
      for (let y = 0; y < info.height; y++) {
        for (let x = 0; x < info.width; x++) {
          const i = (y * info.width + x) * info.channels
          expect(data[i + 3]).toBe(255)
          if (Math.hypot(x + 0.5 - centro, y + 0.5 - centro) > radioSeguro) {
            expect([data[i], data[i + 1], data[i + 2]]).toEqual([0x2e, 0x7d, 0x5b])
          }
        }
      }
    },
  )
})
