import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ datos: vi.fn() }))

vi.mock("next/navigation", () => ({ redirect: vi.fn(), useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }))
vi.mock("@/database/queries/dashboard", () => ({ getDashboardPageData: mocks.datos }))
vi.mock("@/database/queries/reportes/get-reportes", () => ({
  getCategorias: async () => ({ data: [] }),
  getEstados: async () => ({ data: [] }),
  getPrioridades: async () => ({ data: [] }),
}))
vi.mock("@/components/dashboard/graficos-diferidos", () => ({
  GraficoReportesPorCategoriaDiferido: () => null,
  GraficoZonasCalientesDiferido: () => null,
}))
vi.mock("@/components/dashboard/mapa-calor-zonas", () => ({ MapaCalorZonas: () => null }))
vi.mock("@/app/reportes/reportes-client", () => ({ ReportesClientWrapper: () => null }))
vi.mock("@/components/sign-out-section", async () => {
  const { createElement } = await import("react")
  return { SignOutSection: () => createElement("button", null, "Cerrar sesión") }
})
vi.mock("@/components/cuenta/eliminar-cuenta-section", async () => {
  const { createElement } = await import("react")
  return { EliminarCuentaSection: () => createElement("button", null, "Eliminar cuenta") }
})

vi.mock("@/components/cuenta/nombre-usuario-section", async () => {
  const { createElement } = await import("react")
  return {
    NombreUsuarioSection: ({ nombreActual }: { nombreActual: string | null }) =>
      createElement("p", null, `Nombre de usuario: ${nombreActual}`),
  }
})

import DashboardPage from "./page"

/**
 * Renderiza el dashboard con el rol y la vista indicados.
 *
 * @param roleId - Rol del usuario de la sesión.
 * @param isAnalyticsDashboard - Si recibe la vista de analíticas (admin e interesado).
 * @returns El HTML de la página.
 */
async function renderizar(roleId: number, isAnalyticsDashboard: boolean) {
  mocks.datos.mockResolvedValue({
    user: { id: "u1", email: "u@example.com", username: "vecino" },
    roleId,
    isAnalyticsDashboard,
    profile: { username: "vecino", puntos: 0 },
    stats: {},
    reportesPorCategoria: [],
    zonasCalientes: [],
    userReports: [],
    reportesRecientes: [],
  })
  return renderToStaticMarkup(await DashboardPage({ searchParams: Promise.resolve({}) }))
}

describe("eliminar cuenta en Mi cuenta", () => {
  beforeEach(() => vi.clearAllMocks())

  it("lo ve el ciudadano", async () => {
    expect(await renderizar(2, false)).toContain("Eliminar cuenta")
  })

  it("lo ve el interesado en la vista de analíticas", async () => {
    expect(await renderizar(3, true)).toContain("Eliminar cuenta")
  })

  it("no lo ve el administrador", async () => {
    expect(await renderizar(1, true)).not.toContain("Eliminar cuenta")
  })
})

describe("nombre de usuario en Mi cuenta", () => {
  beforeEach(() => vi.clearAllMocks())

  it("el ciudadano ve su nombre de usuario actual para poder cambiarlo", async () => {
    expect(await renderizar(2, false)).toContain("Nombre de usuario: vecino")
  })

  it("el interesado también lo ve en la vista de analíticas", async () => {
    expect(await renderizar(3, true)).toContain("Nombre de usuario: vecino")
  })
})
