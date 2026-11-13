/**
 * Sondas independientes del verificador para la evidencia de reparación (T4).
 * Se derivan del pedido y de las reglas S1–S8, S12, S15, no de las pruebas propias
 * del slice: doble de Supabase construido acá para observar Storage, cola y RPC.
 */
import { createHash } from "node:crypto"
import { beforeEach, describe, expect, it, vi } from "vitest"
import sharp from "sharp"
import type { SupabaseClient } from "@supabase/supabase-js"

const piezas = vi.hoisted(() => ({
  moderarImagen: vi.fn(),
  enviarAviso: vi.fn(),
  notificarRevision: vi.fn(),
  notificarEstado: vi.fn(),
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
  revalidatePath: vi.fn(),
  rol: { actual: 2 as number | null, error: null as unknown },
}))
vi.mock("@/lib/notifications/report-notifications", () => ({
  sendAdminReviewNotificationEmail: piezas.notificarRevision,
  sendStatusNotificationEmail: piezas.notificarEstado,
}))
vi.mock("@/lib/moderation/avisos-retiro.server", () => ({ enviarAvisoRetiro: piezas.enviarAviso }))
vi.mock("@/lib/moderation/sightengine.server", () => ({ moderarImagen: piezas.moderarImagen }))
vi.mock("@/lib/authz/roles", async (original) => ({
  ...(await original<typeof import("@/lib/authz/roles")>()),
  getUserRoleContext: async () => ({ data: piezas.rol.error ? null : { roleId: piezas.rol.actual, roleName: "x" }, error: piezas.rol.error }),
}))
vi.mock("@/utils/supabase/server", () => ({ createClient: piezas.createClient }))
vi.mock("@/utils/supabase/admin", () => ({ createAdminClient: piezas.createAdminClient }))
vi.mock("next/cache", () => ({ revalidatePath: piezas.revalidatePath }))

import { prepararImagenReporte } from "@/lib/media/preparar-imagen-reporte.server"
import { moderarYGuardarImagenEvidenciaReparacion, moderarYGuardarImagenReporte } from "@/lib/moderation/imagenes-reporte.server"
import {
  MENSAJE_CARGA_EVIDENCIA_INCOMPLETA as _,
  MENSAJE_COMENTARIO_EVIDENCIA_DISTINTO,
  MENSAJE_CUENTA_REPARACION_REQUERIDA,
  MENSAJE_SIN_PERMISO_ADMINISTRADOR,
  informarReparacionWorkflow,
  puedeInformarReparacion,
  verificarReparacionWorkflow,
} from "@/lib/use-cases/reportes/evidencia-reparacion"
import {
  confirmarReparacionAction,
  impugnarReparacionAction,
  informarReparacionAction,
  resolverEvidenciaReparacionAdminAction,
  votarReparadoAction,
} from "@/app/reportes/[id]/actions"

const MENSAJE_FALLO_CARGA =
  "No pudimos guardar la fotografía de la reparación. Reintentá con la misma foto: retomamos la misma evidencia."

type Fila = Record<string, unknown>

