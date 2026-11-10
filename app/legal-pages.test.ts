import { readFileSync } from "node:fs"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import PrivacidadPage, { metadata as privacidadMetadata } from "./privacidad/page"
import TerminosPage, { metadata as terminosMetadata } from "./terminos/page"

const privacidad = renderToStaticMarkup(createElement(PrivacidadPage))
const terminos = renderToStaticMarkup(createElement(TerminosPage))

describe("privacy policy page", () => {
  it("names who is responsible for the data and how to reach them", () => {
    expect(privacidad).toContain("Facundo Diaz Dominguez")
    expect(privacidad).toContain("Octavio Duarte")
    expect(privacidad).toContain('href="mailto:contacto@reporty.com.ar"')
  })

  it("lists the data collected and the services that process it", () => {
    for (const text of ["ubicación", "fotos", "Supabase", "Hostinger", "Resend", "Google Analytics"]) {
      expect(privacidad).toContain(text)
    }
  })

  it("explains what donation data is kept, that Mercado Pago processes the payment and that donations are not public", () => {
    expect(privacidad).toContain("<strong>Tus donaciones:</strong>")
    expect(privacidad).toContain("<strong>Mercado Pago:</strong>")
    expect(privacidad).toContain("Las donaciones no son públicas")
  })

  it("includes the access-rights notice required by Ley 25.326", () => {
    expect(privacidad).toContain("Ley N° 25.326")
    expect(privacidad).toContain("en forma gratuita a intervalos no inferiores a seis meses")
    expect(privacidad).toContain("AGENCIA DE ACCESO A LA INFORMACIÓN PÚBLICA")
  })

  it("has its own title and canonical URL and can be indexed", () => {
    expect(privacidadMetadata.title).toBe("Política de privacidad")
    expect(privacidadMetadata.alternates).toEqual({ canonical: "/privacidad" })
    expect(privacidadMetadata.robots).toBeUndefined()
  })
})

describe("terms page", () => {
  it("names the people behind Reporty and the contact address", () => {
    expect(terminos).toContain("Facundo Diaz Dominguez")
    expect(terminos).toContain("Octavio Duarte")
    expect(terminos).toContain('href="mailto:contacto@reporty.com.ar"')
  })

  it("says Reporty is not an official municipal channel and links to the privacy policy", () => {
    expect(terminos).toContain("no es un canal oficial de la Municipalidad de Posadas")
    expect(terminos).toContain('href="/privacidad"')
  })

  it("has a donations section: voluntary, paid through Mercado Pago, with no reward and not tax deductible", () => {
    expect(terminos).toContain('id="donaciones"')
    expect(terminos).toContain("Las donaciones son voluntarias")
    expect(terminos).toContain("Mercado Pago")
    expect(terminos).toContain("no dan puntos")
    expect(terminos).toContain("no son deducibles")
  })

  it("has its own title and canonical URL and can be indexed", () => {
    expect(terminosMetadata.title).toBe("Términos y condiciones")
    expect(terminosMetadata.alternates).toEqual({ canonical: "/terminos" })
    expect(terminosMetadata.robots).toBeUndefined()
  })
})

describe("sign-up form", () => {
  it("links the terms and the privacy policy instead of the home page", () => {
    const source = readFileSync(new URL("./auth/page.tsx", import.meta.url), "utf8")

    expect(source).toMatch(/href="\/terminos"[^>]*>términos y condiciones</)
    expect(source).toMatch(/href="\/privacidad"[^>]*>política de privacidad</)
  })
})

describe("donate page", () => {
  it("links the donation terms", () => {
    const source = readFileSync(new URL("./donar/page.tsx", import.meta.url), "utf8")

    expect(source).toMatch(/href="\/terminos#donaciones"[^>]*>\s*términos de las donaciones/)
  })
})
