import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ correo: vi.fn(), push: vi.fn() }))
vi.mock("server-only", () => ({}))
vi.mock("@/database/queries/cuadrillas", () => ({}))
vi.mock("@/lib/use-cases/reportes/detail-mutations", () => ({}))
vi.mock("@/lib/notifications/report-notifications", () => ({ sendCrewAssignedEmail: mocks.correo }))
vi.mock("@/lib/push/avisos.server", () => ({ pushCuadrillaAsignada: mocks.push }))

import { notificarCuadrillaAsignada } from "./asignaciones"

const ADMIN = { cliente: "servicio" } as never
const CONTEXTO = {
  id: 9,
  usuarioId: "dueño",
  titulo: "Luminaria apagada",
  estadoId: 1,
  deletedAt: null,
  propietario: { username: "Dueño", email: "duenio@example.invalid" },
}

beforeEach(() => {
  mocks.correo.mockReset().mockResolvedValue(undefined)
  mocks.push.mockReset().mockResolvedValue(undefined)
})

describe("aviso de cuadrilla asignada", () => {
  it("avisa por correo y por push al dueño del reporte", async () => {
    await notificarCuadrillaAsignada(ADMIN, CONTEXTO, "Alumbrado Norte")

    expect(mocks.correo).toHaveBeenCalledWith(expect.objectContaining({ ownerEmail: "duenio@example.invalid", reporteId: 9 }))
    expect(mocks.push).toHaveBeenCalledWith(ADMIN, {
      usuarioId: "dueño",
      reporteId: 9,
      titulo: "Luminaria apagada",
      cuadrillaNombre: "Alumbrado Norte",
    })
  })

  it("envía la push aunque el dueño no tenga correo", async () => {
    await notificarCuadrillaAsignada(ADMIN, { ...CONTEXTO, propietario: { username: "Dueño", email: null } }, null)

    expect(mocks.correo).not.toHaveBeenCalled()
    expect(mocks.push).toHaveBeenCalledOnce()
  })

  it("envía la push aunque falle el correo", async () => {
    mocks.correo.mockRejectedValueOnce(new Error("correo caído"))
    vi.spyOn(console, "error").mockImplementation(() => {})

    await expect(notificarCuadrillaAsignada(ADMIN, CONTEXTO, null)).resolves.toBeUndefined()
    expect(mocks.push).toHaveBeenCalledOnce()
  })

  it("no avisa nada si el reporte no tiene dueño", async () => {
    await notificarCuadrillaAsignada(ADMIN, { ...CONTEXTO, usuarioId: null }, null)

    expect(mocks.correo).not.toHaveBeenCalled()
    expect(mocks.push).not.toHaveBeenCalled()
  })
})
