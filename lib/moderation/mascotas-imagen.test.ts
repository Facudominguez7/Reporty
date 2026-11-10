import { beforeEach, describe, expect, it, vi } from "vitest"
import { createHash } from "node:crypto"

const { preparar, moderar, guardarDireccion } = vi.hoisted(() => ({ preparar: vi.fn(), moderar: vi.fn(), guardarDireccion: vi.fn(async () => null) }))
vi.mock("@/lib/mascotas/direccion-mascota.server", () => ({ guardarDireccionMascota: guardarDireccion }))
vi.mock("server-only", () => ({}))
vi.mock("@/lib/media/preparar-imagen-reporte.server", () => ({ prepararImagenReporte: preparar }))
vi.mock("./sightengine.server", () => ({ moderarImagen: moderar }))

import { crearFotoMascotaModerada, publicarMascotaAprobada } from "./mascotas-imagen.server"

const canonical = Buffer.from("RIFF0000WEBP-data")

function client() {
  let row: Record<string, unknown> = {}
  const uploads: string[] = []
  const calls: string[] = []
  return {
    uploads, calls,
    from: vi.fn(() => ({
      insert: vi.fn((value) => ({ select: () => ({ single: async () => { row = value; return { data: row, error: null } } }) })),
      update: vi.fn((value) => {
        const builder = {
          eq: () => builder,
          select: () => ({
            single: async () => { row = { ...row, ...value }; return { data: row, error: null } },
            maybeSingle: async () => { row = { ...row, ...value }; return { data: row, error: null } },
          }),
          then: (resolve: (value: unknown) => unknown) => {
            row = { ...row, ...value }
            return Promise.resolve(resolve({ error: null }))
          },
        }
        return builder
      }),
    })),
    storage: { from: vi.fn((bucket: string) => ({ upload: async (path: string): Promise<{ error: { message: string } | null }> => { uploads.push(`${bucket}/${path}`); return { error: null } } })) },
    rpc: vi.fn(async (name: string) => {
      calls.push(name)
      if (name === "reservar_operaciones_moderacion") return { data: true, error: null }
      if (name === "registrar_operaciones_moderacion") return { data: true, error: null }
      return { data: 9, error: null }
    }),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  preparar.mockResolvedValue({ original: canonical, miniatura: canonical })
})

