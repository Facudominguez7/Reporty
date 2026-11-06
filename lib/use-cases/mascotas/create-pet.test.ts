import { beforeEach, describe, expect, it, vi } from "vitest"

const { role, moderate, validateImage } = vi.hoisted(() => ({ role: vi.fn(), moderate: vi.fn(), validateImage: vi.fn() }))
vi.mock("server-only", () => ({}))
vi.mock("@/lib/authz/roles", () => ({ getUserRoleContext: role, isGuestRole: (id: number) => id === 5 }))
vi.mock("@/lib/media/report-image-validation.server", () => ({ validateUploadedReportImage: validateImage }))
vi.mock("@/lib/moderation/mascotas-imagen.server", () => ({ crearFotoMascotaModerada: moderate }))

import { crearMascotaWorkflow } from "./create-pet"

beforeEach(() => {
  vi.clearAllMocks()
  role.mockResolvedValue({ data: { roleId: 2 }, error: null })
  validateImage.mockResolvedValue({ type: "image/webp", width: 10, height: 10 })
  moderate.mockResolvedValue({ mascotaId: 1, decision: "APPROVED", pointsAwarded: 10, mensaje: "published" })
})

describe("crearMascotaWorkflow", () => {
  const input = {
    propietarioId: "owner", tipoAnimal: "perro" as const, descripcion: "Collar azul", lat: -34, lon: -56,
    telefono: "112233", image: new File(["photo"], "photo.webp", { type: "image/webp" }),
  }

  it("reports publication only when the approved photo has a pet ID", async () => {
    expect(await crearMascotaWorkflow({} as never, input)).toMatchObject({
      success: true, data: { mascotaId: 1, moderation: "APPROVED", pointsAwarded: 10 },
    })
    moderate.mockResolvedValueOnce({ mascotaId: null, decision: "APPROVED", pointsAwarded: 0, mensaje: "Publicación pendiente" })
    expect(await crearMascotaWorkflow({} as never, input)).toMatchObject({
      success: true, data: { mascotaId: null, moderation: "PENDING", message: "Publicación pendiente" },
    })
  })

  it.each(["REVIEW", "REJECTED"] as const)("preserves the %s moderation message", async (decision) => {
    moderate.mockResolvedValueOnce({ mascotaId: null, decision, pointsAwarded: 0, mensaje: "Moderación pendiente" })
    expect(await crearMascotaWorkflow({} as never, input)).toMatchObject({
      success: true, data: { mascotaId: null, moderation: decision, message: "Moderación pendiente" },
    })
  })

  it("rejects unsupported photo types before moderation", async () => {
    const result = await crearMascotaWorkflow({} as never, {
      propietarioId: "owner", tipoAnimal: "perro", descripcion: "Collar azul", lat: -34, lon: -56,
      telefono: "112233", image: new File(["not an image"], "photo.gif", { type: "image/gif" }),
    })
    expect(result).toMatchObject({ success: false })
    expect(moderate).not.toHaveBeenCalled()
  })

  it("rejects guest database roles before reading photo bytes", async () => {
    role.mockResolvedValueOnce({ data: { roleId: 5 }, error: null })
    const result = await crearMascotaWorkflow({} as never, {
      propietarioId: "owner", tipoAnimal: "perro", descripcion: "Collar azul", lat: -34, lon: -56,
      telefono: "112233", image: new File(["photo"], "photo.webp", { type: "image/webp" }),
    })
    expect(result).toMatchObject({ success: false })
    expect(validateImage).not.toHaveBeenCalled()
    expect(moderate).not.toHaveBeenCalled()
  })
})
