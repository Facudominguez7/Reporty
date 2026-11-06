import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ refresh: vi.fn() }))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
  usePathname: () => "/reportes/9",
}))
vi.mock("@/components/turnstile-widget", () => ({
  TURNSTILE_CONFIGURADO: true,
  TURNSTILE_NO_DISPONIBLE: false,
  MENSAJE_CAPTCHA_NO_DISPONIBLE: "La verificación de seguridad no está disponible en este momento.",
  // El mock pinta la acción pedida: si el formulario y la acción del servidor se
  // separan, el token nunca más valida y este test lo detecta.
  TurnstileWidget: ({ action }: { action?: string }) => createElement("div", { "data-turnstile": action }),
}))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import type {
  EvidenciaReparacionVista,
  SeccionReparacionVista,
} from "@/lib/use-cases/reportes/evidencia-reparacion-detalle.server"
import { EvidenciaReparacion, type AccionesEvidenciaReparacion } from "./evidencia-reparacion"

const EVIDENCIA_ID = "22222222-2222-4222-8222-222222222222"

const acciones: AccionesEvidenciaReparacion = {
  onConfirmar: async () => ({ success: true }),
  onImpugnar: async () => ({ success: true }),
  onInformar: async () => ({ success: true }),
}

const fotoAntes = { src: "https://ejemplo.test/antes.webp", fecha: "2026-11-12T10:00:00Z" }

function vista(extra: Partial<EvidenciaReparacionVista> = {}): EvidenciaReparacionVista {
  return {
    evidenciaId: EVIDENCIA_ID,
    estado: "en_verificacion",
    autor: "Marisa Bogado",
    comentario: "Taparon el bache con asfalto nuevo el viernes.",
    informadaAt: "2026-11-28T12:42:00Z",
    publicadaAt: "2026-11-28T12:45:00Z",
    foto: { src: "https://ejemplo.test/despues.webp", miniatura: null },
    confirmaciones: 2,
    impugnacionesPendientes: 0,
    participacion: { puede: true, motivo: null, yaVerifico: null },
    ...extra,
  }
}

function seccion(extra: Partial<SeccionReparacionVista> = {}): SeccionReparacionVista {
  return { umbral: 3, evidencia: vista(), puedeInformar: false, ...extra }
}

/** Renderiza la sección de reparación tal como la pinta la ficha del reporte. */
function renderizar(extra: Partial<SeccionReparacionVista> = {}, antes: typeof fotoAntes | null = fotoAntes) {
  return renderToStaticMarkup(createElement(EvidenciaReparacion, {
    seccion: seccion(extra),
    fotoAntes: antes,
    acciones,
  }))
}

beforeEach(() => vi.clearAllMocks())

describe("comparación «Antes / Después»", () => {
  it("muestra las dos fotos con nombres accesibles y un control de teclado", () => {
    const html = renderizar()

    expect(html).toContain("Antes y después")
    expect(html).toContain("Antes")
    expect(html).toContain("Después")
    expect(html).toContain('type="range"')
    expect(html).toContain('aria-label="Comparar la foto original con la foto de la reparación"')
    expect(html).toContain("https://ejemplo.test/antes.webp")
    expect(html).toContain("https://ejemplo.test/despues.webp")
    expect(html).toMatch(/alt="Foto original del reporte[^"]*"/)
    expect(html).toMatch(/alt="Foto de la reparación informada por Marisa Bogado[^"]*"/)
    expect(html).toContain("Arrastrá el control")
  })

  it("no anima la comparación para quien prefiere menos movimiento", () => {
    const html = renderizar()

    expect(html).not.toMatch(/animate-|transition-all|transition-transform/)
  })

  it("muestra el autor, la fecha y el comentario de la evidencia", () => {
    const html = renderizar()

    expect(html).toContain("Marisa Bogado")
    expect(html).toContain("28/11/2026")
    expect(html).toContain("Taparon el bache con asfalto nuevo el viernes.")
  })

  it("cae a la foto de la reparación sola cuando el reporte no tiene foto original", () => {
    const html = renderizar({}, null)

    expect(html).toContain("https://ejemplo.test/despues.webp")
    expect(html).not.toContain("https://ejemplo.test/antes.webp")
    expect(html).not.toContain('type="range"')
  })
})

