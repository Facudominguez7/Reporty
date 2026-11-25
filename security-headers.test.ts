import { afterEach, describe, expect, it, vi } from "vitest"

import nextConfig from "./next.config.mjs"

describe("security headers", () => {
  it("hides the framework fingerprint", () => {
    expect(nextConfig.poweredByHeader).toBe(false)
  })

  it("sends the baseline security headers on every route", async () => {
    const rules = (await nextConfig.headers?.()) ?? []
    const global = rules.find((rule: { source: string }) => rule.source === "/:path*")
    expect(global).toBeDefined()
    const headers = Object.fromEntries(
      (global?.headers ?? []).map((header: { key: string; value: string }) => [header.key.toLowerCase(), header.value]),
    )

    expect(headers["x-content-type-options"]).toBe("nosniff")
    expect(headers["x-frame-options"]).toBe("DENY")
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin")
    expect(headers["permissions-policy"]).toContain("geolocation=(self)")
    expect(headers["strict-transport-security"]).toContain("max-age=")
    expect(headers["content-security-policy-report-only"]).toContain("frame-ancestors 'none'")
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("en producción cachea inmutablemente los chunks estáticos con hash, sin aflojar seguridad", async () => {
    vi.stubEnv("NODE_ENV", "production")
    const rules = (await nextConfig.headers?.()) ?? []
    const estaticos = rules.find((rule: { source: string }) => rule.source === "/_next/static/:path*")

    expect(estaticos).toBeDefined()
    const cabeceras = Object.fromEntries(
      (estaticos?.headers ?? []).map((header: { key: string; value: string }) => [
        header.key.toLowerCase(),
        header.value,
      ]),
    )
    expect(cabeceras["cache-control"]).toContain("immutable")
    expect(cabeceras["cache-control"]).not.toContain("no-store")
    expect(cabeceras["x-content-type-options"]).toBe("nosniff")
  })

  it("en desarrollo no marca los estáticos como inmutables: conservan el nombre aunque cambien", async () => {
    vi.stubEnv("NODE_ENV", "development")
    const rules = (await nextConfig.headers?.()) ?? []

    const cabecerasCache = rules
      .filter((rule: { source: string }) => rule.source === "/:path*" || rule.source === "/_next/static/:path*")
      .flatMap((rule: { headers: { key: string; value: string }[] }) => rule.headers)
      .filter((header: { key: string }) => header.key.toLowerCase() === "cache-control")
      .map((header: { value: string }) => header.value)
    for (const valor of cabecerasCache) expect(valor).not.toContain("immutable")
    expect(rules.some((rule: { source: string }) => rule.source === "/_next/static/:path*")).toBe(false)
  })

  it("mantiene la exclusión de cache solo para assets inmutables", async () => {
    const rules = (await nextConfig.headers?.()) ?? []
    // El HTML dinámico (/mapa) no recibe cache inmutable.
    const html = rules.find((rule: { source: string }) => rule.source === "/:path*")
    const cabecerasHtml = Object.fromEntries(
      (html?.headers ?? []).map((header: { key: string; value: string }) => [
        header.key.toLowerCase(),
        header.value,
      ]),
    )
    expect(cabecerasHtml["cache-control"] ?? "").not.toContain("immutable")
  })
})
