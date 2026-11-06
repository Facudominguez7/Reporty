import { beforeEach, describe, expect, it, vi } from "vitest"

const { preparar, moderar } = vi.hoisted(() => ({ preparar: vi.fn(), moderar: vi.fn() }))
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
    storage: { from: vi.fn((bucket: string) => ({ upload: async (path: string) => { uploads.push(`${bucket}/${path}`); return { error: null } } })) },
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
