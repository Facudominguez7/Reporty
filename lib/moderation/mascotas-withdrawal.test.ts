import { afterEach, describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))

import { limpiarFotoMascotaRetirada } from "./mascotas-withdrawal.server"

const evidenceId = "40000000-0000-4000-8000-000000000001"
const path = `mascotas/${evidenceId}.webp`

function storageClient(options: { removeError?: unknown; remaining?: boolean; publicAccessible?: boolean } = {}) {
  const pet: { id: number; propietario_id: string; foto_moderacion_id: string; foto_path: string; retirada_at: string | null; foto_limpieza_estado: string } = { id: 7, propietario_id: "owner", foto_moderacion_id: evidenceId, foto_path: path, retirada_at: "2026-11-05T00:00:00Z", foto_limpieza_estado: "pendiente" }
  const evidence = { id: evidenceId, propietario_id: "owner", mascota_id: 7, decision: "APPROVED", estado_publicacion: "publicada", path_publico: path, motivos: [] as string[] }
  const update = vi.fn((values: Record<string, unknown>) => ({
    eq: () => ({
      eq: () => ({
        eq: () => ({ select: () => ({ maybeSingle: async () => { Object.assign(pet, values); return { data: { id: 7 }, error: null } } }) }),
      }),
    }),
  }))
  const remove = vi.fn(async () => ({ error: options.removeError ?? null }))
  const remainsPublic = options.remaining ?? Boolean(options.removeError)
  const download = vi.fn(async () => remainsPublic
    ? { data: new Blob(["still-public"]), error: null }
    : { data: null, error: { statusCode: "404" } })
  const publicUrl = `https://storage.example.test/storage/v1/object/public/reportes/${path}`
  const publicAccessible = options.publicAccessible ?? remainsPublic
  vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: publicAccessible ? 200 : 404 })))
  return {
    pet, evidence, remove, download, update,
    from: vi.fn((table: string) => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: table === "mascotas_perdidas" ? pet : evidence, error: null }) }) }),
      update,
    })),
    storage: { from: vi.fn(() => ({ remove, download, getPublicUrl: () => ({ data: { publicUrl } }) })) },
  }
}

afterEach(() => vi.unstubAllGlobals())

describe("limpiarFotoMascotaRetirada", () => {
  it("removes the exact public object and only confirms privacy after a 404 check", async () => {
    const supabase = storageClient()
    const result = await limpiarFotoMascotaRetirada(supabase as never, 7)
    expect(supabase.remove).toHaveBeenCalledWith([path])
    expect(supabase.download).toHaveBeenCalledWith(path)
    expect(fetch).toHaveBeenCalledWith(`https://storage.example.test/storage/v1/object/public/reportes/${path}`, expect.objectContaining({ cache: "no-store" }))
    expect(result).toMatchObject({ removed: true, pending: false, publiclyAccessible: false })
    expect(supabase.pet.foto_limpieza_estado).toBe("completada")
    const retry = await limpiarFotoMascotaRetirada(supabase as never, 7)
    expect(retry).toMatchObject({ removed: true, pending: false, publiclyAccessible: false })
    expect(supabase.remove).toHaveBeenCalledTimes(1)
  })

  it.each([
    [{ removeError: new Error("storage unavailable") }],
    [{ remaining: true }],
  ])("keeps cleanup durable and reports public access when deletion cannot be confirmed", async (options) => {
    const supabase = storageClient(options as never)
    const result = await limpiarFotoMascotaRetirada(supabase as never, 7)
    expect(result).toMatchObject({ removed: false, pending: true, publiclyAccessible: true })
    expect(supabase.pet.foto_limpieza_estado).toBe("pendiente")
  })

  it("keeps cleanup pending when a stale public URL still serves a cached copy", async () => {
    const supabase = storageClient({ publicAccessible: true })
    const result = await limpiarFotoMascotaRetirada(supabase as never, 7)
    expect(supabase.download).toHaveBeenCalledWith(path)
    expect(result).toMatchObject({ removed: false, pending: true, publiclyAccessible: true })
    expect(supabase.pet.foto_limpieza_estado).toBe("pendiente")
  })

  it("does not delete while the row is not durably withdrawn", async () => {
    const supabase = storageClient()
    supabase.pet.retirada_at = null
    const result = await limpiarFotoMascotaRetirada(supabase as never, 7)
    expect(result.removed).toBe(false)
    expect(supabase.remove).not.toHaveBeenCalled()
  })
})
