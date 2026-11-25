import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import { CACHE_HTML, sinCacheCompartidaDeHtml } from "./cache-html"

/** Respuesta como la que arma OpenNext para una página. */
function respuesta(cacheControl: string, tipo = "text/html; charset=utf-8") {
  return new Response("<html>hola</html>", {
    status: 200,
    headers: { "content-type": tipo, "cache-control": cacheControl, "x-nextjs-cache": "HIT" },
  })
}

describe("sinCacheCompartidaDeHtml", () => {
  it("una página estática deja de decirle a las cachés compartidas que la guarden un año", async () => {
    const final = sinCacheCompartidaDeHtml(respuesta("s-maxage=31536000"))
    expect(final.headers.get("cache-control")).toBe(CACHE_HTML)
    expect(CACHE_HTML).toBe("public, max-age=0, must-revalidate")
    expect(final.status).toBe(200)
    expect(final.headers.get("x-nextjs-cache")).toBe("HIT")
    expect(await final.text()).toBe("<html>hola</html>")
  })

  it("una página ISR deja de permitir 30 días de contenido viejo", () => {
    const final = sinCacheCompartidaDeHtml(respuesta("s-maxage=2, stale-while-revalidate=2592000"))
    expect(final.headers.get("cache-control")).toBe(CACHE_HTML)
  })

  it("no toca una página dinámica que ya es privada", () => {
    const original = respuesta("private, no-cache, no-store, max-age=0, must-revalidate")
    expect(sinCacheCompartidaDeHtml(original)).toBe(original)
  })

  it("no toca lo que no es HTML, como los chunks inmutables o las respuestas de RSC", () => {
    const chunk = respuesta("public, max-age=31536000, immutable", "application/javascript")
    const rsc = respuesta("s-maxage=31536000", "text/x-component")
    expect(sinCacheCompartidaDeHtml(chunk)).toBe(chunk)
    expect(sinCacheCompartidaDeHtml(rsc)).toBe(rsc)
  })

  it("el Worker aplica la regla a cada respuesta de OpenNext", () => {
    const worker = readFileSync(new URL("../../custom-worker.ts", import.meta.url), "utf8")
    expect(worker).toMatch(/sinCacheCompartidaDeHtml\(await app\.fetch\(/)
  })
})
