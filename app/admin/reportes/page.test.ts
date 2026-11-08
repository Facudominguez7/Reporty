import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ getAdminPets: vi.fn(), getPetFilters: vi.fn(), getReports: vi.fn(), getReportFilters: vi.fn() }))
vi.mock("@/utils/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "admin" } } }) } }) }))
vi.mock("@/database/queries/admin/verificar-admin", () => ({ verificarEsAdmin: async () => ({ isAdmin: true }) }))
vi.mock("@/database/queries/admin/admin-mascotas", () => ({ getAdminMascotas: mocks.getAdminPets, getAdminMascotaFilters: mocks.getPetFilters }))
vi.mock("@/database/queries/admin/admin-reportes", () => ({ getAdminReportes: mocks.getReports, getAdminReportFilters: mocks.getReportFilters }))
vi.mock("@/components/admin/mascotas/mascotas-admin-table", () => ({ MascotasAdminTable: () => createElement("div", { "data-testid": "pet-management" }) }))
vi.mock("@/components/admin/reportes/reportes-admin-table", () => ({ ReportesAdminTable: () => createElement("div", { "data-testid": "incident-management" }) }))
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => createElement("a", { href }, children) }))
import AdminReportesPage from "./page"

beforeEach(() => {
  mocks.getAdminPets.mockReset().mockResolvedValue({ data: [], count: 0, pageSize: 12 })
  mocks.getPetFilters.mockReset().mockResolvedValue({ estados: [], tipos: [] })
  mocks.getReports.mockReset()
  mocks.getReportFilters.mockReset()
})

it("renders the pets tab in the existing reports route and loads only pet management", async () => {
  const page = await AdminReportesPage({ searchParams: Promise.resolve({ vista: "mascotas" }) })
  const html = renderToStaticMarkup(page)
  expect(html).toContain("Mascotas")
  expect(html).toContain("data-testid=\"pet-management\"")
  expect(html).not.toContain("data-testid=\"incident-management\"")
  expect(mocks.getAdminPets).toHaveBeenCalledOnce()
  expect(mocks.getReports).not.toHaveBeenCalled()
})
