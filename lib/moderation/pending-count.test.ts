import { beforeEach, describe, expect, it, vi } from "vitest"

const authorize = vi.hoisted(() => vi.fn())
vi.mock("server-only", () => ({}))
vi.mock("./administracion.server", () => ({ autorizarAdministracion: authorize }))

import { getPendingReviewCount } from "./pending-count.server"

beforeEach(() => vi.resetAllMocks())

describe("getPendingReviewCount", () => {
  it("counts only reviews awaiting a human decision", async () => {
    const eq = vi.fn().mockResolvedValue({ count: 2, error: null })
    const decisionEq = vi.fn().mockReturnValue({ eq })
    const select = vi.fn().mockReturnValue({ eq: decisionEq })
    const from = vi.fn().mockReturnValue({ select })
    authorize.mockResolvedValue({ servicio: { from } })

    expect(await getPendingReviewCount()).toBe(2)
    expect(from).toHaveBeenCalledWith("moderacion_imagenes")
    expect(select).toHaveBeenCalledWith("id", { count: "exact", head: true })
    expect(decisionEq).toHaveBeenCalledWith("decision", "REVIEW")
    expect(eq).toHaveBeenCalledWith("estado_publicacion", "pendiente")
  })

  it("does not return a misleading zero when the count fails", async () => {
    authorize.mockResolvedValue({ servicio: { from: () => ({ select: () => ({ eq: () => ({ eq: async () => ({ count: null, error: new Error("unavailable") }) }) }) }) } })
    expect(await getPendingReviewCount()).toBeNull()
  })
})
