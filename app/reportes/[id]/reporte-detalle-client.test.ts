import { readFileSync } from "node:fs"
import { createElement, forwardRef, Fragment, type ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/reportes/9",
  // La ficha lee `returnTo` para el botón «Volver» (main): sin parámetros vuelve a /reportes.
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) =>
    createElement("a", { href, ...props }, children),
}))
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}))
vi.mock("@/components/turnstile-widget", () => ({
  TURNSTILE_CONFIGURADO: true,
  TURNSTILE_NO_DISPONIBLE: false,
  MENSAJE_CAPTCHA_NO_DISPONIBLE: "La verificación de seguridad no está disponible en este momento.",
  TurnstileWidget: ({ action }: { action?: string }) => createElement("div", { "data-turnstile": action }),
}))
// Vaul sólo pinta su contenido en el navegador; el doble respeta `open`.
vi.mock("vaul", () => {
  const contenedor = (etiqueta: string) =>
    forwardRef<HTMLDivElement, { children?: ReactNode }>(function Mock(props, ref) {
      return createElement(etiqueta, { ...props, ref }, props.children)
    })
  return {
    Drawer: {
      Root: ({ children, open }: { children?: ReactNode; open?: boolean }) =>
        createElement(Fragment, null, open ? children : null),
      Trigger: ({ children }: { children?: ReactNode }) => createElement(Fragment, null, children),
      Close: ({ children }: { children?: ReactNode }) => createElement(Fragment, null, children),
      Portal: ({ children }: { children?: ReactNode }) => createElement(Fragment, null, children),
      Overlay: contenedor("div"),
      Handle: contenedor("div"),
      Content: contenedor("div"),
      Title: contenedor("h2"),
      Description: contenedor("p"),
    },
  }
})
vi.mock("./actions", () => ({
  actualizarReporteAdminAction: vi.fn(),
  cambiarEstadoAdminAction: vi.fn(),
  confirmarReparacionAction: vi.fn(),
  crearComentarioAction: vi.fn(),
  impugnarReparacionAction: vi.fn(),
  informarReparacionAction: vi.fn(),
  quitarFotoReporteAdminAction: vi.fn(),
  reemplazarFotoReporteAdminAction: vi.fn(),
  eliminarComentarioAdminAction: vi.fn(),
  eliminarComentarioPropioAction: vi.fn(),
  eliminarReporteAdminAction: vi.fn(),
  eliminarReportePropioAction: vi.fn(),
  votarNoExisteAction: vi.fn(),
}))

import type { ReporteDetalle } from "@/database/queries/reportes/[id]/index"
import type { SeccionReparacionVista } from "@/lib/use-cases/reportes/evidencia-reparacion-detalle.server"
import { ReporteDetalleClient, type ReporteDetalleInicial } from "./reporte-detalle-client"

const reporte = {
  id: 9,
  titulo: "Bache en Av. Uruguay y Bolívar",
  descripcion: "El bache ocupa media calzada.",
  lat: -27.36708,
  lon: -55.8961,
  created_at: "2026-11-12T10:00:00",
  usuario_id: "otra-persona",
  estado_id: 1,
  categoria_id: 3,
  prioridad_id: 2,
  categorias: { nombre: "Baches" },
  prioridades: { nombre: "Media" },
  estados: { id: 1, nombre: "Pendiente" },
  fotos_reporte: [{ id: 1, url: "https://ejemplo.test/antes.webp", publicUrl: "https://ejemplo.test/antes.webp" }],
  votos: { noExiste: { count: 0, hasVoted: false }, reparado: { count: 0, hasVoted: false } },
} as unknown as ReporteDetalle

const seccionReparacion: SeccionReparacionVista = {
  umbral: 3,
  puedeInformar: false,
  evidencia: {
    evidenciaId: "22222222-2222-4222-8222-222222222222",
    estado: "en_verificacion",
    autor: "Marisa Bogado",
    comentario: "Taparon el bache con asfalto nuevo",
    informadaAt: "2026-11-28T12:42:00Z",
    publicadaAt: "2026-11-28T12:45:00Z",
    foto: { src: "https://ejemplo.test/despues.webp", miniatura: null },
    confirmaciones: 2,
    impugnacionesPendientes: 0,
    participacion: { puede: true, motivo: null, yaVerifico: null },
  },
}

const propsBase: ReporteDetalleInicial = {
  reporte,
  puedeContactar: true,
  currentUser: { id: "user-1", is_anonymous: false },
  isAdmin: false,
  estados: [],
  categoriasDisponibles: [],
  prioridadesDisponibles: [],
  comentarios: [],
  historialEstados: [],
  fechaCambioEstado: null,
  gestionOperativa: null,
  puedeVotar: true,
  evidenciaReparacion: seccionReparacion,
}

/** Renderiza el detalle completo con los datos que la página ya cargó en el servidor. */
function renderizar(extra: Partial<ReporteDetalleInicial> = {}) {
  return renderToStaticMarkup(createElement(ReporteDetalleClient, { ...propsBase, ...extra }))
}

beforeEach(() => vi.clearAllMocks())

