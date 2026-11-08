import { describe, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({ verify: vi.fn(), createAdminClient: vi.fn() }))
vi.mock("./verificar-admin", () => ({ verificarEsAdmin: mocks.verify }))
vi.mock("@/utils/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }))
import { getAdminMascotas } from "./admin-mascotas"

describe("getAdminMascotas", () => {
  it("does not query pets for a non-admin", async () => {
    mocks.verify.mockResolvedValue({ isAdmin: false, error: null })
    const supabase = { from: vi.fn() }
    expect((await getAdminMascotas(supabase as never, "user")).unauthorized).toBe(true)
    expect(supabase.from).not.toHaveBeenCalled()
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
  })
  it("applies bounded search, filters and pagination", async () => {
    mocks.verify.mockResolvedValue({ isAdmin: true, error: null })
    const builder: any = {}
    for (const method of ["select", "ilike", "eq", "order", "range"]) builder[method] = vi.fn(() => builder)
    builder.returns = vi.fn().mockResolvedValue({ data: [], count: 0, error: null })
    const supabase = { from: vi.fn() }
    const servicio = { from: vi.fn(() => builder) }
    mocks.createAdminClient.mockReturnValue(servicio)
    const result = await getAdminMascotas(supabase as never, "admin", { search: "  perro%  ", estado: "perdida", tipo: "gato", page: 2, pageSize: 500 })
    expect(result).toMatchObject({ page: 2, pageSize: 50, unauthorized: false })
    expect(servicio.from).toHaveBeenCalledWith("mascotas_perdidas")
    expect(supabase.from).not.toHaveBeenCalled()
    expect(builder.ilike).toHaveBeenCalledWith("descripcion", "%perro\\%%")
    expect(builder.range).toHaveBeenCalledWith(50, 99)
  })
})
