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
