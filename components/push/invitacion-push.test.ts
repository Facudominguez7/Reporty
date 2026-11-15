import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/app/cuenta/push-actions", () => ({ obtenerEstadoPushAction: vi.fn(), actualizarPreferenciaPushAction: vi.fn() }))
vi.mock("@/lib/push/cliente", () => ({}))

import { debeOfrecerPush } from "./invitacion-push"

const BASE = { disponible: true, soportado: true, suscripto: false, permiso: "default" as const, descartada: false }

describe("debeOfrecerPush", () => {
  it("la ofrece cuando todavía no hay suscripción ni decisión", () => {
    expect(debeOfrecerPush(BASE)).toBe(true)
    expect(debeOfrecerPush({ ...BASE, permiso: "granted" })).toBe(true)
  })

  it.each([
    ["las push no están configuradas", { disponible: false }],
    ["el navegador no las soporta", { soportado: false }],
    ["este dispositivo ya está suscripto", { suscripto: true }],
    ["el permiso está bloqueado", { permiso: "denied" as const }],
    ["la persona eligió «Ahora no»", { descartada: true }],
  ])("no la ofrece si %s", (_motivo, cambio) => {
    expect(debeOfrecerPush({ ...BASE, ...cambio })).toBe(false)
  })
})

describe("invitación después de crear un reporte", () => {
  const pagina = readFileSync(fileURLToPath(new URL("../../app/reportes/nuevo/page.tsx", import.meta.url)), "utf8")

  it("pregunta si avisar cuando cambie de estado, solo a cuentas registradas y con el reporte publicado", () => {
    expect(pagina).toMatch(
      /\{!createdReport\.isGuest && !createdReport\.withdrawn && \(\s*<InvitacionPush pregunta="¿Querés que te avisemos cuando cambie de estado\?" \/>/,
    )
  })
})