describe("estados de la reparación", () => {
  it("presenta «Reparación informada» sin foto ni acciones de verificación", () => {
    const html = renderizar({
      evidencia: vista({
        estado: "informada",
        publicadaAt: null,
        foto: null,
        participacion: { puede: false, motivo: null, yaVerifico: null },
      }),
    })

    expect(html).toContain("Reparación informada")
    expect(html).toContain("moderación")
    expect(html).not.toContain("Antes y después")
    expect(html).not.toContain("Confirmar reparación")
    expect(html).not.toContain("Impugnar")
    expect(html).not.toContain("despues.webp")
  })

  it("presenta «En verificación» con el progreso «2 de 3 confirmaciones»", () => {
    const html = renderizar()

    expect(html).toContain("En verificación")
    expect(html).toContain("2 de 3 confirmaciones")
    expect(html).toContain('role="progressbar"')
    expect(html).toContain('aria-valuenow="2"')
    expect(html).toContain('aria-valuemax="3"')
    expect(html).toContain("Falta 1 confirmación")
  })

  it("no inventa una comparación cuando la evidencia validada nunca publicó su foto", () => {
    const html = renderizar({
      evidencia: vista({
        estado: "reparado",
        foto: null,
        participacion: { puede: false, motivo: null, yaVerifico: null },
      }),
    })

    expect(html).toContain("Reparado")
    expect(html).toContain("no hay una comparación disponible")
    expect(html).not.toContain("Antes y después")
    expect(html).not.toContain("despues.webp")
  })

  it("presenta «Reparado» y no vuelve a ofrecer la verificación", () => {
    const html = renderizar({
      evidencia: vista({ estado: "reparado", confirmaciones: 3, participacion: { puede: false, motivo: null, yaVerifico: null } }),
    })

    expect(html).toContain("Reparado")
    expect(html).toContain("3 de 3 confirmaciones")
    expect(html).toContain("Antes y después")
    expect(html).not.toContain("Confirmar reparación")
    expect(html).not.toContain("Impugnar")
    expect(html).not.toContain("Enviar evidencia")
  })
})

describe("acciones de la comunidad", () => {
  it("ofrece confirmar e impugnar a una cuenta habilitada", () => {
    const html = renderizar()

    expect(html).toContain("Confirmar reparación")
    expect(html).toContain("Impugnar")
  })

  it("avisa que el autor no puede confirmar su propia evidencia", () => {
    const html = renderizar({
      evidencia: vista({ participacion: { puede: false, motivo: "autor", yaVerifico: null } }),
    })

    expect(html).toContain("El autor de la foto no puede confirmar su propia evidencia.")
    expect(html).not.toContain("Confirmar reparación")
    expect(html).not.toContain("Impugnar")
  })

  it("pide una cuenta con correo confirmado cuando no hay sesión", () => {
    const html = renderizar({
      evidencia: vista({ participacion: { puede: false, motivo: "sesion", yaVerifico: null } }),
    })

    expect(html).toContain("correo confirmado")
    expect(html).toContain('href="/auth?next=%2Freportes%2F9"')
    expect(html).not.toContain("Confirmar reparación")
  })

  it("explica que invitados y cuentas sin correo confirmado no participan", () => {
    const html = renderizar({
      evidencia: vista({ participacion: { puede: false, motivo: "cuenta", yaVerifico: null } }),
    })

    expect(html).toContain("cuenta registrada con el correo confirmado")
    expect(html).not.toContain("Confirmar reparación")
  })

  it("explica que administración y operadores revisan desde Revisiones", () => {
    const html = renderizar({
      evidencia: vista({ participacion: { puede: false, motivo: "administracion", yaVerifico: null } }),
    })

    expect(html).toContain("Revisiones")
    expect(html).not.toContain("Confirmar reparación")
  })

  it("recuerda la verificación ya registrada y no ofrece repetirla", () => {
    const html = renderizar({
      evidencia: vista({ participacion: { puede: true, motivo: null, yaVerifico: "confirmacion" } }),
    })

    expect(html).toContain("Tu confirmación ya está registrada")
    expect(html).not.toContain("Confirmar reparación")
    expect(html).not.toContain("Impugnar")

    const impugnada = renderizar({
      evidencia: vista({ participacion: { puede: true, motivo: null, yaVerifico: "impugnacion" } }),
    })
    expect(impugnada).toContain("Tu impugnación está pendiente de revisión")
    expect(impugnada).not.toContain("Impugnar")
  })
})

describe("impugnación pendiente", () => {
  it("avisa que la verificación está en pausa hasta que la revise un administrador", () => {
    const html = renderizar({ evidencia: vista({ impugnacionesPendientes: 1 }) })

    expect(html).toContain("Impugnación pendiente")
    expect(html).toContain("pausa")
    expect(html).toContain("un administrador")
    expect(html).not.toMatch(/Diego|Sofía/)
  })

  it("no muestra el aviso cuando no hay impugnaciones pendientes", () => {
    expect(renderizar()).not.toContain("Impugnación pendiente")
  })
})

describe("carga de evidencia", () => {
  it("ofrece un formulario mínimo con cámara, comentario y verificación anti bots", () => {
    const html = renderToStaticMarkup(createElement(EvidenciaReparacion, {
      seccion: seccion({ evidencia: null, puedeInformar: true }),
      fotoAntes,
      acciones,
    }))

    expect(html).toContain("¿Ya lo arreglaron? Informá la reparación")
    expect(html).toContain('capture="environment"')
    expect(html).toContain('accept="image/jpeg,image/png,image/webp"')
    expect(html).toContain("Comentario")
    expect(html).toMatch(/maxlength="500"/i)
    expect(html).toContain("Enviar evidencia")
    expect(html).toContain("moderación")
    expect(html).toContain('data-turnstile="informar_reparacion"')
  })

  it("no ofrece el formulario cuando el reporte ya está reparado o hay evidencia activa", () => {
    expect(renderizar()).not.toContain("Enviar evidencia")
    expect(renderizar({ evidencia: null, puedeInformar: false })).not.toContain("¿Ya lo arreglaron?")
  })
})