function doble(config: {
  crear: () => { data: unknown; error: unknown }
  evidencia?: Fila | null
  cola?: Fila
  lecturasQueFalla?: number
  fallaSubidaPrivada?: boolean
}) {
  const eventos: string[] = []
  const objetos = new Map<string, Uint8Array>()
  const cola: Fila = { ...(config.cola ?? {}) }
  let fallosLectura = config.lecturasQueFalla ?? 0
  const rpc = vi.fn(async (nombre: string, p: Fila) => {
    eventos.push(`rpc:${nombre}`)
    switch (nombre) {
      case "crear_evidencia_reparacion":
        return config.crear()
      case "reclamar_imagen_moderacion":
        if (cola.estado_publicacion !== "pendiente") return { data: null, error: null }
        cola.estado_publicacion = "reclamada"
        return { data: "token-1", error: null }
      case "reservar_operaciones_moderacion":
        return { data: true, error: null }
      case "registrar_operaciones_moderacion":
        return { data: true, error: null }
      case "decidir_imagen_moderacion":
        Object.assign(cola, { decision: p.p_decision, motivos: p.p_motivos, token: "token-1" })
        cola.estado_publicacion =
          p.p_decision === "APPROVED" ? "publicando" : p.p_decision === "REJECTED" ? "rechazada" : "pendiente"
        return { data: true, error: null }
      case "confirmar_publicacion_moderacion":
        cola.estado_publicacion = "publicada"
        return { data: true, error: null }
      default:
        return { data: null, error: null }
    }
  })

  function resolver(
    tabla: string,
    filtros: Fila,
    actualizacion: Fila | null,
    conLectura: boolean,
    operacion: "insertar" | "actualizar" | null,
  ) {
    if (tabla === "reportes") {
      eventos.push("leer:reportes")
      return { data: { id: 7, usuario_id: "persona", deleted_at: null }, error: null }
    }
    if (tabla === "moderacion_imagenes") {
      if (operacion === "insertar" && actualizacion) {
        eventos.push("insertar:moderacion_imagenes")
        Object.assign(cola, { estado_publicacion: "pendiente", token: null }, actualizacion)
        return { data: cola, error: null }
      }
      if (operacion === "actualizar" && actualizacion) {
        Object.assign(cola, actualizacion)
        return { data: cola, error: null }
      }
      eventos.push("leer:moderacion_imagenes")
      if (conLectura && fallosLectura > 0) {
        fallosLectura -= 1
        return { data: null, error: { message: "metadata no disponible" } }
      }
      if ("evidencia_id" in filtros && cola.evidencia_id !== filtros.evidencia_id) return { data: null, error: null }
      return { data: cola, error: null }
    }
    if (tabla === "evidencias_reparacion") {
      eventos.push("leer:evidencias_reparacion")
      const fila = config.evidencia ?? null
      if (!fila) return { data: null, error: null }
      if (filtros.estado && fila.estado !== filtros.estado) return { data: null, error: null }
      if (filtros.reporte_id && Number(fila.reporte_id) !== Number(filtros.reporte_id)) return { data: null, error: null }
      return { data: fila, error: null }
    }
    eventos.push(`leer:${tabla}`)
    return { data: null, error: null }
  }

  const from = vi.fn((tabla: string) => {
    const filtros: Fila = {}
    let actualizacion: Fila | null = null
    let operacion: "insertar" | "actualizar" | null = null
    const cadena: Record<string, unknown> = {
      select: () => cadena,
      eq: (campo: string, valor: unknown) => {
        filtros[campo] = valor
        return cadena
      },
      update: (datos: Fila) => {
        actualizacion = datos
        operacion = "actualizar"
        return cadena
      },
      insert: (datos: Fila) => {
        actualizacion = datos
        operacion = "insertar"
        return cadena
      },
      delete: () => cadena,
      single: async () => resolver(tabla, filtros, actualizacion, true, operacion),
      maybeSingle: async () => resolver(tabla, filtros, actualizacion, true, operacion),
      then: (seguir: (v: unknown) => unknown) =>
        Promise.resolve(resolver(tabla, filtros, actualizacion, true, operacion)).then(seguir),
    }
    return cadena
  })

  const almacen = (bucket: string) => ({
    upload: vi.fn(async (ruta: string, bytes: Uint8Array) => {
      eventos.push(`subir:${bucket}`)
      if (bucket === "reportes-pendientes" && config.fallaSubidaPrivada) return { error: { message: "fallo" } }
      const clave = `${bucket}/${ruta}`
      if (objetos.has(clave)) return { error: { statusCode: "409" } }
      objetos.set(clave, new Uint8Array(bytes))
      return { error: null }
    }),
    download: vi.fn(async (ruta: string) => {
      eventos.push(`descargar:${bucket}`)
      const bytes = objetos.get(`${bucket}/${ruta}`)
      return bytes
        ? { data: new Blob([bytes as Uint8Array<ArrayBuffer>]), error: null }
        : { data: null, error: { statusCode: "404" } }
    }),
    remove: vi.fn(async (rutas: string[]) => {
      eventos.push(`borrar:${bucket}`)
      for (const ruta of rutas) objetos.delete(`${bucket}/${ruta}`)
      return { error: null }
    }),
    getPublicUrl: (ruta: string) => ({ data: { publicUrl: `https://sintetico.test/${bucket}/${ruta}` } }),
  })
  const storage = { from: vi.fn((bucket: string) => almacen(bucket)) }
  return {
    supabase: { from, rpc, storage } as unknown as SupabaseClient,
    eventos,
    cola,
    objetos,
    rpc,
    mutaciones: () =>
      eventos.filter((e) =>
        e.startsWith("rpc:reclamar") || e.startsWith("rpc:decidir") || e.startsWith("rpc:confirmar") ||
        e.startsWith("actualizar:") || e.startsWith("insertar:") || e.startsWith("subir:") || e.startsWith("borrar:")),
  }
}

async function foto(relleno = "white") {
  const bytes = await sharp({ create: { width: 40, height: 40, channels: 3, background: relleno } }).png().toBuffer()
  return new File([new Uint8Array(bytes)], "foto.png", { type: "image/png" })
}

