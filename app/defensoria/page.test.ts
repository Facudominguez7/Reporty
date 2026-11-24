import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  contexto: vi.fn(),
  reportes: vi.fn(),
  redirect: vi.fn(),
}))

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }))

vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser } }),
}))

vi.mock("@/lib/authz/roles", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/authz/roles")>()
  return { ...actual, getUserRoleContext: mocks.contexto }
})

vi.mock("@/database/queries/reportes/get-reportes", () => ({
  getReportesDefensoria: mocks.reportes,
}))

vi.mock("@/components/admin/dashboard-shell", () => ({
  AdminDashboardShell: ({
    children,
    email,
    roleId,
    variante,
  }: {
    children: React.ReactNode
    email: string
    roleId: number | null
    variante?: string
  }) =>
    createElement(
      "div",
      { "data-email": email, "data-role-id": String(roleId), "data-variante": String(variante) },
      children,
    ),
}))

vi.mock("@/app/defensoria/bandeja-client", () => ({
  BandejaClient: ({ reportes }: { reportes: { id: number; titulo: string; estado: string; numeroReclamo: string | null; ubicacion: string }[] }) =>
    createElement(
      "div",
      { "data-testid": "bandeja" },
      reportes.map((reporte) =>
        createElement("span", { key: reporte.id }, `${reporte.id}|${reporte.estado}|${reporte.numeroReclamo ?? "-"}|${reporte.ubicacion}`),
      ),
    ),
}))

import DefensoriaPage from "./page"

const reportesDefensoria = [
  {
    id: 7,
    title: "Bache profundo sobre Av. Freyre",
    description: "El bache tiene unos 60 cm de diámetro.",
    category: "Calles y veredas",
    priority: "Alta",
    status: "Pendiente",
    author: "vecino",
    createdAt: "2026-11-20T10:00:00.000Z",
    image: null,
    numeroReclamo: null,
    location: "Lat -27.4000, Lon -55.9000",
    direccion: "Av. Freyre 123, Santa Fe",
  },
  {
    id: 9,
    title: "Basural espontáneo en Blas Parera",
    description: "Restos de poda y escombros.",
    category: "Higiene urbana",
    priority: "Media",
    status: "Tomado por Defensoría",
    author: "otro-vecino",
    createdAt: "2026-11-19T09:00:00.000Z",
    image: "https://example.com/foto.jpg",
    numeroReclamo: "RE-2026-01482",
    location: "Lat -27.4000, Lon -55.9000",
    direccion: null,
  },
]

/**
 * Ejecuta la página con la sesión y el rol indicados.
 *
 * @param usuario - Usuario de la sesión (null para visita sin sesión).
 * @param roleId - Rol que devuelve el contexto de permisos.
 * @returns El HTML de la página.
 */
async function renderizar(usuario: { id: string; email: string } | null, roleId: number) {
  mocks.getUser.mockResolvedValue({ data: { user: usuario } })
  mocks.contexto.mockResolvedValue({ data: { roleId } })
  mocks.reportes.mockResolvedValue({ data: reportesDefensoria, error: null })
  return renderToStaticMarkup(await DefensoriaPage())
}

describe("página /defensoria (S2/S10/S11)", () => {
  beforeEach(() => {
    mocks.redirect.mockReset()
    mocks.redirect.mockImplementation(() => {})
  })

  it("consulta la página del estado y búsqueda elegidos", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "u1", email: "d@example.com" } } })
    mocks.contexto.mockResolvedValue({ data: { roleId: 6 } })
    mocks.reportes.mockResolvedValue({ data: [], error: null, hasMore: false })
    await DefensoriaPage({ searchParams: Promise.resolve({ pagina: "3", vista: "tomados", busqueda: "Freyre" }) })
    expect(mocks.reportes).toHaveBeenCalledWith(20, 40, { vista: "tomados", busqueda: "Freyre" })
  })

  it("guarda el acceso: sin sesión redirige al ingreso con destino /defensoria", async () => {
    mocks.redirect.mockImplementation((url: string) => {
      throw new Error(`NEXT_REDIRECT:${url}`)
    })

    await expect(renderizar(null, 2)).rejects.toThrow("NEXT_REDIRECT:/auth?next=/defensoria")
    expect(mocks.redirect).toHaveBeenCalledWith("/auth?next=/defensoria")
  })

  it("guarda el acceso: un rol que no es Defensoría cae al dashboard", async () => {
    mocks.redirect.mockImplementation((url: string) => {
      throw new Error(`NEXT_REDIRECT:${url}`)
    })

    await expect(renderizar({ id: "u1", email: "u@example.com" }, 2)).rejects.toThrow("NEXT_REDIRECT:/dashboard")
    expect(mocks.redirect).toHaveBeenCalledWith("/dashboard")
  })

  it("conserva el shell aprobado y entrega los reportes mapeados a la bandeja interactiva", async () => {
    const html = await renderizar({ id: "u1", email: "defensoria@example.com" }, 6)
    expect(html).toContain('data-variante="defensoria"')
    expect(html).toContain('data-role-id="6"')
    expect(html).toContain("Defensoría del Pueblo")
    expect(html).toContain('data-testid="bandeja"')
    expect(html).toContain("7|Pendiente|-")
    expect(html).toContain("9|Tomado por Defensoría|RE-2026-01482")
    expect(html).toContain("Av. Freyre 123, Santa Fe")
    expect(html).toContain("Dirección no disponible")
    expect(html).not.toContain("Lat -27.4000")
  })
})
