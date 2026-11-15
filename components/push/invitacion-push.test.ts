import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/app/cuenta/push-actions", () => ({ obtenerEstadoPushAction: vi.fn(), actualizarPreferenciaPushAction: vi.fn() }))
vi.mock("@/lib/push/cliente", () => ({}))

import { DIAS_PARA_REOFRECER_PUSH, debeOfrecerPush, descarteVigente, rutaAdmiteAvisoPush } from "./invitacion-push"

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

describe("«Ahora no» vence y la invitación se vuelve a ofrecer", () => {
  const AHORA = Date.parse("2026-11-15T12:00:00Z")
  const DIA = 24 * 60 * 60 * 1000

  it("esconde la invitación durante los días de espera", () => {
    expect(DIAS_PARA_REOFRECER_PUSH).toBe(14)
    expect(descarteVigente(String(AHORA - DIA), AHORA)).toBe(true)
    expect(descarteVigente(String(AHORA - 13 * DIA), AHORA)).toBe(true)
  })

  it("la vuelve a ofrecer pasados 14 días", () => {
    expect(descarteVigente(String(AHORA - 14 * DIA), AHORA)).toBe(false)
  })

  it.each([null, "", "1", "basura"])("un valor sin fecha (%s) no la esconde", (valor) => {
    expect(descarteVigente(valor, AHORA)).toBe(false)
  })
})

describe("aviso automático en todas las páginas", () => {
  it.each(["/", "/reportes", "/reportes/12", "/dashboard", "/mascotas", "/comunidad"])("se muestra en %s", (ruta) => {
    expect(rutaAdmiteAvisoPush(ruta)).toBe(true)
  })

  it("no se muestra al crear un reporte, donde ya está la invitación del diálogo", () => {
    expect(rutaAdmiteAvisoPush("/reportes/nuevo")).toBe(false)
  })

  it("no se muestra sobre el mapa, que ocupa la pantalla completa", () => {
    expect(rutaAdmiteAvisoPush("/mapa")).toBe(false)
  })

  it("está montado una sola vez en el layout raíz", () => {
    const layout = readFileSync(fileURLToPath(new URL("../../app/layout.tsx", import.meta.url)), "utf8")
    expect(layout.match(/<AvisoPushAutomatico \/>/g)).toHaveLength(1)
  })
})

describe("aviso automático no invasivo", () => {
  const componente = readFileSync(fileURLToPath(new URL("./invitacion-push.tsx", import.meta.url)), "utf8")

  it("se apoya arriba de la barra de navegación inferior, no debajo", () => {
    expect(componente).toContain("bottom-[calc(var(--bottom-nav-space,0px)+0.75rem)]")
  })
})