async function identidad(archivo: File) {
  const { original } = await prepararImagenReporte(archivo)
  return createHash("sha256").update(original).digest("hex")
}

function colaPendiente(hash: string, extra: Fila = {}): Fila {
  return {
    id: "mod-1", reporte_id: 7, propietario_id: "persona", hash_sha256: hash,
    path_privado: "persona/mod-1", decision: "REVIEW", motivos: [], estado_publicacion: "pendiente",
    token: null, destino: "evidencia_reparacion", evidencia_id: "ev-1", operaciones: 0, ...extra,
  }
}

const evidencia = (extra: Fila = {}): Fila => ({
  id: "ev-1", autor_id: "persona", estado: "informada", comentario: "Bache tapado", reporte_id: 7, ...extra,
})

const rechazoActivo = () => ({ data: null, error: { code: "PRE03", message: "El reporte ya tiene una evidencia de reparación activa" } })

beforeEach(() => {
  vi.clearAllMocks()
  piezas.rol.actual = 2
  piezas.rol.error = null
  piezas.moderarImagen.mockResolvedValue({ decision: "APPROVED", motivos: [], operaciones: 2, proveedor: "sintetico" })
  piezas.createClient.mockResolvedValue({ auth: { getUser: async () => ({ data: { user: null } }) } })
})

