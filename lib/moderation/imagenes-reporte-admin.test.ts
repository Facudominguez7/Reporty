import { beforeEach, expect, it, vi } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"

const mocks = vi.hoisted(() => ({ from: vi.fn(), remove: vi.fn() }))
vi.mock("server-only", () => ({}))
vi.mock("@/lib/notifications/report-notifications", () => ({ sendAdminReviewNotificationEmail: vi.fn() }))
vi.mock("./sightengine.server", () => ({ moderarImagen: vi.fn() }))
vi.mock("./avisos-retiro.server", () => ({ enviarAvisoRetiro: vi.fn() }))

import { eliminarFotoReportePublicada } from "./imagenes-reporte.server"

function client(photo: Record<string, unknown> | null) {
  const filters: Array<[string, unknown]> = []
  const actions: string[] = []
  mocks.from.mockImplementation((table: string) => {
    let action = "select"
    const query = {
      select: () => query,
      delete: () => { action = "delete"; actions.push(action); return query },
      eq: (column: string, value: unknown) => { filters.push([column, value]); return query },
      maybeSingle: async () => action === "select" ? { data: photo, error: null } : { data: { id: 22 }, error: null },
    }
    return table === "fotos_reporte" ? query : {}
  })
  mocks.remove.mockResolvedValue({ error: null })
  return { supabase: { from: mocks.from, storage: { from: () => ({ remove: mocks.remove }) } } as unknown as SupabaseClient, filters, actions }
}

beforeEach(() => vi.clearAllMocks())

it("removes only the selected photo row and its exact original/thumbnail objects", async () => {
  const state = client({
    id: 22, reporte_id: 7, url: "https://example.test/original", bucket: "reportes", path: "image/original",
    thumbnail_url: "https://example.test/thumb", thumbnail_bucket: "reportes", thumbnail_path: "image/thumb",
  })

  const result = await eliminarFotoReportePublicada(state.supabase, 7, 22)

  expect(result).toEqual({ success: true, cleanupPending: false })
  expect(state.filters).toEqual([["id", 22], ["reporte_id", 7], ["id", 22], ["reporte_id", 7]])
  expect(mocks.remove).toHaveBeenCalledWith(["image/original", "image/thumb"])
  expect(state.actions).toEqual(["delete"])
})

it("keeps the selected photo row when Storage cleanup fails so removal can be retried", async () => {
  const state = client({ id: 22, reporte_id: 7, url: "https://example.test/original", bucket: "reportes", path: "image/original" })
  mocks.remove.mockResolvedValue({ error: { message: "storage unavailable" } })
  const log = vi.spyOn(console, "error").mockImplementation(() => {})

  expect(await eliminarFotoReportePublicada(state.supabase, 7, 22)).toEqual({ success: false, cleanupPending: true })
  expect(state.actions).toEqual([])
  expect(log).toHaveBeenCalledOnce()
  log.mockRestore()

  mocks.remove.mockResolvedValue({ error: null })
  expect(await eliminarFotoReportePublicada(state.supabase, 7, 22)).toEqual({ success: true, cleanupPending: false })
  expect(state.actions).toEqual(["delete"])
  expect(mocks.remove).toHaveBeenCalledTimes(2)
})

it("does not delete a photo that belongs to another report", async () => {
  const state = client(null)

  expect(await eliminarFotoReportePublicada(state.supabase, 7, 22)).toEqual({ success: false, cleanupPending: false })
  expect(state.actions).toEqual([])
  expect(mocks.remove).not.toHaveBeenCalled()
})
