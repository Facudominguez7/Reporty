import { NextRequest } from "next/server"
import { beforeEach, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), createAdminClient: vi.fn(), send: vi.fn(), contact: vi.fn(), role: vi.fn(), eq: vi.fn() }))
vi.mock("@/utils/supabase/server", () => ({ createClient: mocks.createClient }))
vi.mock("@/utils/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }))
vi.mock("@/database/queries/profiles", () => ({ getPrivateProfileContact: mocks.contact }))
vi.mock("@/lib/authz/roles", () => ({ getUserRoleContext: mocks.role, isAdminRole: (role: number) => role === 1 }))
vi.mock("@/lib/notifications/report-notifications", () => ({ sendStatusNotificationEmail: mocks.send }))
import { POST } from "./route"

beforeEach(() => {
  vi.resetAllMocks()
  mocks.eq.mockReturnValue({ single: async () => ({ data: { id: 7, titulo: "Bache", usuario_id: "owner", nombre: "Reparado" }, error: null }) })
  mocks.createClient.mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: "actor" } }, error: null }) }, from: () => ({ select: () => ({ eq: mocks.eq }) }) })
  mocks.createAdminClient.mockReturnValue({})
  mocks.role.mockResolvedValue({ data: { roleId: 1 }, error: null })
  mocks.contact.mockResolvedValue({ data: { email: "owner@example.com", username: "owner" }, error: null })
  mocks.send.mockResolvedValue({ data: { id: "message" }, error: null })
})

it.each([
  { reporteId: "7", estadoId: "2", comentario: "  Listo  " },
  { reportId: "7", statusId: "2", comment: "  Listo  " },
])("preserves aliases, coercion and trimming: %j", async (body) => {
  const response = await POST(new NextRequest("http://localhost/api/send-status-notification", { method: "POST", body: JSON.stringify(body) }))
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ success: true, messageId: "message" })
  expect(mocks.eq.mock.calls).toEqual([["id", 7], ["id", 2]])
  expect(mocks.send).toHaveBeenCalledExactlyOnceWith({ ownerEmail: "owner@example.com", ownerUsername: "owner", reporteId: 7, reporteTitulo: "Bache", nuevoEstado: "Reparado", comentario: "Listo" })
})

it.each([{}, { reportId: "x", statusId: 2 }, { reportId: 7, statusId: 2, comment: "x".repeat(4001) }])("rejects malformed input before external work", async (body) => {
  const response = await POST(new NextRequest("http://localhost/api/send-status-notification", { method: "POST", body: JSON.stringify(body) }))
  expect(response.status).toBe(400)
  expect(await response.json()).toEqual({ error: "Faltan datos requeridos" })
  expect(mocks.createClient).not.toHaveBeenCalled()
  expect(mocks.createAdminClient).not.toHaveBeenCalled()
  expect(mocks.role).not.toHaveBeenCalled()
  expect(mocks.contact).not.toHaveBeenCalled()
  expect(mocks.send).not.toHaveBeenCalled()
})
