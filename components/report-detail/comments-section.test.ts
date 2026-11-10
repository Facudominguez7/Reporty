import { readFileSync } from "node:fs"
import { createElement, forwardRef, Fragment, type ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("next/navigation", () => ({ usePathname: () => "/reportes/9" }))
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) =>
    createElement("a", { href, ...props }, children),
}))
vi.mock("@/components/turnstile-widget", () => ({
  TURNSTILE_CONFIGURADO: true,
  TURNSTILE_NO_DISPONIBLE: false,
  MENSAJE_CAPTCHA_NO_DISPONIBLE: "La verificación de seguridad no está disponible en este momento.",
  TurnstileWidget: ({ action }: { action?: string }) => createElement("div", { "data-turnstile": action }),
}))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
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

import type { Comentario } from "@/database/queries/reportes/[id]/index"
import { CommentsSection, type UsuarioActual } from "./comments-section"

const USUARIO: UsuarioActual = { id: "user-1", is_anonymous: false }

const comentario: Comentario = {
  id: 7,
  reporte_id: 9,
  usuario_id: "user-1",
  contenido: "El problema sigue igual",
  created_at: "2026-11-20T10:00:00Z",
  profiles: { username: "vecina_rosa" },
} as Comentario

const propsBase = {
  comments: [comentario],
  statusHistory: [],
  currentUser: USUARIO,
  reportOwnerId: "user-1",
  isAdmin: false,
  isClosed: false,
  onSubmitComment: async () => ({ success: true as const, data: { comment: comentario, pointsAwarded: 0 } }),
  onDeleteComment: async () => ({ success: true }),
  onAdminDeleteComment: async () => ({ success: true }),
}

/** Renderiza la sección de actividad tal como la compone la ficha del reporte. */
function renderizar(extra: Partial<Parameters<typeof CommentsSection>[0]> = {}) {
  return renderToStaticMarkup(createElement(CommentsSection, { ...propsBase, ...extra }))
}

const contar = (html: string, fragmento: string) => html.split(fragmento).length - 1

beforeEach(() => vi.clearAllMocks())

describe("compositor de aportes dentro de la sección", () => {
  it("no muestra el formulario en la sección: comentar sólo se abre desde el botón flotante", () => {
    const html = renderizar()

    expect(contar(html, "<select")).toBe(0)
    expect(html).not.toContain("Publicar</span>")
    expect(html).not.toContain('data-turnstile="comentar_reporte"')
  })

  it("mueve el compositor a la hoja inferior cuando la acción flotante lo pide", () => {
    const html = renderizar({ compositorAbierto: true })

    expect(contar(html, "<select")).toBe(1)
    expect(html).toContain('aria-label="Cerrar el compositor"')
    expect(html).toContain('data-turnstile="comentar_reporte"')
  })

  it("respeta el cierre del reporte también cuando la hoja está abierta", () => {
    const html = renderizar({ compositorAbierto: true, isClosed: true })

    expect(contar(html, "<select")).toBe(0)
    expect(html).not.toContain("Publicar</span>")
    expect(html).toContain("Este reporte está cerrado")
  })

  it("no abre el compositor sin sesión ni como invitado", () => {
    const sinSesion = renderizar({ compositorAbierto: true, currentUser: null })
    expect(contar(sinSesion, "<select")).toBe(0)
    expect(sinSesion).toContain("iniciá sesión")

    const invitado = renderizar({ compositorAbierto: true, currentUser: { id: "guest-1", is_anonymous: true } })
    expect(contar(invitado, "<select")).toBe(0)
    expect(invitado).toContain("vinculá tu correo")
  })
})

describe("actividad del reporte", () => {
  it("sigue mostrando los aportes y su eliminación para el autor", () => {
    const html = renderizar()

    expect(html).toContain("El problema sigue igual")
    expect(html).toContain("vecina_rosa")
    expect(html).toContain('aria-label="Eliminar comentario"')
  })

  it("sigue mostrando el historial de estados junto a los aportes", () => {
    const html = renderizar({
      statusHistory: [
        {
          id: 3,
          reporte_id: 9,
          estado_nuevo_id: 2,
          created_at: "2026-11-21T10:00:00Z",
          comentario: null,
          estado_nuevo: { id: 2, nombre: "Reparado" },
          usuario: { username: "equipo" },
        },
      ],
    })

    expect(html).toContain("Reparado")
  })
})

describe("diálogos por encima de la hoja inferior", () => {
  it("sube la confirmación de publicación sobre el Drawer cuando el compositor está en la hoja", () => {
    const fuente = readFileSync(new URL("./comments-section.tsx", import.meta.url), "utf8")

    // El Drawer compartido usa !z-[70] y globals.css fuerza z-index 50 !important en los
    // alertdialog: sin el `!`, la confirmación queda debajo del velo y no se puede tocar.
    expect(fuente).toContain('<AlertDialogContent className="!z-[80]">')
  })
})