describe("S1/S12 · reintento de la carga privada (identidad de la foto antes del comentario)", () => {
  it("una foto distinta con otro comentario recibe el rechazo genérico, no comentarioDistinto, y no muta nada", async () => {
    const archivo = await foto()
    const d = doble({ crear: rechazoActivo, evidencia: evidencia(), cola: colaPendiente("0".repeat(64)) })
    const antes = JSON.stringify(d.cola)
    const resultado = await moderarYGuardarImagenEvidenciaReparacion(d.supabase, {
      reporteId: 7, autorId: "persona", comentario: "Otro texto distinto", image: archivo,
    })
    expect(resultado.evidenciaId).toBeNull()
    expect(resultado.comentarioDistinto).toBeUndefined()
    expect(resultado.codigoRpc).toBe("PRE03")
    expect(JSON.stringify(d.cola)).toBe(antes)
    expect(d.objetos.size).toBe(0)
    expect(d.rpc.mock.calls.map(([n]) => n)).toEqual(["crear_evidencia_reparacion"])
    expect(d.eventos.filter((e) => e.startsWith("subir:") || e.startsWith("borrar:") || e.startsWith("actualizar:"))).toEqual([])
    expect(piezas.moderarImagen).not.toHaveBeenCalled()
    expect(piezas.enviarAviso).not.toHaveBeenCalled()
  })

  it("la misma foto con otro comentario se rechaza sin publicar ni tocar la evidencia guardada", async () => {
    const archivo = await foto()
    const hash = await identidad(archivo)
    const d = doble({ crear: rechazoActivo, evidencia: evidencia(), cola: colaPendiente(hash) })
    const antes = JSON.stringify(d.cola)
    const resultado = await moderarYGuardarImagenEvidenciaReparacion(d.supabase, {
      reporteId: 7, autorId: "persona", comentario: "Texto cambiado", image: archivo,
    })
    expect(resultado).toMatchObject({ evidenciaId: null, comentarioDistinto: true, publicada: false })
    expect(JSON.stringify(d.cola)).toBe(antes)
    expect(d.mutaciones()).toEqual([])
    expect(d.objetos.size).toBe(0)
  })

  it("la misma foto con el comentario solo rodeado de espacios se reanuda", async () => {
    const archivo = await foto()
    const hash = await identidad(archivo)
    const d = doble({ crear: rechazoActivo, evidencia: evidencia(), cola: colaPendiente(hash) })
    const resultado = await moderarYGuardarImagenEvidenciaReparacion(d.supabase, {
      reporteId: 7, autorId: "persona", comentario: "   Bache tapado   ", image: archivo,
    })
    expect(resultado).toMatchObject({ evidenciaId: "ev-1", estado: "APPROVED", publicada: true })
    expect(d.rpc.mock.calls.filter(([n]) => n === "decidir_imagen_moderacion")).toHaveLength(1)
    expect(d.rpc.mock.calls.filter(([n]) => n === "confirmar_publicacion_moderacion")).toHaveLength(1)
    expect(piezas.moderarImagen).toHaveBeenCalledOnce()
  })

  it("otra cuenta no puede reanudar la evidencia ajena", async () => {
    const archivo = await foto()
    const hash = await identidad(archivo)
    const d = doble({ crear: rechazoActivo, evidencia: evidencia(), cola: colaPendiente(hash) })
    const resultado = await moderarYGuardarImagenEvidenciaReparacion(d.supabase, {
      reporteId: 7, autorId: "otra-persona", comentario: "Bache tapado", image: archivo,
    })
    expect(resultado).toMatchObject({ evidenciaId: null, codigoRpc: "PRE03" })
    expect(resultado.comentarioDistinto).toBeUndefined()
    expect(d.mutaciones()).toEqual([])
    expect(piezas.moderarImagen).not.toHaveBeenCalled()
  })

  it("dos lecturas de metadatos fallidas no pierden la evidencia y el reintento idéntico la reanuda una sola vez", async () => {
    const archivo = await foto()
    const hash = await identidad(archivo)
    const d = doble({
      crear: () => ({ data: { evidencia_id: "ev-1", moderacion_id: "mod-1", path_privado: "persona/mod-1" }, error: null }),
      evidencia: evidencia(), cola: colaPendiente(hash), lecturasQueFalla: 2,
    })
    const fallido = await moderarYGuardarImagenEvidenciaReparacion(d.supabase, {
      reporteId: 7, autorId: "persona", comentario: "Bache tapado", image: archivo,
    })
    expect(fallido).toMatchObject({ evidenciaId: "ev-1", estado: "ERROR_PRIVADO", publicada: false })
    expect(fallido.advertencias).toContain("carga_privada_pendiente")
    expect(d.objetos.size).toBe(0)

    const d2 = doble({ crear: rechazoActivo, evidencia: evidencia(), cola: colaPendiente(hash) })
    const recuperado = await moderarYGuardarImagenEvidenciaReparacion(d2.supabase, {
      reporteId: 7, autorId: "persona", comentario: "Bache tapado", image: archivo,
    })
    expect(recuperado).toMatchObject({ evidenciaId: "ev-1", estado: "APPROVED", publicada: true })
    expect(piezas.moderarImagen).toHaveBeenCalledOnce()
    expect(d2.rpc.mock.calls.filter(([n]) => n === "confirmar_publicacion_moderacion")).toHaveLength(1)
  })

  it("dos reintentos simultáneos clasifican y publican una sola vez", async () => {
    const archivo = await foto()
    const hash = await identidad(archivo)
    const d = doble({ crear: rechazoActivo, evidencia: evidencia(), cola: colaPendiente(hash), lecturasQueFalla: 0 })
    const resultados = await Promise.all([
      moderarYGuardarImagenEvidenciaReparacion(d.supabase, { reporteId: 7, autorId: "persona", comentario: "Bache tapado", image: archivo }),
      moderarYGuardarImagenEvidenciaReparacion(d.supabase, { reporteId: 7, autorId: "persona", comentario: "Bache tapado", image: archivo }),
    ])
    expect(resultados.filter((r) => r.publicada === true)).toHaveLength(1)
    expect(piezas.moderarImagen).toHaveBeenCalledOnce()
    expect(d.rpc.mock.calls.filter(([n]) => n === "decidir_imagen_moderacion")).toHaveLength(1)
    expect(d.rpc.mock.calls.filter(([n]) => n === "confirmar_publicacion_moderacion")).toHaveLength(1)
  })
})

