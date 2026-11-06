import { afterEach, describe, expect, it, vi } from "vitest"
import { StorageClient } from "@supabase/storage-js"
vi.mock("server-only", () => ({}))

import { limpiarFotoMascotaRetirada } from "./mascotas-withdrawal.server"

const evidenceId = "40000000-0000-4000-8000-000000000001"
const path = `mascotas/${evidenceId}.webp`

function storageClient(options: { removeError?: unknown; remaining?: boolean; publicAccessible?: boolean; downloadError?: unknown } = {}) {
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
    : { data: null, error: options.downloadError ?? { name: "StorageUnknownError", originalError: new Response(JSON.stringify({ statusCode: "404", error: "not_found", code: "NoSuchKey" }), { status: 400 }) } })
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

async function sdkDownloadError(status: number, body: string) {
  const storage = new StorageClient("https://storage.example.test", {}, async () => new Response(body, { status }))
  const { error } = await storage.from("reportes").download(path)
  expect(error?.name).toBe("StorageUnknownError")
  return error
}

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

  it.each(["404", 404])("accepts a public HTTP 400 NoSuchKey with statusCode %s only when the object is also absent", async (statusCode) => {
    const body = JSON.stringify({ statusCode, code: "NoSuchKey", error: "not_found" })
    const supabase = storageClient()
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status: 400 })))
    expect(await limpiarFotoMascotaRetirada(supabase as never, 7)).toEqual({ removed: true, pending: false, publiclyAccessible: false })

    const remaining = storageClient({ remaining: true })
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status: 400 })))
    expect(await limpiarFotoMascotaRetirada(remaining as never, 7)).toEqual({ removed: false, pending: true, publiclyAccessible: true })
  })

  it.each([
    "not JSON",
    JSON.stringify({ statusCode: "404", code: "NoSuchBucket", error: "not_found" }),
    JSON.stringify({ statusCode: "500", code: "NoSuchKey", error: "not_found" }),
    JSON.stringify({ statusCode: "404", code: "NoSuchKey" }),
  ])("keeps cleanup pending for ambiguous public HTTP 400 bodies", async (body) => {
    const supabase = storageClient()
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status: 400 })))
    expect(await limpiarFotoMascotaRetirada(supabase as never, 7)).toEqual({ removed: false, pending: true, publiclyAccessible: true })
  })

  it("keeps cleanup pending when the public request fails", async () => {
    const supabase = storageClient()
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network failure") }))
    expect(await limpiarFotoMascotaRetirada(supabase as never, 7)).toEqual({ removed: false, pending: true, publiclyAccessible: true })
  })

  it("recognizes the SDK's wrapped NoSuchKey response only when the public URL is inaccessible", async () => {
    const body = JSON.stringify({ statusCode: "404", error: "not_found", message: "Object not found", code: "NoSuchKey" })
    const error = await sdkDownloadError(400, body)
    const supabase = storageClient({ downloadError: error })
    expect(await limpiarFotoMascotaRetirada(supabase as never, 7)).toEqual({ removed: true, pending: false, publiclyAccessible: false })

    const publicError = await sdkDownloadError(400, body)
    const stillPublic = storageClient({ downloadError: publicError, publicAccessible: true })
    expect(await limpiarFotoMascotaRetirada(stillPublic as never, 7)).toEqual({ removed: false, pending: true, publiclyAccessible: true })
  })

  it.each([
    [400, JSON.stringify({ statusCode: "404", error: "Bucket not found", code: "NoSuchBucket" })],
    [500, JSON.stringify({ statusCode: "404", error: "not_found", code: "NoSuchKey" })],
    [400, "not JSON"],
    [400, JSON.stringify({ statusCode: "404" })],
  ])("keeps cleanup pending for ambiguous SDK errors (HTTP %s)", async (status, body) => {
    const error = await sdkDownloadError(status, body)
    const supabase = storageClient({ downloadError: error })
    expect(await limpiarFotoMascotaRetirada(supabase as never, 7)).toEqual({ removed: false, pending: true, publiclyAccessible: true })
    expect(supabase.pet.foto_limpieza_estado).toBe("pendiente")
  })

  it("keeps cleanup pending on an SDK network error", async () => {
    const storage = new StorageClient("https://storage.example.test", {}, async () => { throw new Error("network failure") })
    const { error } = await storage.from("reportes").download(path)
    const supabase = storageClient({ downloadError: error })
    expect(await limpiarFotoMascotaRetirada(supabase as never, 7)).toEqual({ removed: false, pending: true, publiclyAccessible: true })
  })

  it("does not treat an ambiguous 404 error as proof that the object is absent", async () => {
    const supabase = storageClient({ downloadError: { statusCode: "404" } })
    expect(await limpiarFotoMascotaRetirada(supabase as never, 7)).toEqual({ removed: false, pending: true, publiclyAccessible: true })
  })

  it("does not delete while the row is not durably withdrawn", async () => {
    const supabase = storageClient()
    supabase.pet.retirada_at = null
    const result = await limpiarFotoMascotaRetirada(supabase as never, 7)
    expect(result.removed).toBe(false)
    expect(supabase.remove).not.toHaveBeenCalled()
  })
})
