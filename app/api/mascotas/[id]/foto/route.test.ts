import { beforeEach, describe, expect, it, vi } from "vitest"
import { GET } from "./route"

const mocks = vi.hoisted(() => ({ select: vi.fn(), eq: vi.fn(), is: vi.fn(), maybeSingle: vi.fn(), download: vi.fn(), client: {} as any }))
vi.mock("@/utils/supabase/admin", () => ({ createAdminClient: () => mocks.client }))
beforeEach(() => {
  for (const fn of [mocks.select, mocks.eq, mocks.is, mocks.maybeSingle]) fn.mockReset()
  mocks.download.mockReset()
  const query = { select: mocks.select, eq: mocks.eq, is: mocks.is, maybeSingle: mocks.maybeSingle }
  for (const fn of [mocks.select, mocks.eq, mocks.is]) fn.mockReturnValue(query)
  mocks.maybeSingle.mockResolvedValue({ data: { foto_path: "mascotas/7.webp" }, error: null })
  mocks.download.mockResolvedValue({ data: new Blob(["photo"]), error: null })
  mocks.client = { from: vi.fn(() => query), storage: { from: vi.fn(() => ({ download: mocks.download })) } }
})

describe("GET /api/mascotas/[id]/foto", () => {
  it("serves bytes only after checking approved and non-withdrawn visibility by ID", async () => {
    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: "7" }) })
    expect(mocks.select).toHaveBeenCalledWith("foto_path")
    expect(mocks.eq).toHaveBeenCalledWith("id", 7)
    expect(mocks.eq).toHaveBeenCalledWith("moderacion_estado", "aprobada")
    expect(mocks.is).toHaveBeenCalledWith("retirada_at", null)
    expect(mocks.download).toHaveBeenCalledWith("mascotas/7.webp")
    expect(response.status).toBe(200)
    expect(await response.text()).toBe("photo")
    expect(response.headers.get("cache-control")).toBe("private, no-store")
  })

  it("does not read storage when the pet is missing or hidden", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null })
    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: "7" }) })
    expect(response.status).toBe(404)
    expect(mocks.download).not.toHaveBeenCalled()
  })
})