describe("S2/S12 · el fallo de carga privada nunca se informa como éxito", () => {
  it("la RPC exitosa con subida privada fallida devuelve ERROR_PRIVADO, no publica y deja marca", async () => {
    const archivo = await foto()
    const d = doble({
      crear: () => ({ data: { evidencia_id: "ev-1", moderacion_id: "mod-1", path_privado: "persona/mod-1" }, error: null }),
      cola: colaPendiente(await identidad(archivo)), fallaSubidaPrivada: true,
    })
    const resultado = await moderarYGuardarImagenEvidenciaReparacion(d.supabase, {
      reporteId: 7, autorId: "persona", comentario: "Bache tapado", image: archivo,
    })
    expect(resultado).toMatchObject({ evidenciaId: "ev-1", estado: "ERROR_PRIVADO", publicada: false })
    expect(d.cola.motivos).toContain("carga_privada_pendiente")
    expect(d.rpc.mock.calls.map(([n]) => n)).not.toContain("reclamar_imagen_moderacion")
    expect(d.eventos.filter((e) => e === "subir:reportes")).toEqual([])
    expect(piezas.moderarImagen).not.toHaveBeenCalled()
  })

  it("el caso de uso traduce ese fallo a un error y nunca a una reparación enviada", async () => {
    const archivo = await foto()
    const d = doble({
      crear: () => ({ data: { evidencia_id: "ev-1", moderacion_id: "mod-1", path_privado: "persona/mod-1" }, error: null }),
      cola: colaPendiente(await identidad(archivo)), fallaSubidaPrivada: true,
    })
    const resultado = await informarReparacionWorkflow(d.supabase, 7, "persona", { frase: "taparon_el_bache_con_asfalto_nuevo", image: archivo })
    expect(resultado).toEqual({ success: false, error: MENSAJE_FALLO_CARGA })
  })

  it("el rechazo genérico de la RPC no filtra el mensaje de la base ni el comentario guardado", async () => {
    const archivo = await foto()
    const d = doble({ crear: rechazoActivo, evidencia: evidencia(), cola: colaPendiente("0".repeat(64)) })
    const resultado = await informarReparacionWorkflow(d.supabase, 7, "persona", { frase: "repararon_el_problema_por_completo", image: archivo })
    expect(resultado).toEqual({ success: false, error: "Este reporte ya tiene una reparación informada en verificación." })
    expect(JSON.stringify(resultado)).not.toContain("El reporte ya tiene una evidencia")
    expect(JSON.stringify(resultado)).not.toContain("Bache tapado")
  })

  it("el comentario distinto del caso de uso no publica y avisa que la evidencia ya existe", async () => {
    const archivo = await foto()
    const d = doble({ crear: rechazoActivo, evidencia: evidencia(), cola: colaPendiente(await identidad(archivo)) })
    const resultado = await informarReparacionWorkflow(d.supabase, 7, "persona", { frase: "limpiaron_la_basura_o_el_microbasural", image: archivo })
    expect(resultado).toEqual({ success: false, error: MENSAJE_COMENTARIO_EVIDENCIA_DISTINTO })
    expect(d.mutaciones()).toEqual([])
  })
})