describe("acciones y hojas del detalle", () => {
  it("resume la ubicación real del reporte arriba del contenido, con miniatura y entrada directa", () => {
    const html = renderizar()

    expect(html).toContain("Ubicación")
    expect(html).toContain("-27,36708 · -55,89610")
    expect(html).toContain("data-vista-previa-ubicacion")
    expect(html).toContain("Ver en mapa")
    expect(html).toContain("data-acciones-flotantes")
  })

  it("deja una sola entrada visible al mapa para quien no administra", () => {
    const html = renderizar()

    // El botón de la franja; la hoja y el menú flotante están cerrados en este render.
    expect(html.split("Ver en mapa").length - 1).toBe(1)
    expect(html).toContain('aria-haspopup="dialog"')
  })

  it("reserva la tarjeta de ubicación de la barra lateral para editar coordenadas", () => {
    const html = renderizar()
    const admin = renderizar({ isAdmin: true, currentUser: { id: "admin-1", is_anonymous: false } })

    // La franja superior y su hoja ya cubren la consulta: la tarjeta no se repite al abrir.
    expect(html).not.toContain('id="reporte-ubicacion-map"')
    expect(admin).not.toContain('id="reporte-ubicacion-map"')
    // Administración conserva el editor de coordenadas dentro del modo de edición.
    expect(admin).toContain('Editar reporte')
  })

  it("resume el estado de la evidencia y deja las acciones para la hoja", () => {
    const html = renderizar()

    expect(html).toContain("¿Ya lo arreglaron?")
    expect(html).toContain("En verificación · 2 de 3 confirmaciones")
    expect(html).toContain("Ver la evidencia")
    // La comparación ahora vive sobre la foto de la tarjeta; confirmar e impugnar siguen en la hoja.
    expect(html).not.toContain("Confirmar reparación")
  })

  it("no ofrece acciones flotantes cuando no hay ninguna disponible", () => {
    const html = renderizar({
      currentUser: null,
      puedeContactar: false,
      puedeVotar: false,
      reporte: { ...reporte, lat: null, lon: null } as unknown as ReporteDetalle,
      evidenciaReparacion: null,
    })

    expect(html).not.toContain("data-acciones-flotantes")
    expect(html).toContain("Ubicación no disponible")
  })

  it("conserva compartir, el voto «No existe», los comentarios y los organismos", () => {
    const html = renderizar()

    expect(html).toContain("Compartir reporte")
    expect(html).toContain("No existe")
    expect(html).toContain("Actualizaciones y Comentarios")
    expect(html).toContain("Avisar a un organismo")
    expect(html).toContain('id="report-contribution"')
  })

  it("no repite el botón de ubicación en móvil", () => {
    const fuente = readFileSync(new URL("./reporte-detalle-client.tsx", import.meta.url), "utf8")

    expect(fuente).not.toContain("Ver ubicación</button>")
    expect(fuente).toContain("FranjaUbicacion")
    expect(fuente).toContain("ContenidoUbicacion")
  })
})

describe("comparación «Antes / Después» sobre la foto de la tarjeta (S10, S11, S18)", () => {
  it("compara el antes y el después sobre la foto del reporte cuando la evidencia publicó la suya", () => {
    const html = renderizar()

    expect(html).toContain('type="range"')
    expect(html).toContain("https://ejemplo.test/antes.webp")
    expect(html).toContain("https://ejemplo.test/despues.webp")
    expect(html).toContain("Antes · 12 nov")
    expect(html).toContain("Después · 28 nov")
    expect(html).toContain('aria-valuetext="Mostrando el 50 % de la foto original"')
    expect(html).toContain("Deslizá para comparar el antes y el después.")
    // Cada foto conserva un nombre accesible con su autor y su fecha.
    expect(html).toContain('alt="Foto original del reporte, publicada por Usuario el 12/11/2026"')
    expect(html).toContain('alt="Foto de la reparación informada por Marisa Bogado el 28/11/2026"')
  })

  it("deja la foto sola y la galería de siempre cuando todavía no hay foto del después", () => {
    const html = renderizar({
      evidenciaReparacion: {
        ...seccionReparacion,
        evidencia: {
          ...(seccionReparacion.evidencia as NonNullable<SeccionReparacionVista["evidencia"]>),
          estado: "informada",
          publicadaAt: null,
          foto: null,
        },
      },
    })

    expect(html).not.toContain('type="range"')
    expect(html).not.toContain("Después")
    expect(html).toContain("https://ejemplo.test/antes.webp")
    expect(html).toContain("Ver imagen 1 del reporte en grande")
  })

  it("no inventa un después cuando la ficha no recibe la sección de reparación", () => {
    const html = renderizar({ evidenciaReparacion: null })

    expect(html).not.toContain('type="range"')
    expect(html).toContain("https://ejemplo.test/antes.webp")
    expect(html).toContain("Ver imagen 1 del reporte en grande")
  })

  it("mantiene la foto original y la de la reparación ampliables con la comparación", () => {
    const html = renderizar()

    // La comparación no encierra el control de rango dentro de un botón; cada foto
    // conserva su propia entrada al diálogo de siempre (S9).
    expect(html).toContain("Ver la foto original en grande")
    expect(html).toContain("Ver la foto de la reparación en grande")
  })
})
