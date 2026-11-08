import { readFileSync } from "node:fs"
import { createElement, forwardRef, Fragment } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ refresh: vi.fn() }))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
  usePathname: () => "/reportes/9",
}))
// El diálogo real solo pinta su contenido en el navegador; el doble respeta `open`
// para que una prueba pueda mirar el formulario de impugnación sin montar React.
vi.mock("@radix-ui/react-dialog", () => ({
  Root: ({ children, open }: { children?: React.ReactNode; open?: boolean }) =>
    createElement(Fragment, null, open ? children : null),
  Trigger: ({ children }: { children?: React.ReactNode }) => createElement(Fragment, null, children),
  Portal: ({ children }: { children?: React.ReactNode }) => createElement(Fragment, null, children),
  Overlay: forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(function MockOverlay(props, ref) {
    return createElement("div", { ...props, ref })
  }),
  Content: forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(function MockContent(props, ref) {
    return createElement("div", { ...props, ref })
  }),
  Close: ({ children }: { children?: React.ReactNode }) => createElement("button", null, children),
  Title: ({ children }: { children?: React.ReactNode }) => createElement("h2", null, children),
  Description: ({ children }: { children?: React.ReactNode }) => createElement("p", null, children),
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
import { EvidenciaReparacion, DialogoImpugnar, ResumenReparacion, type AccionesEvidenciaReparacion } from "./evidencia-reparacion"

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

/** Renderiza el formulario de evidencia tal como se ve cuando la ficha lo habilita. */
function renderizarFormulario() {
  return renderizar({ evidencia: null, puedeInformar: true })
}

/** Renderiza el diálogo de impugnación abierto, como lo ve quien va a impugnar. */
function renderizarDialogoImpugnar() {
  return renderToStaticMarkup(createElement(DialogoImpugnar, {
    abierto: true,
    cambiandoAbierto: () => {},
    enviando: false,
    motivo: "",
    onMotivo: () => {},
    onEnviar: () => {},
  }))
}

/** Extrae la etiqueta de apertura del botón que contiene el texto indicado. */
function botonConTexto(html: string, texto: string) {
  const indice = html.indexOf(texto)
  if (indice < 0) return ""
  const desde = html.lastIndexOf("<button", indice)
  return desde < 0 ? "" : html.slice(desde, html.indexOf(">", desde) + 1)
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
    expect(html).toContain("Arrastrá la manija")
  })

  it("no anima la comparación para quien prefiere menos movimiento", () => {
    const html = renderizar()

    expect(html).not.toMatch(/animate-|transition-all|transition-transform/)
  })

  it("pone el deslizador sobre la foto, con manija visible y texto que describe el corte", () => {
    const html = renderizar()

    // El control cubre la foto: se puede arrastrar con el dedo y con las flechas.
    expect(html).toMatch(/<input[^>]*type="range"[^>]*class="[^"]*absolute inset-0[^"]*opacity-0/)
    expect(html).toMatch(/<input[^>]*class="[^"]*touch-pan-y/)
    expect(html).toContain('aria-valuetext="Mostrando el 50 % de la foto original"')
    // La manija y la línea del corte son decorativas: el texto ya nombra cada foto.
    expect(html).toContain('data-manija-comparacion')
    expect(html).toMatch(/data-manija-comparacion[^>]*aria-hidden="true"/)
    // El foco se ve aunque el control sea transparente.
    expect(html).toMatch(/class="[^"]*focus-within:ring-2/)
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

  it("explica que las cuentas de operador municipal no participan", () => {
    const html = renderizar({
      evidencia: vista({ participacion: { puede: false, motivo: "operador", yaVerifico: null } }),
    })

    expect(html).toContain("operador municipal")
    expect(html).not.toContain("Administración y operadores")
    expect(html).not.toContain("Confirmar reparación")
  })

  it("deja que administración confirme e impugne como cualquier cuenta habilitada", () => {
    const html = renderizar({
      evidencia: vista({ participacion: { puede: true, motivo: null, yaVerifico: null } }),
    })

    expect(html).toContain("Confirmar reparación")
    expect(html).toContain("Impugnar")
    expect(html).not.toContain("operador municipal")
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

describe("frases cerradas de la reparación (S16, S17)", () => {
  it("pregunta «¿Qué se arregló?» y ofrece exactamente las frases aprobadas en orden", () => {
    const html = renderizarFormulario()

    expect(html).toContain("¿Qué se arregló?")
    expect(html).toContain("Elegí qué se arregló…")
    const opciones = [...html.matchAll(/<option value="[^"]*"[^>]*>([^<]*)<\/option>/g)].map(([, etiqueta]) => etiqueta)
    expect(opciones).toEqual([
      "Elegí qué se arregló…",
      "Repararon el problema por completo",
      "Taparon el bache con asfalto nuevo",
      "Retiraron el árbol o las ramas caídas",
      "Repararon o cambiaron la luminaria",
      "Limpiaron la basura o el microbasural",
      "Repararon la pérdida de agua o la cañería",
      "Arreglaron la vereda o el cordón",
      "Repusieron o arreglaron el cartel o semáforo",
    ])
  })

  it("envía la clave de la frase en un select y no un texto libre", () => {
    const html = renderizarFormulario()

    expect(html).toContain("<select")
    expect(html).not.toContain("<textarea")
    expect(html).toContain('value="taparon_el_bache_con_asfalto_nuevo"')
    expect(html).not.toContain("Una línea alcanza")
    expect(html).not.toContain("caracteres")
    expect(html).toContain("La foto pasa por la moderación de siempre antes de publicarse.")
  })

  it("mantiene deshabilitado el envío hasta elegir una frase", () => {
    const html = renderizarFormulario()

    expect(botonConTexto(html, "Enviar evidencia")).toContain("disabled")
    expect(html).toContain("Enviar evidencia")
  })

  it("pregunta «¿Por qué no está reparado?» y ofrece exactamente las frases aprobadas en orden", () => {
    const html = renderizarDialogoImpugnar()

    expect(html).toContain("¿Por qué no está reparado?")
    expect(html).toContain("Elegí por qué no está reparado…")
    const opciones = [...html.matchAll(/<option value="[^"]*"[^>]*>([^<]*)<\/option>/g)].map(([, etiqueta]) => etiqueta)
    expect(opciones).toEqual([
      "Elegí por qué no está reparado…",
      "El problema sigue igual",
      "Lo arreglaron solo en parte",
      "El arreglo ya se rompió de nuevo",
      "La foto no corresponde a este lugar",
      "La foto no muestra el arreglo con claridad",
    ])
  })

  it("impugna con un select y sin texto libre, con el envío deshabilitado sin frase", () => {
    const html = renderizarDialogoImpugnar()

    expect(html).toContain("<select")
    expect(html).not.toContain("<textarea")
    expect(html).not.toContain("caracteres")
    expect(botonConTexto(html, "Enviar impugnación")).toContain("disabled")
    expect(html).toContain("Enviar impugnación")
  })
})

describe("resumen de la reparación sobre el contenido", () => {
  const renderizarResumen = (extra: Partial<SeccionReparacionVista> = {}) =>
    renderToStaticMarkup(createElement(ResumenReparacion, { seccion: seccion(extra), onVer: () => {} }))

  it("distingue «Reparación informada» de una verificación en curso", () => {
    const html = renderizarResumen({
      evidencia: vista({ estado: "informada", publicadaAt: null, foto: null }),
    })

    expect(html).toContain("¿Ya lo arreglaron?")
    expect(html).toContain("Reparación informada")
    expect(html).not.toContain("En verificación")
    expect(html).toContain("Ver la evidencia")
  })

  it("resume «En verificación» con las confirmaciones reales del reporte", () => {
    const html = renderizarResumen()

    expect(html).toContain("En verificación · 2 de 3 confirmaciones")
    expect(html).toContain("Ver la evidencia")
  })

  it("dice «Reparado» cuando la evidencia quedó validada", () => {
    const html = renderizarResumen({
      evidencia: vista({ estado: "reparado", confirmaciones: 3 }),
    })

    expect(html).toContain("Reparado")
    expect(html).not.toContain("En verificación")
  })

  it("invita a informar la reparación cuando todavía no hay evidencia", () => {
    const html = renderizarResumen({ evidencia: null, puedeInformar: true })

    expect(html).toContain("¿Ya lo arreglaron?")
    expect(html).toContain("Informar la reparación")
    expect(html).not.toContain("En verificación")
    expect(html).not.toContain("Reparado")
  })

  it("no muestra nada cuando el reporte no ofrece reparación", () => {
    expect(renderizarResumen({ evidencia: null, puedeInformar: false })).toBe("")
  })
})

describe("carga de evidencia", () => {
  it("ofrece un formulario mínimo con cámara, frase de la lista y verificación anti bots", () => {
    const html = renderizarFormulario()

    expect(html).toContain("¿Ya lo arreglaron? Informá la reparación")
    expect(html).toContain('capture="environment"')
    expect(html).toContain('accept="image/jpeg,image/png,image/webp"')
    expect(html).toContain("¿Qué se arregló?")
    expect(html).not.toMatch(/maxlength="500"/i)
    expect(html).toContain("Enviar evidencia")
    expect(html).toContain("moderación")
    expect(html).toContain('data-turnstile="informar_reparacion"')
  })

  it("no ofrece el formulario cuando el reporte ya está reparado o hay evidencia activa", () => {
    expect(renderizar()).not.toContain("Enviar evidencia")
    expect(renderizar({ evidencia: null, puedeInformar: false })).not.toContain("¿Ya lo arreglaron?")
  })
})

describe("diálogo de impugnación sobre la hoja inferior", () => {
  it("queda por encima del Drawer que muestra la evidencia", () => {
    const fuente = readFileSync(new URL("./evidencia-reparacion.tsx", import.meta.url), "utf8")

    // El Drawer compartido usa !z-[70]: velo y contenido de la impugnación suben a 80.
    expect(fuente).toContain('className="z-[80]"')
    expect(fuente).toContain('overlayClassName="z-[80]"')
  })
})