describe("S12/S15 · autorización del lado del servidor en cada acción", () => {
  it("sin sesión no se sube nada", async () => {
    const resultado = await informarReparacionAction(7, "taparon_el_bache_con_asfalto_nuevo", await foto())
    expect(resultado).toEqual({ success: false, error: "Tenés que iniciar sesión para informar una reparación." })
    expect(piezas.createAdminClient).not.toHaveBeenCalled()
  })

  it.each([
    ["correo sin confirmar", { is_anonymous: false, email_confirmed_at: null }, 2],
    ["rol invitado", { is_anonymous: false, email_confirmed_at: "2025-01-01T00:00:00Z" }, 5],
    ["rol operador", { is_anonymous: false, email_confirmed_at: "2025-01-01T00:00:00Z" }, 4],
    ["sesión anónima", { is_anonymous: true, email_confirmed_at: null }, null],
  ])("rechaza informar con %s", async (_caso, usuario, rol) => {
    piezas.rol.actual = rol
    piezas.createClient.mockResolvedValue({ auth: { getUser: async () => ({ data: { user: usuario } }) } })
    const resultado = await informarReparacionAction(7, "taparon_el_bache_con_asfalto_nuevo", await foto())
    expect(resultado).toEqual({ success: false, error: MENSAJE_CUENTA_REPARACION_REQUERIDA })
    expect(piezas.createAdminClient).not.toHaveBeenCalled()
  })

  it("administración informa como cualquier cuenta habilitada (L21)", async () => {
    piezas.rol.actual = 1
    piezas.createClient.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: "admin", is_anonymous: false, email_confirmed_at: "2025-01-01T00:00:00Z" } } }) },
    })
    const d = doble({
      crear: () => ({ data: null, error: { code: "PRE05", message: "El reporte ya está cerrado" } }),
      cola: colaPendiente("0".repeat(64)),
    })
    piezas.createAdminClient.mockReturnValue(d.supabase)
    const resultado = await informarReparacionAction(7, "taparon_el_bache_con_asfalto_nuevo", await foto())
    expect(resultado).toEqual({ success: false, error: "El reporte ya está cerrado o no está disponible para informar una reparación." })
    const [nombre, parametros] = d.rpc.mock.calls[0] as [string, Fila]
    expect(nombre).toBe("crear_evidencia_reparacion")
    expect(parametros).toMatchObject({ p_autor_id: "admin" })
  })

  it("valida la imagen real antes de crear la evidencia: bytes basura con MIME de PNG no llegan a la RPC", async () => {
    piezas.createClient.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: "persona", is_anonymous: false, email_confirmed_at: "2025-01-01T00:00:00Z" } } }) },
    })
    const d = doble({ crear: rechazoActivo, cola: colaPendiente("0".repeat(64)) })
    piezas.createAdminClient.mockReturnValue(d.supabase)
    const basura = new File([new TextEncoder().encode("no soy una imagen")], "falsa.png", { type: "image/png" })
    const resultado = await informarReparacionAction(7, "taparon_el_bache_con_asfalto_nuevo", basura)
    expect(resultado.success).toBe(false)
    expect(d.rpc).not.toHaveBeenCalled()
  })

  it("acepta solo JPG, PNG o WebP en la carga", async () => {
    piezas.createClient.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: "persona", is_anonymous: false, email_confirmed_at: "2025-01-01T00:00:00Z" } } }) },
    })
    const d = doble({ crear: rechazoActivo, cola: colaPendiente("0".repeat(64)) })
    piezas.createAdminClient.mockReturnValue(d.supabase)
    const gif = new File([new Uint8Array([0x47, 0x49, 0x46])], "a.gif", { type: "image/gif" })
    const resultado = await informarReparacionAction(7, "taparon_el_bache_con_asfalto_nuevo", gif)
    expect(resultado).toEqual({ success: false, error: "La imagen debe estar en formato JPG, PNG o WebP." })
    expect(d.rpc).not.toHaveBeenCalled()
  })

  it("rechaza la imagen por encima del tamaño final antes de crear la evidencia", async () => {
    piezas.createClient.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: "persona", is_anonymous: false, email_confirmed_at: "2025-01-01T00:00:00Z" } } }) },
    })
    const d = doble({ crear: rechazoActivo, cola: colaPendiente("0".repeat(64)) })
    piezas.createAdminClient.mockReturnValue(d.supabase)
    const enorme = new File([new Uint8Array(200 * 1024)], "grande.png", { type: "image/png" })
    const resultado = await informarReparacionAction(7, "taparon_el_bache_con_asfalto_nuevo", enorme)
    expect(resultado).toEqual({ success: false, error: "La imagen optimizada no puede superar los 100 KB." })
    expect(d.rpc).not.toHaveBeenCalled()
  })

  it("confirmar e impugnar también exigen sesión habilitada", async () => {
    expect(await confirmarReparacionAction(7, "11111111-1111-4111-8111-111111111111")).toEqual({
      success: false, error: "Tenés que iniciar sesión para confirmar o impugnar una reparación.",
    })
    expect(await impugnarReparacionAction(7, "11111111-1111-4111-8111-111111111111", "el_problema_sigue_igual")).toEqual({
      success: false, error: "Tenés que iniciar sesión para confirmar o impugnar una reparación.",
    })
    expect(piezas.createAdminClient).not.toHaveBeenCalled()
  })

  it("la resolución administrativa rechaza a quien no es administrador sin llamar a la RPC", async () => {
    piezas.createClient.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: "ciudadano", is_anonymous: false } } }) },
    })
    const d = doble({ crear: rechazoActivo, cola: colaPendiente("0".repeat(64)) })
    piezas.createAdminClient.mockReturnValue(d.supabase)
    const resultado = await resolverEvidenciaReparacionAdminAction(7, "11111111-1111-4111-8111-111111111111", "aprobar")
    expect(resultado).toEqual({ success: false, error: MENSAJE_SIN_PERMISO_ADMINISTRADOR })
    expect(d.rpc).not.toHaveBeenCalled()
  })

  it("un identificador de evidencia inválido no llega a la base", async () => {
    const resultado = await confirmarReparacionAction(7, "no-es-uuid")
    expect(resultado).toEqual({ success: false, error: "No pudimos identificar la evidencia de reparación." })
    expect(piezas.createAdminClient).not.toHaveBeenCalled()
  })
})

