import { readFileSync } from "node:fs"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { ComparadorFotos, type FotoComparada } from "./comparador-fotos"

const antes: FotoComparada = {
  src: "https://ejemplo.test/antes.webp",
  alt: "Foto original del reporte, publicada por octiduarte el 12/11/2026",
  fecha: "2026-11-12T10:00:00",
}

const despues: FotoComparada = {
  src: "https://ejemplo.test/despues.webp",
  alt: "Foto de la reparación informada por Marisa Bogado el 28/11/2026",
  fecha: "2026-11-28T12:45:00Z",
}

/** Renderiza el comparador tal como lo pintan la tarjeta del reporte y la hoja. */
function renderizar(fotoAntes: FotoComparada | null = antes) {
  return renderToStaticMarkup(createElement(ComparadorFotos, { antes: fotoAntes, despues }))
}

describe("comparador horizontal «Antes / Después»", () => {
  it("rotula cada foto con su nombre y la fecha que se conoce", () => {
    const html = renderizar()

    expect(html).toContain("Antes · 12 nov")
    expect(html).toContain("Después · 28 nov")
    // El nombre accesible describe qué foto es, quién la publicó y cuándo.
    expect(html).toContain('alt="Foto original del reporte, publicada por octiduarte el 12/11/2026"')
    expect(html).toContain('alt="Foto de la reparación informada por Marisa Bogado el 28/11/2026"')
  })

  it("superpone las dos capas y recorta la del después con el corte elegido", () => {
    const html = renderizar()

    expect(html).toContain("https://ejemplo.test/antes.webp")
    expect(html).toContain("https://ejemplo.test/despues.webp")
    expect(html).toContain("clip-path:inset(0 0 0 50%)")
  })

  it("pone el deslizador sobre la foto, con nombre accesible y texto del corte", () => {
    const html = renderizar()

    expect(html).toMatch(/<input[^>]*type="range"/)
    expect(html).toContain('aria-label="Comparar la foto original con la foto de la reparación"')
    expect(html).toContain('aria-valuetext="Mostrando el 50 % de la foto original"')
    // Recorrido completo con el teclado: flechas, Inicio y Fin sobre el rango nativo.
    expect(html).toMatch(/<input[^>]*type="range"[^>]*min="0"/)
    expect(html).toMatch(/<input[^>]*type="range"[^>]*max="100"/)
    expect(html).toMatch(/<input[^>]*type="range"[^>]*step="1"/)
    expect(html).not.toMatch(/<input[^>]*type="range"[^>]*(disabled|readonly|tabindex="-1")/)
    // El control cubre la foto y no bloquea el desplazamiento vertical táctil.
    expect(html).toMatch(/<input[^>]*class="[^"]*absolute inset-0[^"]*opacity-0/)
    expect(html).toMatch(/<input[^>]*class="[^"]*touch-pan-y/)
    // La línea y la manija son decorativas: el texto ya nombra cada foto.
    expect(html).toMatch(/data-manija-comparacion[^>]*aria-hidden="true"/)
    expect(html).toMatch(/<span[^>]*aria-hidden="true"[^>]*class="[^"]*inset-y-0 w-0\.5/)
    // El foco del teclado se ve aunque el control sea transparente.
    expect(html).toMatch(/class="[^"]*focus-within:ring-2/)
  })

  it("explica cómo comparar y asocia esa ayuda con el control", () => {
    const html = renderizar()
    const ayuda = /<p id="([^"]+)" class="[^"]*text-xs text-muted-foreground">Deslizá para comparar el antes y el después\.<\/p>/.exec(html)

    expect(html).toContain("Deslizá para comparar el antes y el después.")
    expect(ayuda).not.toBeNull()
    expect(html).toContain(`aria-describedby="${ayuda?.[1]}"`)
  })

  it("no anima la comparación para quien prefiere menos movimiento", () => {
    const html = renderizar()

    expect(html).not.toMatch(/animate-|transition-all|transition-transform|duration-/)
  })

  it("muestra la foto del después sola cuando el reporte no tiene foto original", () => {
    const html = renderizar(null)

    expect(html).toContain("https://ejemplo.test/despues.webp")
    expect(html).toContain('alt="Foto de la reparación informada por Marisa Bogado el 28/11/2026"')
    expect(html).not.toContain("https://ejemplo.test/antes.webp")
    expect(html).not.toContain('type="range"')
    expect(html).not.toContain("Después ·")
  })

  it("sigue rotulando la foto cuando no se conoce su fecha", () => {
    const html = renderizar({ ...antes, fecha: null })

    expect(html).toContain(">Antes<")
  })
})

describe("una sola implementación compartida", () => {
  it("la hoja de la evidencia y la tarjeta del reporte usan este comparador", () => {
    const hoja = readFileSync(new URL("./evidencia-reparacion.tsx", import.meta.url), "utf8")
    const tarjeta = readFileSync(new URL("../../app/reportes/[id]/reporte-detalle-client.tsx", import.meta.url), "utf8")

    expect(hoja).toContain("ComparadorFotos")
    expect(tarjeta).toContain("ComparadorFotos")
    // Ninguna de las dos vuelve a escribir a mano el control de comparación.
    expect(hoja).not.toContain('type="range"')
    expect(tarjeta).not.toContain('type="range"')
  })
})
