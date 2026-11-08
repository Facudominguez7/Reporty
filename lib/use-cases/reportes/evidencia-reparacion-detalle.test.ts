import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  sesion: vi.fn(),
  servicio: vi.fn(),
}))

vi.mock("server-only", () => ({}))
vi.mock("@/utils/supabase/server", () => ({ createClient: mocks.sesion }))
vi.mock("@/utils/supabase/admin", () => ({ createAdminClient: mocks.servicio }))

import {
  UMBRAL_CONFIRMACIONES_REPARACION,
} from "./evidencia-reparacion"
import {
  estadoVisibleEvidencia,
  obtenerSeccionReparacion,
} from "./evidencia-reparacion-detalle.server"

const SUPABASE_URL = "https://proyecto.supabase.co"
const EVIDENCIA_ID = "22222222-2222-4222-8222-222222222222"
const AUTOR_ID = "autor-1"
const ESPECTADOR_ID = "espectador-1"
const ROL = { ADMIN: 1, CIUDADANO: 2, INTERESADO: 3, OPERADOR: 4, INVITADO: 5 }

type UsuarioDePrueba = {
  id: string
  is_anonymous: boolean
  email_confirmed_at: string | null
}

type FilaEvidencia = {
  id: string
  autor_id: string
  comentario: string
  estado: string
  url: string | null
  bucket: string | null
  path: string | null
  thumbnail_url: string | null
  thumbnail_bucket: string | null
  thumbnail_path: string | null
  created_at: string
  publicada_at: string | null
}

type FilaVerificacion = { usuario_id: string; tipo: string; estado: string }

type Escenario = {
  evidencias?: FilaEvidencia[]
  verificaciones?: FilaVerificacion[]
  username?: string | null
  errorEvidencias?: unknown
}

/**
 * Servicio falso con la misma forma de consulta que usa el módulo: cada tabla
 * resuelve su resultado al esperarse, sin depender del orden de las llamadas.
 */
function crearServicio(escenario: Escenario) {
  const datos: Record<string, unknown[]> = {
    evidencias_reparacion: escenario.evidencias ?? [],
    verificaciones_reparacion: escenario.verificaciones ?? [],
    public_profiles: escenario.username === undefined
      ? []
      : [{ id: escenario.username === null ? "" : AUTOR_ID, username: escenario.username }],
  }

  const from = vi.fn((tabla: string) => {
    const resultado = () => ({
      data: tabla === "evidencias_reparacion" && escenario.errorEvidencias
        ? null
        : datos[tabla] ?? [],
      error: tabla === "evidencias_reparacion" ? escenario.errorEvidencias ?? null : null,
    })
    const consulta: Record<string, unknown> = {}
    for (const metodo of ["select", "eq", "in", "order", "limit", "returns"]) {
      consulta[metodo] = () => consulta
    }
    consulta.then = (resolver: (valor: unknown) => unknown, rechazar: (error: unknown) => unknown) =>
      Promise.resolve(resultado()).then(resolver, rechazar)
    return consulta
  })

  return { servicio: { from } }
}

/** Sesión falsa: usuario autenticado y el `rol_id` que devuelve el perfil. */
function crearSesion(usuario: UsuarioDePrueba | null, rolId: number | null = ROL.CIUDADANO) {
  const consultaPerfil: Record<string, unknown> = {}
  consultaPerfil.select = () => consultaPerfil
  consultaPerfil.eq = () => consultaPerfil
  consultaPerfil.single = async () => ({ data: { rol_id: rolId, roles: null }, error: null })
  return {
    auth: { getUser: async () => ({ data: { user: usuario } }) },
    from: () => consultaPerfil,
  }
}

function usuarioEspectador(extra: Partial<UsuarioDePrueba> = {}): UsuarioDePrueba {
  return { id: ESPECTADOR_ID, is_anonymous: false, email_confirmed_at: "2026-01-01T00:00:00Z", ...extra }
}

function evidencia(extra: Partial<FilaEvidencia> = {}): FilaEvidencia {
  return {
    id: EVIDENCIA_ID,
    autor_id: AUTOR_ID,
    comentario: "Taparon el bache con asfalto nuevo el viernes.",
    estado: "en_verificacion",
    url: null,
    bucket: null,
    path: null,
    thumbnail_url: null,
    thumbnail_bucket: null,
    thumbnail_path: null,
    created_at: "2026-11-28T12:42:00Z",
    publicada_at: null,
    ...extra,
  }
}

function evidenciaPublicada(extra: Partial<FilaEvidencia> = {}) {
  return evidencia({
    estado: "en_verificacion",
    bucket: "reportes",
    path: `${EVIDENCIA_ID}/archivo`,
    publicada_at: "2026-11-28T12:45:00Z",
    ...extra,
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL)
})