describe("S5/S6/S7 · verificación comunitaria traducida en el servidor", () => {
  it("el autor de la evidencia no puede validarla", async () => {
    const d = doble({ crear: rechazoActivo })
    d.rpc.mockResolvedValueOnce({ data: null, error: { code: "PRE02", message: "No podés validar tu propia evidencia" } })
    const resultado = await verificarReparacionWorkflow(d.supabase, "11111111-1111-4111-8111-111111111111", "persona", "confirmacion")
    expect(resultado).toEqual({ success: false, error: "No podés validar tu propia evidencia." })
  })

  it("una segunda verificación distinta se rechaza y la repetida no vuelve a cerrar", async () => {
    const d = doble({ crear: rechazoActivo })
    d.rpc.mockResolvedValueOnce({ data: null, error: { code: "PRE06", message: "x" } })
    const distinta = await verificarReparacionWorkflow(d.supabase, "11111111-1111-4111-8111-111111111111", "otra", "impugnacion", "el_problema_sigue_igual")
    expect(distinta).toEqual({ success: false, error: "Ya registraste una verificación distinta para esta evidencia." })

    d.rpc.mockResolvedValueOnce({
      data: { tipo: "confirmacion", repetida: true, cerrado: false, evidencia_estado: "validada", reporte_estado_id: 2, confirmaciones: 3, impugnaciones: 0, impugnaciones_pendientes: 0 },
      error: null,
    })
    const repetida = await verificarReparacionWorkflow(d.supabase, "11111111-1111-4111-8111-111111111111", "otra", "confirmacion")
    expect(repetida).toMatchObject({ success: true, data: { repetida: true, cerrado: false, umbral: 3 } })
    expect(piezas.notificarEstado).not.toHaveBeenCalled()
  })

  it("tres confirmaciones sin impugnaciones cierran y avisan al autor", async () => {
    const d = doble({ crear: rechazoActivo })
    d.rpc.mockResolvedValueOnce({
      data: { tipo: "confirmacion", repetida: false, cerrado: true, evidencia_estado: "validada", reporte_estado_id: 2, confirmaciones: 3, impugnaciones: 0, impugnaciones_pendientes: 0 },
      error: null,
    })
    const resultado = await verificarReparacionWorkflow(d.supabase, "11111111-1111-4111-8111-111111111111", "otra", "confirmacion")
    expect(resultado).toMatchObject({ success: true, data: { cerrado: true, confirmaciones: 3 } })
  })

  it("la impugnación exige una frase del catálogo antes de la RPC", async () => {
    const d = doble({ crear: rechazoActivo })
    expect(await verificarReparacionWorkflow(d.supabase, "11111111-1111-4111-8111-111111111111", "otra", "impugnacion", "   "))
      .toEqual({ success: false, error: "Elegí por qué no está reparado de la lista." })
    expect(await verificarReparacionWorkflow(d.supabase, "11111111-1111-4111-8111-111111111111", "otra", "impugnacion", "Sigue roto de nuevo"))
      .toEqual({ success: false, error: "Elegí por qué no está reparado de la lista." })
    expect(d.rpc).not.toHaveBeenCalled()
  })
})

describe("S15 · el voto «reparado» ya no cierra reportes", () => {
  it("la acción sigue existiendo pero nunca escribe ni devuelve éxito", async () => {
    const resultado = await votarReparadoAction(7)
    expect(resultado).toEqual({
      success: false,
      error: "El voto «reparado» fue reemplazado: informá la reparación con una foto y la comunidad la verifica.",
    })
    expect(piezas.createClient).not.toHaveBeenCalled()
    expect(piezas.createAdminClient).not.toHaveBeenCalled()
  })

  it("valida el identificador como antes", async () => {
    expect(await votarReparadoAction(0)).toMatchObject({ success: false })
    expect(JSON.stringify(await votarReparadoAction(0))).toContain("Number must be greater than 0")
  })
})

describe("S15 · participantes: cuenta registrada con correo confirmado", () => {
  it.each([
    ["ciudadano confirmado", { is_anonymous: false, email_confirmed_at: "2025-01-01T00:00:00Z" }, 2, true],
    ["interesado confirmado", { is_anonymous: false, email_confirmed_at: "2025-01-01T00:00:00Z" }, 3, true],
    ["sin rol asignado", { is_anonymous: false, email_confirmed_at: "2025-01-01T00:00:00Z" }, null, true],
    ["sin correo confirmado", { is_anonymous: false, email_confirmed_at: null }, 2, false],
    ["invitado", { is_anonymous: false, email_confirmed_at: "2025-01-01T00:00:00Z" }, 5, false],
    ["admin", { is_anonymous: false, email_confirmed_at: "2025-01-01T00:00:00Z" }, 1, true],
    ["admin sin correo confirmado", { is_anonymous: false, email_confirmed_at: null }, 1, false],
    ["operador", { is_anonymous: false, email_confirmed_at: "2025-01-01T00:00:00Z" }, 4, false],
    ["anónimo", { is_anonymous: true, email_confirmed_at: "2025-01-01T00:00:00Z" }, 2, false],
  ])("%s → %s (%i)", (_caso, usuario, rol, esperado) => {
    expect(puedeInformarReparacion(usuario as never, rol as number | null)).toBe(esperado)
  })
})

