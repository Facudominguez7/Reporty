import { readFileSync } from "node:fs"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import { EnlacesLegales } from "./enlaces-legales"

const ruta = vi.hoisted(() => ({ valor: "/reportes" }))
vi.mock("next/navigation", () => ({ usePathname: () => ruta.valor }))

/** Renderiza los enlaces legales como si se estuviera en `pathname`. */
function renderizarEn(pathname: string) {
  ruta.valor = pathname
  return renderToStaticMarkup(createElement(EnlacesLegales))
}

describe("EnlacesLegales", () => {
  it("muestra Términos y Privacidad al final de las páginas con encabezado", () => {
    for (const pathname of ["/reportes", "/dashboard", "/mis-reportes", "/comunidad", "/donar"]) {
      const markup = renderizarEn(pathname)
      expect(markup).toMatch(/<a [^>]*href="\/terminos"[^>]*>Términos y condiciones<\/a>/)
      expect(markup).toMatch(/<a [^>]*href="\/privacidad"[^>]*>Política de privacidad<\/a>/)
    }
  })

  it("no se muestra en el mapa, el inicio, el ingreso ni el panel admin", () => {
    for (const pathname of ["/", "/mapa", "/auth", "/admin", "/admin/donaciones"]) {
      expect(renderizarEn(pathname)).toBe("")
    }
  })

  it("se monta en el layout raíz, dentro del contenido principal", () => {
    const layout = readFileSync(new URL("../../app/layout.tsx", import.meta.url), "utf8")
    expect(layout).toMatch(/<main id="main-content"[^>]*>\s*\{children\}\s*<EnlacesLegales \/>\s*<\/main>/)
  })
})

describe("enlace a los términos en el mapa", () => {
  it("se muestra en /mapa por encima de la navegación inferior, sin tocar la atribución de Leaflet", () => {
    const mapa = readFileSync(new URL("../../app/mapa/mapa-client.tsx", import.meta.url), "utf8")
    const leaflet = readFileSync(new URL("../leaflet-map.tsx", import.meta.url), "utf8")
    expect(mapa).toMatch(/<Link\s+href="\/terminos"\s+className="[^"]*bottom-\[calc\(var\(--bottom-nav-space\)[^"]*"[^>]*>\s*Términos y condiciones\s*<\/Link>/)
    expect(leaflet).not.toContain("addAttribution")
  })
})