describe("publicarMascotaAprobada", () => {
  function publicationClient(state: "pendiente" | "publicando", uploadError = false, status = 400) {
    const evidence = { id: "photo", propietario_id: "owner", path_privado: "private", decision: "APPROVED", estado_publicacion: state, publish_token: state === "publicando" ? "old-token" : null, hash_sha256: createHash("sha256").update(canonical).digest("hex") }
    const missing = () => ({ data: null, error: { name: "StorageUnknownError", originalError: new Response(JSON.stringify({ statusCode: "404", error: "not_found", code: "NoSuchKey" }), { status }) } })
    let uploaded = false
    const upload = vi.fn(async () => { uploaded = !uploadError; return { error: uploadError ? new Error("uncertain") : null } })
    const update = vi.fn(() => {
      const builder = { eq: () => builder, select: () => ({ maybeSingle: async () => ({ data: { id: "photo" }, error: null }) }) }
      return builder
    })
    const supabase = {
      from: vi.fn((table: string) => ({
        select: () => ({ eq: () => ({ single: async () => ({ data: evidence, error: null }), maybeSingle: async () => ({ data: null, error: null }) }) }),
        update,
      })),
      storage: { from: (bucket: string) => ({
        download: async () => bucket === "reportes-pendientes" || uploaded ? { data: new Blob([canonical]), error: null } : missing(),
        upload,
      }) },
      rpc: vi.fn(async (name: string) => ({ data: name === "reclamar_publicacion_mascota" ? "new-token" : 9, error: null })),
    }
    return { supabase, evidence, upload, update }
  }

  const fields = { tipoAnimal: "perro", descripcion: "Collar azul", lat: -34, lon: -56, telefono: "112233" } as const

  it("publishes a fresh claim when Storage wraps a NoSuchKey response", async () => {
    const { supabase, evidence, upload } = publicationClient("pendiente")
    expect(await publicarMascotaAprobada(supabase as never, evidence as never, fields)).toEqual({ mascotaId: 9, pointsAwarded: 10 })
    expect(upload).toHaveBeenCalledOnce()
  })

  it("saves the written street of the new pet after publishing it", async () => {
    const { supabase, evidence } = publicationClient("pendiente")
    await publicarMascotaAprobada(supabase as never, evidence as never, fields)
    expect(guardarDireccion).toHaveBeenCalledWith(supabase, 9, -34, -56)
  })

  it("does not reupload for an outstanding claim even if the object is absent", async () => {
    const { supabase, evidence, upload } = publicationClient("publicando")
    expect(await publicarMascotaAprobada(supabase as never, evidence as never, fields)).toEqual({ mascotaId: null, pointsAwarded: 0 })
    expect(upload).not.toHaveBeenCalled()
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it("does not upload when the apparent missing-object response has an unexpected HTTP status", async () => {
    const { supabase, evidence, upload } = publicationClient("pendiente", false, 500)
    expect(await publicarMascotaAprobada(supabase as never, evidence as never, fields)).toEqual({ mascotaId: null, pointsAwarded: 0 })
    expect(upload).not.toHaveBeenCalled()
  })

  it("keeps the claim after an uncertain upload failure", async () => {
    const { supabase, evidence, upload, update } = publicationClient("pendiente", true)
    expect(await publicarMascotaAprobada(supabase as never, evidence as never, fields)).toEqual({ mascotaId: null, pointsAwarded: 0 })
    expect(upload).toHaveBeenCalledOnce()
    expect(update).not.toHaveBeenCalled()
  })

  it("never republishes an already withdrawn pet photo", async () => {
    const evidence = { id: "photo", propietario_id: "owner", decision: "APPROVED", estado_publicacion: "publicada", path_publico: "mascotas/photo.webp" }
    const storage = { from: vi.fn() }
    const supabase = {
      from: vi.fn((table: string) => ({
        select: () => ({ eq: () => ({ single: async () => table === "mascotas_fotos_moderacion"
          ? { data: evidence, error: null }
          : { data: null, error: null }, maybeSingle: async () => ({ data: { id: 8, retirada_at: "2026-11-05T00:00:00Z" }, error: null }) }) }),
      })),
      storage, rpc: vi.fn(),
    }

    const result = await publicarMascotaAprobada(supabase as never, evidence as never)

    expect(result).toEqual({ mascotaId: null, pointsAwarded: 0 })
    expect(storage.from).not.toHaveBeenCalled()
    expect(supabase.rpc).not.toHaveBeenCalled()
  })
})

describe("crearFotoMascotaModerada", () => {
  it("does not claim the image was stored for review when the private upload fails", async () => {
    const supabase = client()
    supabase.storage.from.mockReturnValueOnce({ upload: async () => ({ error: { message: "upload failed" } }) })

    const result = await crearFotoMascotaModerada(supabase as never, {
      propietarioId: "owner", tipoAnimal: "perro", descripcion: "Collar azul", lat: -34, lon: -56,
      telefono: "112233", image: new File([canonical], "pet.webp", { type: "image/webp" }),
    })

    expect(result).toMatchObject({ mascotaId: null, decision: "REVIEW" })
    expect(result.mensaje).toContain("No pudimos guardar la foto")
    expect(supabase.calls).not.toContain("crear_mascota_perdida")
  })

  it("fails closed to private REVIEW when provider operation accounting is unexpected", async () => {
    const supabase = client()
    moderar.mockResolvedValue({ decision: "APPROVED", motivos: ["indicadores_seguros"], operaciones: 1, proveedor: "sightengine" })

    const result = await crearFotoMascotaModerada(supabase as never, {
      propietarioId: "owner", tipoAnimal: "perro", descripcion: "Collar azul", lat: -34, lon: -56,
      telefono: "112233", image: new File([canonical], "pet.webp", { type: "image/webp" }),
    })

    expect(result).toMatchObject({ mascotaId: null, decision: "REVIEW", pointsAwarded: 0 })
    expect(supabase.uploads).toHaveLength(1)
    expect(supabase.uploads[0]).toMatch(/^reportes-pendientes\//)
    expect(supabase.calls).not.toContain("crear_mascota_perdida")
  })

  it("stops further provider use when observed operations exceed the reservation", async () => {
    const supabase = client()
    moderar.mockResolvedValue({ decision: "REVIEW", motivos: ["operaciones_inesperadas"], operaciones: 3, proveedor: "sightengine" })

    const result = await crearFotoMascotaModerada(supabase as never, {
      propietarioId: "owner", tipoAnimal: "gato", descripcion: "Collar rojo", lat: -34, lon: -56,
      telefono: "112233", image: new File([canonical], "pet.webp", { type: "image/webp" }),
    })

    expect(result.decision).toBe("REVIEW")
    expect(supabase.calls).toContain("reducir_presupuesto_moderacion")
    expect(supabase.calls).not.toContain("crear_mascota_perdida")
  })
})