describe("S12 · la identidad se toma de la sesión, no del cliente", () => {
  it("la RPC de creación recibe la cuenta de la sesión y un hash de 64 hex", async () => {
    piezas.createClient.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: "persona", is_anonymous: false, email_confirmed_at: "2025-01-01T00:00:00Z" } } }) },
    })
    const d = doble({ crear: () => ({ data: null, error: { code: "PRE04", message: "límite" } }), cola: colaPendiente("0".repeat(64)) })
    piezas.createAdminClient.mockReturnValue(d.supabase)
    const resultado = await informarReparacionAction(7, "  taparon_el_bache_con_asfalto_nuevo  ", await foto())
    expect(resultado).toEqual({ success: false, error: "Alcanzaste el límite de 3 evidencias de reparación por día." })
    const [nombre, parametros] = d.rpc.mock.calls[0] as [string, Fila]
    expect(nombre).toBe("crear_evidencia_reparacion")
    expect(parametros).toMatchObject({ p_reporte_id: 7, p_autor_id: "persona", p_comentario: "Taparon el bache con asfalto nuevo" })
    expect(String(parametros.p_hash_sha256)).toMatch(/^[0-9a-f]{64}$/)
    expect(piezas.revalidatePath).not.toHaveBeenCalled()
  })

  it("un administrador aprueba la evidencia y el resultado durable se informa", async () => {
    piezas.rol.actual = 1
    piezas.createClient.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: "admin", is_anonymous: false } } }) },
    })
    const d = doble({ crear: rechazoActivo })
    d.rpc.mockResolvedValueOnce({
      data: { repetida: false, cerrado: true, revertido: false, evidencia_estado: "validada", reporte_estado_id: 2, confirmaciones: 0, impugnaciones: 0, impugnaciones_pendientes: 0 },
      error: null,
    })
    piezas.createAdminClient.mockReturnValue(d.supabase)
    const resultado = await resolverEvidenciaReparacionAdminAction(7, "11111111-1111-4111-8111-111111111111", "aprobar", "  " )
    expect(resultado).toMatchObject({ success: true, data: { accion: "aprobar", evidenciaEstado: "validada", reporteEstadoId: 2, cerrado: true } })
    expect(d.rpc.mock.calls[0]).toEqual([
      "resolver_evidencia_reparacion_admin",
      { p_evidencia_id: "11111111-1111-4111-8111-111111111111", p_administrador_id: "admin", p_accion: "aprobar", p_motivo: null },
    ])
  })
})

describe("S15 · la moderación de fotos de reporte conserva su comportamiento", () => {
  it("un reporte con foto rechazada sigue retirándose y avisando al autor", async () => {
    const d = doble({ crear: rechazoActivo })
    piezas.moderarImagen.mockResolvedValue({ decision: "REJECTED", motivos: ["contenido"], operaciones: 2, proveedor: "sintetico" })
    const resultado = await moderarYGuardarImagenReporte(d.supabase, {
      reporteId: 7, propietarioId: "persona", image: await foto(),
    })
    expect(resultado.estado).toBe("REJECTED")
    expect(resultado.motivos).toEqual([
      "Tu reporte fue retirado porque la fotografía adjunta incumple nuestras normas de contenido. Evitá volver a publicar este tipo de material",
    ])
    expect(piezas.enviarAviso).toHaveBeenCalledWith(d.supabase, 7)
  })

  it("el reemplazo rechazado conserva la foto anterior y no envía aviso de retiro", async () => {
    const d = doble({ crear: rechazoActivo })
    piezas.moderarImagen.mockResolvedValue({ decision: "REJECTED", motivos: ["contenido"], operaciones: 2, proveedor: "sintetico" })
    const resultado = await moderarYGuardarImagenReporte(d.supabase, {
      reporteId: 7, propietarioId: "persona", image: await foto(), reemplazaFotoId: 22,
    })
    expect(resultado.motivos).toEqual(["La foto nueva fue rechazada; el reporte y la foto anterior se conservan."])
    expect(piezas.enviarAviso).not.toHaveBeenCalled()
  })

  it("una foto de reporte en revisión manual mantiene su mensaje histórico", async () => {
    const d = doble({ crear: rechazoActivo })
    piezas.moderarImagen.mockResolvedValue({ decision: "REVIEW", motivos: ["contenido"], operaciones: 2, proveedor: "sintetico" })
    const resultado = await moderarYGuardarImagenReporte(d.supabase, {
      reporteId: 7, propietarioId: "persona", image: await foto(),
    })
    expect(resultado.motivos).toEqual(["La fotografía quedó privada y pendiente de revisión. No necesitás reenviar el reporte."])
    expect(piezas.enviarAviso).not.toHaveBeenCalled()
  })
})
