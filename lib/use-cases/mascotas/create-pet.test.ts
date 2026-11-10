import { beforeEach, describe, expect, it, vi } from "vitest"

const { role, moderate, validateImage, moderateText, rpc } = vi.hoisted(() => ({ role: vi.fn(), moderate: vi.fn(), validateImage: vi.fn(), moderateText: vi.fn(), rpc: vi.fn() }))
vi.mock("server-only", () => ({}))
vi.mock("@/lib/authz/roles", () => ({ getUserRoleContext: role, isGuestRole: (id: number) => id === 5 }))
vi.mock("@/lib/media/report-image-validation.server", () => ({ validateUploadedReportImage: validateImage }))
vi.mock("@/lib/moderation/mascotas-imagen.server", () => ({ crearFotoMascotaModerada: moderate }))
vi.mock("@/lib/moderation/textos.server", () => ({ moderateText }))

import { crearMascotaWorkflow } from "./create-pet"

beforeEach(() => {
  vi.clearAllMocks()
  role.mockResolvedValue({ data: { roleId: 2 }, error: null })
  validateImage.mockResolvedValue({ type: "image/webp", width: 10, height: 10 })
  moderate.mockResolvedValue({ mascotaId: 1, decision: "APPROVED", pointsAwarded: 10, mensaje: "published" })
  moderateText.mockResolvedValue({ decision: "APPROVED", motivo: "RELEVANT" })
  rpc.mockReset().mockResolvedValue({ data: true, error: null })
})

describe("crearMascotaWorkflow", () => {
  const input = {
    propietarioId: "owner", tipoAnimal: "perro" as const, descripcion: "Collar azul", lat: -34, lon: -56,
    telefono: "112233", image: new File(["photo"], "photo.webp", { type: "image/webp" }),
  }

  it("reserves and approves contextual text before publishing a legitimate pet injury", async () => {
    const supabase = { rpc }
    const injury = { ...input, descripcion: "Perro con la cola rota, necesita atención veterinaria." }
    expect(await crearMascotaWorkflow(supabase as never, injury)).toMatchObject({ success: true, data: { moderation: "APPROVED" } })
    expect(moderateText).toHaveBeenCalledWith({ tipo: "mascota", tipoAnimal: "perro", descripcion: injury.descripcion })
    expect(rpc).toHaveBeenCalledWith("reservar_presupuesto_texto", { p_usuario_id: "owner" })
    expect(rpc.mock.invocationCallOrder[0]).toBeLessThan(moderateText.mock.invocationCallOrder[0])
    expect(moderateText.mock.invocationCallOrder[0]).toBeLessThan(moderate.mock.invocationCallOrder[0])
  })

  it.each([false, null])("blocks when text reservation fails (%s)", async (data) => {
    rpc.mockResolvedValueOnce({ data, error: data === null ? { message: "failed" } : null })
    expect(await crearMascotaWorkflow({ rpc } as never, input)).toMatchObject({ success: false })
    expect(moderateText).not.toHaveBeenCalled()
    expect(moderate).not.toHaveBeenCalled()
  })

  it.each(["REJECTED", "REVIEW", "UNAVAILABLE"] as const)("blocks pet publication on text result %s", async (decision) => {
    const motivo = decision === "UNAVAILABLE" ? "SERVICE_UNAVAILABLE" : decision === "REVIEW" ? "UNCERTAIN" : "OFF_TOPIC"
    moderateText.mockResolvedValueOnce({ decision, motivo, error: "No permitido" })
    expect(await crearMascotaWorkflow({ rpc } as never, input)).toEqual({
      success: false, error: "No permitido",
      errorKind: decision === "UNAVAILABLE" ? "verification" : "moderation",
    })
    expect(moderate).not.toHaveBeenCalled()
  })

  it("preserves a timeout as a technical failure without publishing", async () => {
    moderateText.mockResolvedValueOnce({ decision: "UNAVAILABLE", motivo: "TIMEOUT", error: "La verificación tardó demasiado. Intentá nuevamente." })
    expect(await crearMascotaWorkflow({ rpc } as never, input)).toEqual({
      success: false, errorKind: "timeout", error: "La verificación tardó demasiado. Intentá nuevamente.",
    })
    expect(moderate).not.toHaveBeenCalled()
  })

  it("reports publication only when the approved photo has a pet ID", async () => {
    expect(await crearMascotaWorkflow({ rpc } as never, input)).toMatchObject({
      success: true, data: { mascotaId: 1, moderation: "APPROVED", pointsAwarded: 10 },
    })
    moderate.mockResolvedValueOnce({ mascotaId: null, decision: "APPROVED", pointsAwarded: 0, mensaje: "Publicación pendiente" })
    expect(await crearMascotaWorkflow({ rpc } as never, input)).toMatchObject({
      success: true, data: { mascotaId: null, moderation: "PENDING", message: "Publicación pendiente" },
    })
  })

  it.each(["REVIEW", "REJECTED"] as const)("preserves the %s moderation message", async (decision) => {
    moderate.mockResolvedValueOnce({ mascotaId: null, decision, pointsAwarded: 0, mensaje: "Moderación pendiente" })
    expect(await crearMascotaWorkflow({ rpc } as never, input)).toMatchObject({
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
