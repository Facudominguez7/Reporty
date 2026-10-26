import { NextRequest } from "next/server"
import { beforeEach, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), createAdminClient: vi.fn(), send: vi.fn(), contact: vi.fn(), eq: vi.fn() }))
vi.mock("@/utils/supabase/server", () => ({ createClient: mocks.createClient }))
vi.mock("@/utils/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }))
vi.mock("@/database/queries/profiles", () => ({ getPrivateProfileContact: mocks.contact }))
vi.mock("@/lib/notifications/report-notifications", () => ({ sendCommentNotificationEmail: mocks.send }))
import { POST } from "./route"

beforeEach(() => {
  vi.resetAllMocks()
  mocks.eq.mockReturnValue({ single: async () => ({ data: { id: 7, titulo: "Bache", usuario_id: "owner" }, error: null }) })
  mocks.createClient.mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: "actor", is_anonymous: false } }, error: null }) }, from: () => ({ select: () => ({ eq: mocks.eq }) }) })
  mocks.createAdminClient.mockReturnValue({})
  mocks.contact.mockImplementation(async (_client, id) => ({ data: { email: `${id}@example.com`, username: id }, error: null }))
  mocks.send.mockResolvedValue({ data: { id: "message" }, error: null })
})

it.each([
  { reporteId: "7", comentarioContenido: "  Sigue igual  " },
  { reportId: "7", commentContent: "  Sigue igual  " },
])("preserves aliases, ID coercion and trimming: %j", async (body) => {
  const response = await POST(new NextRequest("http://localhost/api/send-notification", { method: "POST", body: JSON.stringify(body) }))
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ success: true, messageId: "message" })
  expect(mocks.eq).toHaveBeenCalledWith("id", 7)
  expect(mocks.send).toHaveBeenCalledExactlyOnceWith({ ownerEmail: "owner@example.com", ownerUsername: "owner", commenterUsername: "actor", reporteId: 7, reporteTitulo: "Bache", comentarioContenido: "Sigue igual" })
})

it.each([{}, { reportId: "x", commentContent: "texto" }, { reportId: 7, commentContent: "  " }])("rejects malformed input before any external work: %j", async (body) => {
  const response = await POST(new NextRequest("http://localhost/api/send-notification", { method: "POST", body: JSON.stringify(body) }))
  expect(response.status).toBe(400)
  expect(await response.json()).toEqual({ error: "Faltan datos requeridos" })
  expect(mocks.createClient).not.toHaveBeenCalled()
  expect(mocks.createAdminClient).not.toHaveBeenCalled()
  expect(mocks.contact).not.toHaveBeenCalled()
  expect(mocks.send).not.toHaveBeenCalled()
})