describe("estadoVisibleEvidencia", () => {
  it("nombra los tres estados públicos y esconde las evidencias resueltas en contra", () => {
    expect(estadoVisibleEvidencia("informada")).toBe("informada")
    expect(estadoVisibleEvidencia("en_verificacion")).toBe("en_verificacion")
    expect(estadoVisibleEvidencia("validada")).toBe("reparado")
    expect(estadoVisibleEvidencia("rechazada")).toBeNull()
    expect(estadoVisibleEvidencia("revertida")).toBeNull()
    expect(estadoVisibleEvidencia("otro")).toBeNull()
  })
})

describe("obtenerSeccionReparacion", () => {
  it("ofrece el formulario a una cuenta habilitada cuando el reporte sigue pendiente", async () => {
    mocks.sesion.mockResolvedValue(crearSesion(usuarioEspectador()))
    mocks.servicio.mockReturnValue(crearServicio({}).servicio)

    expect(await obtenerSeccionReparacion(9, 1)).toEqual({
      umbral: UMBRAL_CONFIRMACIONES_REPARACION,
      evidencia: null,
      puedeInformar: true,
    })
  })

  it("también ofrece el formulario a administración, que participa como cualquier cuenta (L21)", async () => {
    mocks.sesion.mockResolvedValue(crearSesion(usuarioEspectador(), ROL.ADMIN))
    mocks.servicio.mockReturnValue(crearServicio({}).servicio)

    expect(await obtenerSeccionReparacion(9, 1)).toEqual({
      umbral: UMBRAL_CONFIRMACIONES_REPARACION,
      evidencia: null,
      puedeInformar: true,
    })
  })

  it("no muestra nada a un visitante sin sesión ni a un reporte ya cerrado", async () => {
    mocks.sesion.mockResolvedValue(crearSesion(null))
    mocks.servicio.mockReturnValue(crearServicio({}).servicio)
    expect(await obtenerSeccionReparacion(9, 1)).toBeNull()

    mocks.sesion.mockResolvedValue(crearSesion(usuarioEspectador()))
    expect(await obtenerSeccionReparacion(9, 2)).toBeNull()
  })

  it("nunca publica la foto privada de una reparación informada", async () => {
    mocks.sesion.mockResolvedValue(crearSesion(usuarioEspectador()))
    mocks.servicio.mockReturnValue(crearServicio({
      evidencias: [evidencia({ estado: "informada" })],
      username: "Marisa Bogado",
    }).servicio)

    const seccion = await obtenerSeccionReparacion(9, 1)

    expect(seccion?.evidencia).toMatchObject({
      evidenciaId: EVIDENCIA_ID,
      estado: "informada",
      autor: "Marisa Bogado",
      comentario: "Taparon el bache con asfalto nuevo el viernes.",
      informadaAt: "2026-11-28T12:42:00Z",
      publicadaAt: null,
      foto: null,
      participacion: { puede: false, motivo: null, yaVerifico: null },
    })
    expect(seccion?.puedeInformar).toBe(false)
  })

  it("cuenta confirmaciones e impugnaciones pendientes sin exponer identidades", async () => {
    mocks.sesion.mockResolvedValue(crearSesion(usuarioEspectador()))
    mocks.servicio.mockReturnValue(crearServicio({
      evidencias: [evidenciaPublicada()],
      username: "Marisa Bogado",
      verificaciones: [
        { usuario_id: "otra-1", tipo: "confirmacion", estado: "pendiente" },
        { usuario_id: "otra-2", tipo: "confirmacion", estado: "pendiente" },
        { usuario_id: "otra-3", tipo: "impugnacion", estado: "pendiente" },
        { usuario_id: "otra-4", tipo: "impugnacion", estado: "descartada" },
      ],
    }).servicio)

    const seccion = await obtenerSeccionReparacion(9, 1)

    expect(seccion?.evidencia).toMatchObject({
      estado: "en_verificacion",
      confirmaciones: 2,
      impugnacionesPendientes: 1,
      foto: {
        src: `${SUPABASE_URL}/storage/v1/object/public/reportes/${EVIDENCIA_ID}/archivo`,
        miniatura: null,
      },
      participacion: { puede: true, motivo: null, yaVerifico: null },
    })
    expect(JSON.stringify(seccion)).not.toContain("otra-1")
    expect(JSON.stringify(seccion)).not.toContain(AUTOR_ID)
  })

  it("no deja que el autor valide su propia evidencia", async () => {
    mocks.sesion.mockResolvedValue(crearSesion(usuarioEspectador({ id: AUTOR_ID })))
    mocks.servicio.mockReturnValue(crearServicio({ evidencias: [evidenciaPublicada()] }).servicio)

    const seccion = await obtenerSeccionReparacion(9, 1)

    expect(seccion?.evidencia?.participacion).toEqual({ puede: false, motivo: "autor", yaVerifico: null })
  })

  it("explica el motivo cuando la cuenta todavía no puede participar", async () => {
    mocks.sesion.mockResolvedValue(crearSesion(null))
    mocks.servicio.mockReturnValue(crearServicio({ evidencias: [evidenciaPublicada()] }).servicio)
    expect((await obtenerSeccionReparacion(9, 1))?.evidencia?.participacion).toEqual({
      puede: false, motivo: "sesion", yaVerifico: null,
    })

    mocks.sesion.mockResolvedValue(crearSesion(usuarioEspectador({ is_anonymous: true }), ROL.INVITADO))
    expect((await obtenerSeccionReparacion(9, 1))?.evidencia?.participacion).toEqual({
      puede: false, motivo: "cuenta", yaVerifico: null,
    })

    mocks.sesion.mockResolvedValue(crearSesion(usuarioEspectador({ email_confirmed_at: null })))
    expect((await obtenerSeccionReparacion(9, 1))?.evidencia?.participacion).toEqual({
      puede: false, motivo: "cuenta", yaVerifico: null,
    })

    mocks.sesion.mockResolvedValue(crearSesion(usuarioEspectador(), ROL.ADMIN))
    expect((await obtenerSeccionReparacion(9, 1))?.evidencia?.participacion).toEqual({
      puede: true, motivo: null, yaVerifico: null,
    })

    // Administración sin correo confirmado sigue fuera, como cualquier otra cuenta (S15).
    mocks.sesion.mockResolvedValue(crearSesion(usuarioEspectador({ email_confirmed_at: null }), ROL.ADMIN))
    expect((await obtenerSeccionReparacion(9, 1))?.evidencia?.participacion).toEqual({
      puede: false, motivo: "cuenta", yaVerifico: null,
    })

    mocks.sesion.mockResolvedValue(crearSesion(usuarioEspectador(), ROL.OPERADOR))
    expect((await obtenerSeccionReparacion(9, 1))?.evidencia?.participacion).toEqual({
      puede: false, motivo: "operador", yaVerifico: null,
    })
  })

  it("recuerda la verificación que la persona ya registró", async () => {
    mocks.sesion.mockResolvedValue(crearSesion(usuarioEspectador()))
    mocks.servicio.mockReturnValue(crearServicio({
      evidencias: [evidenciaPublicada()],
      verificaciones: [{ usuario_id: ESPECTADOR_ID, tipo: "confirmacion", estado: "pendiente" }],
    }).servicio)

    expect((await obtenerSeccionReparacion(9, 1))?.evidencia?.participacion).toEqual({
      puede: true,
      motivo: null,
      yaVerifico: "confirmacion",
    })
  })

  it("mantiene el antes y el después cuando la reparación ya está validada", async () => {
    mocks.sesion.mockResolvedValue(crearSesion(null))
    mocks.servicio.mockReturnValue(crearServicio({
      evidencias: [evidenciaPublicada({ estado: "validada" })],
      verificaciones: [
        { usuario_id: "otra-1", tipo: "confirmacion", estado: "pendiente" },
        { usuario_id: "otra-2", tipo: "confirmacion", estado: "pendiente" },
        { usuario_id: "otra-3", tipo: "confirmacion", estado: "pendiente" },
      ],
    }).servicio)

    const seccion = await obtenerSeccionReparacion(9, 2)

    expect(seccion?.evidencia).toMatchObject({
      estado: "reparado",
      confirmaciones: 3,
      participacion: { puede: false, motivo: null, yaVerifico: null },
    })
    expect(seccion?.puedeInformar).toBe(false)
  })

  it("prioriza la evidencia activa sobre una validada anterior", async () => {
    mocks.sesion.mockResolvedValue(crearSesion(usuarioEspectador()))
    mocks.servicio.mockReturnValue(crearServicio({
      evidencias: [
        evidenciaPublicada({ id: "nueva", estado: "en_verificacion" }),
        evidenciaPublicada({ id: "vieja", estado: "validada" }),
      ],
    }).servicio)

    expect((await obtenerSeccionReparacion(9, 1))?.evidencia?.evidenciaId).toBe("nueva")
  })

  it("oculta la sección cuando la lectura falla, sin romper la ficha", async () => {
    mocks.sesion.mockResolvedValue(crearSesion(usuarioEspectador()))
    mocks.servicio.mockReturnValue(crearServicio({
      errorEvidencias: new Error("base no disponible"),
      evidencias: [evidenciaPublicada()],
    }).servicio)
    const consola = vi.spyOn(console, "error").mockImplementation(() => {})

    expect(await obtenerSeccionReparacion(9, 1)).toBeNull()
    expect(consola).toHaveBeenCalled()
    consola.mockRestore()
  })
})
