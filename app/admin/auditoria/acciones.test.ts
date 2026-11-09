import { beforeEach, describe, expect, it, vi } from "vitest"

const getUser = vi.hoisted(() => vi.fn())
const verificarEsAdmin = vi.hoisted(() => vi.fn())
const ejecutarArchivado = vi.hoisted(() => vi.fn())
const crearDependenciasArchivado = vi.hoisted(() => vi.fn(() => ({ dependencias: true })))
const diagnosticarR2 = vi.hoisted(() => vi.fn())
const crearClienteR2 = vi.hoisted(() => vi.fn(() => ({ clienteR2: true })))
const leerConfiguracionArchivo = vi.hoisted(() => vi.fn(() => ({ bucket: "reporty-audit-archive" })))
const redirect = vi.hoisted(() => vi.fn((destino: string) => {
  throw new Error(`REDIRECT:${destino}`)
}))

vi.mock("@/utils/supabase/server", () => ({ createClient: async () => ({ auth: { getUser } }) }))
vi.mock("@/database/queries/admin/verificar-admin", () => ({ verificarEsAdmin }))
vi.mock("@/lib/auditoria-archivo/datos-archivado", () => ({ crearDependenciasArchivado }))
vi.mock("@/lib/auditoria-archivo/servicio-archivado", () => ({ ejecutarArchivado }))
vi.mock("@/lib/auditoria-archivo/diagnostico", () => ({ diagnosticarR2 }))
vi.mock("@/lib/auditoria-archivo/cliente-r2", () => ({ crearClienteR2 }))
const pruebasDelPanelHabilitadas = vi.hoisted(() => vi.fn(() => true))
vi.mock("@/lib/auditoria-archivo/configuracion", () => ({
  LIMITE_CORRIDA_MANUAL: 200,
  leerConfiguracionArchivo,
  pruebasDelPanelHabilitadas,
}))
vi.mock("next/navigation", () => ({ redirect }))

import { diagnosticarConexionR2Action, ejecutarArchivadoManualAction, simularArchivadoAction } from "./acciones"

const usuario = { id: "00000000-0000-4000-8000-0000000000a1" }

beforeEach(() => {
  getUser.mockReset().mockResolvedValue({ data: { user: usuario } })
  verificarEsAdmin.mockReset().mockResolvedValue({ isAdmin: true, error: null })
  ejecutarArchivado.mockReset().mockResolvedValue({ elegibles: 7 })
  redirect.mockClear()
  diagnosticarR2.mockReset().mockResolvedValue({ ok: true, detalle: "Lectura, escritura e integridad verificadas." })
})

async function ejecutar(accion: () => Promise<void> = simularArchivadoAction): Promise<string> {
  try {
    await accion()
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

describe("diagnóstico de R2 desde el panel", () => {
  it("no deja diagnosticar a quien no es Admin", async () => {
    verificarEsAdmin.mockResolvedValueOnce({ isAdmin: false, error: null })

    expect(await ejecutar(diagnosticarConexionR2Action)).toBe("REDIRECT:/mapa")
    expect(diagnosticarR2).not.toHaveBeenCalled()
  })

  it("informa el resultado del diagnóstico en la URL", async () => {
    expect(await ejecutar(diagnosticarConexionR2Action))
      .toBe("REDIRECT:/admin/auditoria?r2=ok&detalle=Lectura%2C%20escritura%20e%20integridad%20verificadas.")

    expect(crearClienteR2).toHaveBeenCalledWith({ bucket: "reporty-audit-archive" })
    expect(diagnosticarR2).toHaveBeenCalledWith({ clienteR2: true }, { bucket: "reporty-audit-archive" })
  })

  it("informa el fallo del diagnóstico sin romper el panel", async () => {
    diagnosticarR2.mockResolvedValueOnce({ ok: false, detalle: "El token no tiene permiso de escritura (AccessDenied)." })

    expect(await ejecutar(diagnosticarConexionR2Action))
      .toBe("REDIRECT:/admin/auditoria?r2=error&detalle=El%20token%20no%20tiene%20permiso%20de%20escritura%20(AccessDenied).")
  })
})

describe("corrida real manual", () => {
  it("no archiva nada sin Admin", async () => {
    getUser.mockResolvedValueOnce({ data: { user: null } })

    expect(await ejecutar(ejecutarArchivadoManualAction)).toBe("REDIRECT:/auth?next=/admin/auditoria")
    expect(ejecutarArchivado).not.toHaveBeenCalled()
  })

  it("ejecuta una corrida real acotada con el Admin como ejecutor", async () => {
    ejecutarArchivado.mockResolvedValueOnce({ ok: true, lote: { cantidadRegistros: 12 }, purgado: 0 })

    const destino = await ejecutar(ejecutarArchivadoManualAction)

    expect(destino).toBe("REDIRECT:/admin/auditoria?archivado=ok&eventos=12&purgado=0")
    expect(ejecutarArchivado).toHaveBeenCalledWith(
      { modo: "real", ejecutor: `admin:${usuario.id}`, actorId: usuario.id, limite: 200 },
      { dependencias: true },
    )
  })

  it("informa el resultado aunque la purga esté apagada", async () => {
    ejecutarArchivado.mockResolvedValueOnce({ ok: true, lote: { cantidadRegistros: 3 }, purgado: 0 })

    expect(await ejecutar(ejecutarArchivadoManualAction)).toBe("REDIRECT:/admin/auditoria?archivado=ok&eventos=3&purgado=0")
  })

  it("informa el fallo con los eventos conservados", async () => {
    ejecutarArchivado.mockResolvedValueOnce({ ok: false, lote: null, purgado: 0 })

    expect(await ejecutar(ejecutarArchivadoManualAction)).toBe("REDIRECT:/admin/auditoria?archivado=error&eventos=0&purgado=0")
  })
})

describe("acciones de prueba en producción", () => {
  it("rechaza el diagnóstico aunque lo invoque un Admin", async () => {
    pruebasDelPanelHabilitadas.mockReturnValueOnce(false)

    expect(await ejecutar(diagnosticarConexionR2Action)).toBe("REDIRECT:/admin/auditoria")
    expect(diagnosticarR2).not.toHaveBeenCalled()
  })

  it("rechaza la corrida real manual aunque la invoque un Admin", async () => {
    pruebasDelPanelHabilitadas.mockReturnValueOnce(false)

    expect(await ejecutar(ejecutarArchivadoManualAction)).toBe("REDIRECT:/admin/auditoria")
    expect(ejecutarArchivado).not.toHaveBeenCalled()
  })

  it("mantiene el dry-run disponible en producción", async () => {
    pruebasDelPanelHabilitadas.mockReturnValue(false)

    expect(await ejecutar()).toBe("REDIRECT:/admin/auditoria?simulacion=7")
    pruebasDelPanelHabilitadas.mockReturnValue(true)
  })
})
