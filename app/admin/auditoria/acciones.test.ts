import { beforeEach, describe, expect, it, vi } from "vitest"

const getUser = vi.hoisted(() => vi.fn())
const verificarEsAdmin = vi.hoisted(() => vi.fn())
const ejecutarArchivado = vi.hoisted(() => vi.fn())
const crearDependenciasArchivado = vi.hoisted(() => vi.fn(() => ({ dependencias: true })))
const redirect = vi.hoisted(() => vi.fn((destino: string) => {
  throw new Error(`REDIRECT:${destino}`)
}))

vi.mock("@/utils/supabase/server", () => ({ createClient: async () => ({ auth: { getUser } }) }))
vi.mock("@/database/queries/admin/verificar-admin", () => ({ verificarEsAdmin }))
vi.mock("@/lib/auditoria-archivo/datos-archivado", () => ({ crearDependenciasArchivado }))
vi.mock("@/lib/auditoria-archivo/servicio-archivado", () => ({ ejecutarArchivado }))
vi.mock("next/navigation", () => ({ redirect }))

import { simularArchivadoAction } from "./acciones"

const usuario = { id: "00000000-0000-4000-8000-0000000000a1" }

beforeEach(() => {
  getUser.mockReset().mockResolvedValue({ data: { user: usuario } })
  verificarEsAdmin.mockReset().mockResolvedValue({ isAdmin: true, error: null })
  ejecutarArchivado.mockReset().mockResolvedValue({ elegibles: 7 })
  redirect.mockClear()
})

async function ejecutar(): Promise<string> {
  try {
    await simularArchivadoAction()
  } catch (error) {
    return (error as Error).message
  }
  return "sin-redirect"
}

describe("simulación manual del archivado", () => {
  it("manda al acceso cuando no hay sesión", async () => {
    getUser.mockResolvedValueOnce({ data: { user: null } })

    expect(await ejecutar()).toBe("REDIRECT:/auth?next=/admin/auditoria")
    expect(ejecutarArchivado).not.toHaveBeenCalled()
  })

  it("no deja simular a quien no es Admin", async () => {
    verificarEsAdmin.mockResolvedValueOnce({ isAdmin: false, error: null })

    expect(await ejecutar()).toBe("REDIRECT:/mapa")
    expect(ejecutarArchivado).not.toHaveBeenCalled()
  })

  it("simula siempre en dry-run con el Admin como ejecutor", async () => {
    expect(await ejecutar()).toBe("REDIRECT:/admin/auditoria?simulacion=7")

    expect(ejecutarArchivado).toHaveBeenCalledWith(
      { modo: "dry-run", ejecutor: `admin:${usuario.id}`, actorId: usuario.id },
      { dependencias: true },
    )
  })

  it("informa el fallo de configuración sin romper el panel", async () => {
    ejecutarArchivado.mockRejectedValueOnce(new Error("Falta configuración de Cloudflare R2"))

    expect(await ejecutar()).toBe("REDIRECT:/admin/auditoria?simulacion=error")
  })
})
