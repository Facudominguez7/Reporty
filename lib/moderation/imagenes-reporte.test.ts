/** Simulación de efectos durables y Storage; el proveedor nunca usa red real. */
import { beforeEach, describe, expect, it, vi } from "vitest"
import sharp from "sharp"
import type { SupabaseClient } from "@supabase/supabase-js"
const { moderarImagen, enviarAviso, notificarRevisionAdmin } = vi.hoisted(() => ({ moderarImagen: vi.fn(), enviarAviso: vi.fn(), notificarRevisionAdmin: vi.fn() }))
vi.mock("@/lib/notifications/report-notifications", () => ({ sendAdminReviewNotificationEmail: notificarRevisionAdmin }))
vi.mock("./avisos-retiro.server", () => ({ enviarAvisoRetiro: enviarAviso }))
vi.mock("./sightengine.server", () => ({ moderarImagen }))
import { limpiarImagenModerada, moderarYGuardarImagenEvidenciaReparacion, moderarYGuardarImagenReporte, publicarImagenModerada } from "./imagenes-reporte.server"

/**
 * Provee CAS y objetos en memoria, manteniendo el orden observable de efectos.
 *
 * @param inicial - Fila de `moderacion_imagenes` ya persistida; la evidencia de
 * reparación la crea la RPC antes de subir los bytes, así que la simulación parte
 * de una fila existente.
 */
function escenario(inicial: Record<string, unknown> | null = null) {
  const eventos: string[] = []
  const objetos = new Map<string, Uint8Array>()
  let fila: Record<string, unknown> | null = inicial
  let errorDescarga: unknown = null
  const fallos = { cuota: false, copia: false, confirmar: false, eliminar: false, privado: false, privadoExcepcion: false, privadoRespuestaPerdida: false, registro: false, decision: false, borrado: false, propietario: "persona", carrera: false, carreraBorrado: false, creacion: "" as string, creacionMensaje: "El reporte ya tiene una evidencia de reparación activa", lectura: 0, evidencia: { id: "evidencia-1", autor_id: "persona", estado: "informada", comentario: "Bache tapado" } as Record<string, unknown> | null }
  const rpc = vi.fn(async (nombre: string, p: Record<string, unknown>) => {
    eventos.push(nombre)
    if (nombre === "crear_evidencia_reparacion") {
      if (fallos.creacion) return { data: null, error: { code: fallos.creacion, message: fallos.creacionMensaje } }
      // La RPC durable guarda el hash de los bytes preparados que recibe.
      if (fila) fila = { ...fila, hash_sha256: String(p.p_hash_sha256) }
      return { data: { evidencia_id: fila?.evidencia_id, moderacion_id: fila?.id, path_privado: fila?.path_privado }, error: null }
    }
    if (nombre === "reclamar_imagen_moderacion") {
      if (fila?.estado_publicacion !== "pendiente") return { data: null, error: null }
      fila!.estado_publicacion = "reclamada"
      return { data: "reclamo", error: null }
    }
    if (nombre === "reservar_operaciones_moderacion") return { data: !fallos.cuota, error: null }
    if (nombre === "registrar_operaciones_moderacion") return { data: !fallos.registro, error: null }
    if (nombre === "decidir_imagen_moderacion") {
      if (fallos.decision) return { data: false, error: null }
      Object.assign(fila!, { decision: p.p_decision, motivos: p.p_motivos, estado_publicacion: p.p_decision === "APPROVED" ? "publicando" : p.p_decision === "REJECTED" ? "rechazada" : "pendiente", token: "publicacion" })
      return { data: true, error: null }
    }
    if (nombre === "confirmar_publicacion_moderacion") {
      if (fallos.carrera) { fila!.estado_publicacion = "publicada"; return { data: false, error: null } }
      if (fallos.confirmar || fallos.borrado) return { data: false, error: null }
      fila!.estado_publicacion = "publicada"
      return { data: true, error: null }
    }
    return { data: null, error: null }
  })
  let fotoAnteriorEliminada = false
  const from = vi.fn((tabla: string) => {
    let accion = "leer"
    let datos: Record<string, unknown> = {}
    if (tabla === "fotos_reporte") {
      const foto = { id: 22, reporte_id: 7, url: "https://sintetico.test/reportes/anterior", bucket: "reportes", path: "anterior/original", thumbnail_url: "https://sintetico.test/reportes/anterior-mini", thumbnail_bucket: "reportes", thumbnail_path: "anterior/mini" }
      const query = {
        select: vi.fn(() => query), eq: vi.fn(() => query),
        delete: vi.fn(() => { fotoAnteriorEliminada = true; return query }),
        maybeSingle: vi.fn(async () => ({ data: fotoAnteriorEliminada ? { id: 22 } : foto, error: null })),
      }
      return query
    }
    if (tabla === "evidencias_reparacion") {
      const evidencia = {
        select: vi.fn(() => evidencia), eq: vi.fn(() => evidencia),
        maybeSingle: vi.fn(async () => ({ data: fallos.evidencia, error: null })),
      }
      return evidencia
    }
    const consulta = {
      select: vi.fn(() => consulta), eq: vi.fn(() => consulta), is: vi.fn(() => consulta),
      insert: vi.fn((d: Record<string, unknown>) => { accion = "insertar"; datos = d; return consulta }),
      update: vi.fn((d: Record<string, unknown>) => { accion = "actualizar"; datos = d; return consulta }),
      single: vi.fn(async () => (fallos.lectura > 0 ? ((fallos.lectura -= 1), { data: null, error: { message: "lectura no disponible" } }) : ejecutar())), maybeSingle: vi.fn(async () => ejecutar()),
      then: (resolver: (v: unknown) => unknown) => Promise.resolve(ejecutar()).then(resolver),
    }
    /** Resuelve una consulta sintética sin ocultar errores de unicidad. */
    function ejecutar() {
      if (tabla === "reportes") {
        if (fallos.carreraBorrado && eventos.includes("confirmar_publicacion_moderacion")) fila!.estado_publicacion = "publicada"
        return { data: { id: 7, usuario_id: fallos.propietario, deleted_at: fallos.borrado ? "hoy" : null }, error: null }
      }
      if (accion === "insertar") {
        eventos.push("insertar_cola")
        if (fila) return { data: null, error: { code: "23505" } }
        fila = { ...datos, decision: "REVIEW", estado_publicacion: "pendiente", motivos: [], token: null }
      }
      if (accion === "actualizar") Object.assign(fila!, datos)
      return { data: fila, error: null }
    }
    return consulta
  })
  const storage = { from: vi.fn((bucket: string) => ({
    upload: vi.fn(async (path: string, bytes: Uint8Array, opciones: { upsert: boolean }) => {
      eventos.push(`subir:${bucket}`)
      if (bucket === "reportes-pendientes" && fallos.privadoExcepcion) throw new Error("red interrumpida")
      expect(opciones.upsert).toBe(false)
      if ((bucket === "reportes" && fallos.copia) || (bucket !== "reportes" && fallos.privado)) return { error: { message: "fallo" } }
      if (objetos.has(`${bucket}/${path}`)) return { error: { statusCode: "409" } }
      objetos.set(`${bucket}/${path}`, new Uint8Array(bytes))
      // Storage guardó los bytes pero la respuesta no llegó al servidor.
      if (bucket === "reportes-pendientes" && fallos.privadoRespuestaPerdida) return { error: { message: "respuesta perdida" } }
      return { error: null }
    }),
    download: vi.fn(async (path: string) => {
      const bytes = objetos.get(`${bucket}/${path}`)
      return bytes ? { data: new Blob([bytes as Uint8Array<ArrayBuffer>]), error: null } : { data: null, error: bucket === "reportes" && errorDescarga ? (typeof errorDescarga === "function" ? errorDescarga() : errorDescarga) : { statusCode: "404" } }
    }),
    remove: vi.fn(async (paths: string[]) => {
      eventos.push(`borrar:${bucket}`)
      if (fallos.eliminar) return { error: { message: "fallo" } }
      for (const path of paths) objetos.delete(`${bucket}/${path}`)
      return { error: null }
    }),
    getPublicUrl: (path: string) => ({ data: { publicUrl: `https://sintetico.test/${bucket}/${path}` } }),
  })) }
  return { errorDescarga: (error: unknown) => { errorDescarga = error }, supabase: { from, rpc, storage } as unknown as SupabaseClient, eventos, objetos, fallos, rpc, fila: () => fila!, fotoAnteriorEliminada: () => fotoAnteriorEliminada }
}

/** Crea evidencia inocua real, no una cabecera simulada. */
async function entrada(reemplazaFotoId?: number) {
  const bytes = await sharp({ create: { width: 24, height: 24, channels: 3, background: "blue" } }).png().toBuffer()
  return { reporteId: 7, propietarioId: "persona", image: new File([new Uint8Array(bytes)], "foto.png", { type: "image/png" }), ...(reemplazaFotoId ? { reemplazaFotoId } : {}) }
}

beforeEach(() => {
  enviarAviso.mockReset().mockResolvedValue("pendiente")
  notificarRevisionAdmin.mockReset().mockResolvedValue(undefined)
  moderarImagen.mockReset().mockResolvedValue({ decision: "APPROVED", motivos: [], operaciones: 2, proveedor: "simulado" })
})
describe("orquestación de imágenes", () => {
  it("removes the replaced photo only after the new photo is published", async () => {
    const e = escenario()
    expect((await moderarYGuardarImagenReporte(e.supabase, await entrada(22))).publicada).toBe(true)
    expect(e.fila().reemplaza_foto_id).toBe(22)
    expect(e.fotoAnteriorEliminada()).toBe(true)
    expect(e.eventos.indexOf("confirmar_publicacion_moderacion")).toBeLessThan(e.eventos.lastIndexOf("borrar:reportes"))
  })

  it("keeps the old photo while a replacement awaits review", async () => {
    const e = escenario()
    moderarImagen.mockResolvedValue({ decision: "REVIEW", motivos: ["contenido"], operaciones: 2 })
    expect((await moderarYGuardarImagenReporte(e.supabase, await entrada(22))).publicada).toBe(false)
    expect(e.fila().reemplaza_foto_id).toBe(22)
    expect(e.fotoAnteriorEliminada()).toBe(false)
  })

  it("does not retire the report or remove the old photo when a replacement is rejected", async () => {
    const e = escenario()
    moderarImagen.mockResolvedValue({ decision: "REJECTED", motivos: ["contenido"], operaciones: 2 })
    const result = await moderarYGuardarImagenReporte(e.supabase, await entrada(22))
    expect(result.estado).toBe("REJECTED")
    expect(result.motivos).toEqual(["La foto nueva fue rechazada; el reporte y la foto anterior se conservan."])
    expect(e.fila().reemplaza_foto_id).toBe(22)
    expect(enviarAviso).not.toHaveBeenCalled()
    expect(e.fotoAnteriorEliminada()).toBe(false)
  })

  it("persiste antes del proveedor y publica solo después de decidir", async () => {
    const e = escenario()
    moderarImagen.mockImplementationOnce(async () => {
      e.eventos.push("proveedor")
      expect(e.fila().decision).toBe("REVIEW")
      expect([...e.objetos.keys()].every((p) => p.startsWith("reportes-pendientes/"))).toBe(true)
      return { decision: "APPROVED", motivos: [], operaciones: 2 }
    })
    const r = await moderarYGuardarImagenReporte(e.supabase, await entrada())
    expect(r.publicada).toBe(true)
    expect(e.eventos.indexOf("insertar_cola")).toBeLessThan(e.eventos.indexOf("proveedor"))
    expect(e.eventos.indexOf("decidir_imagen_moderacion")).toBeLessThan(e.eventos.indexOf("subir:reportes"))
    expect([...e.objetos.keys()]).toEqual([`reportes/${e.fila().id}/publicacion`, `reportes/${e.fila().id}/publicacion-miniatura`])
  })
  it.each(["REJECTED", "REVIEW"])("%s nunca copia al público", async (decision) => {
    const e = escenario()
    moderarImagen.mockResolvedValue({ decision, motivos: ["contenido"], operaciones: 2 })
    const r = await moderarYGuardarImagenReporte(e.supabase, await entrada())
    expect(r.estado).toBe(decision)
    expect(r.publicada).toBe(false)
    expect(e.eventos).not.toContain("subir:reportes")
    expect([...e.objetos.keys()].length).toBe(decision === "REVIEW" ? 1 : 0)
  })
  it("notifies admins when a photo is retained for manual review", async () => {
    const e = escenario()
    moderarImagen.mockResolvedValue({ decision: "REVIEW", motivos: ["contenido"], operaciones: 2 })

    expect(await moderarYGuardarImagenReporte(e.supabase, await entrada())).toMatchObject({ estado: "REVIEW", publicada: false })
    expect(notificarRevisionAdmin).toHaveBeenCalledOnce()
    expect(notificarRevisionAdmin).toHaveBeenCalledWith(expect.objectContaining({ supabase: e.supabase, tipo: "foto", reviewId: e.fila().id, reporteId: 7 }))
  })
  it("keeps the photo review result if the admin email fails", async () => {
    const e = escenario()
    moderarImagen.mockResolvedValue({ decision: "REVIEW", motivos: ["contenido"], operaciones: 2 })
    notificarRevisionAdmin.mockRejectedValueOnce(new Error("mail unavailable"))

    expect(await moderarYGuardarImagenReporte(e.supabase, await entrada())).toMatchObject({ estado: "REVIEW", publicada: false })
  })
  it("ignora miniatura falsificada sin otra clasificación ni copia de esos bytes", async () => {
    const e = escenario()
    const datos = { ...await entrada(), imageThumbnail: new File(["contenido no moderado"], "falsa.webp", { type: "image/webp" }) }
    await moderarYGuardarImagenReporte(e.supabase, datos)
    expect(moderarImagen).toHaveBeenCalledTimes(1)
    const miniatura = e.objetos.get(`reportes/${e.fila().id}/publicacion-miniatura`)!
    expect((await sharp(miniatura).metadata()).format).toBe("webp")
    expect(Buffer.from(miniatura).includes(Buffer.from("contenido no moderado"))).toBe(false)
  })
  it("retiro automático advierte y entrega outbox aun si falla correo, sin publicación", async () => {
    const e = escenario()
    moderarImagen.mockResolvedValue({ decision: "REJECTED", motivos: [], operaciones: 2 })
    const r = await moderarYGuardarImagenReporte(e.supabase, await entrada())
    expect(r.estado).toBe("REJECTED")
    expect(r.publicada).toBe(false)
    expect(r.motivos).toEqual(["Tu reporte fue retirado porque la fotografía adjunta incumple nuestras normas de contenido. Evitá volver a publicar este tipo de material"])
    expect(enviarAviso).toHaveBeenCalledWith(e.supabase, 7)
    expect(e.eventos).not.toContain("subir:reportes")
    expect(e.eventos).not.toContain("acreditar_puntos_reporte")
  })
  it("rechazada no puede publicarse mediante el helper reutilizable", async () => {
    const e = escenario()
    moderarImagen.mockResolvedValue({ decision: "REJECTED", motivos: ["explicita"], operaciones: 2 })
    await moderarYGuardarImagenReporte(e.supabase, await entrada())
    expect(await publicarImagenModerada(e.supabase, String(e.fila().id))).toMatchObject({ estado: "REJECTED", publicada: false })
    expect(e.eventos).not.toContain("subir:reportes")
  })
  it("original privado alterado bloquea recuperación", async () => {
    const e = escenario(); e.fallos.copia = true
    await moderarYGuardarImagenReporte(e.supabase, await entrada())
    e.objetos.set(`reportes-pendientes/${e.fila().path_privado}`, new Uint8Array([1, 2]))
    e.fallos.copia = false
    expect(await publicarImagenModerada(e.supabase, String(e.fila().id))).toMatchObject({ publicada: false })
    expect(e.eventos).not.toContain("confirmar_publicacion_moderacion")
  })
  it.each([
    [400, { statusCode: "404", error: "not_found", code: "NoSuchKey" }, true],
    [400, { statusCode: "400", error: "invalid", code: "InvalidRequest" }, false],
    [400, { statusCode: "404" }, false],
    [403, { statusCode: "404", error: "not_found", code: "NoSuchKey" }, false],
    [500, { statusCode: "404", error: "not_found", code: "NoSuchKey" }, false],
  ])("StorageUnknownError HTTP%s, cuerpo %j: publica=%s", async (status, cuerpo, permitido) => {
    const e = escenario()
    // El SDK conserva la Response HTTP400 original en vez de propagar statusCode.
    e.errorDescarga(() => ({ name: "StorageUnknownError", message: "{}", originalError: new Response(JSON.stringify(cuerpo), { status: status as number, headers: { "content-type": "application/json" } }) }))
    const r = await moderarYGuardarImagenReporte(e.supabase, await entrada())
    // Cada descarga requiere una Response nueva, como ocurre en el SDK real.
    expect(r.publicada).toBe(permitido)
    if (!permitido) expect(e.eventos).not.toContain("subir:reportes")
  })
  it.each(["json_invalido", "cuerpo_excesivo", "red", "lectura_bloqueada"])("%s falla cerrado sin subir", async (caso) => {
    const e = escenario()
    e.errorDescarga(() => {
      if (caso === "red") return { name: "StorageUnknownError", originalError: new TypeError("red") }
      const cuerpo = caso === "lectura_bloqueada" ? new ReadableStream<Uint8Array>()
        : caso === "cuerpo_excesivo" ? JSON.stringify({ statusCode: "404", error: "not_found", code: "NoSuchKey", message: "x".repeat(4096) })
        : "{"
      return { name: "StorageUnknownError", originalError: new Response(cuerpo, { status: 400 }) }
    })
    expect(await moderarYGuardarImagenReporte(e.supabase, await entrada())).toMatchObject({ publicada: false })
    expect(e.eventos).not.toContain("subir:reportes")
  })
  it("deduplica sin clasificar ni reservar otra vez", async () => {
    const e = escenario(); const datos = await entrada()
    await moderarYGuardarImagenReporte(e.supabase, datos)
    await moderarYGuardarImagenReporte(e.supabase, datos)
    expect(moderarImagen).toHaveBeenCalledTimes(1)
    expect(e.eventos.filter((v) => v === "reservar_operaciones_moderacion")).toHaveLength(1)
  })
  it("verifica propietario antes de leer bytes o llamar API", async () => {
    const e = escenario(); e.fallos.propietario = "otra"
    const datos = await entrada(); const leer = vi.spyOn(datos.image, "arrayBuffer")
    await expect(moderarYGuardarImagenReporte(e.supabase, datos)).resolves.toMatchObject({ publicada: false })
    expect(leer).not.toHaveBeenCalled(); expect(moderarImagen).not.toHaveBeenCalled()
  })
  it("cuota agotada conserva privado sin API", async () => {
    const e = escenario(); e.fallos.cuota = true
    expect(await moderarYGuardarImagenReporte(e.supabase, await entrada())).toMatchObject({ estado: "REVIEW", publicada: false })
    expect(moderarImagen).not.toHaveBeenCalled()
  })
  it.each(["armas", "proveedor_no_disponible", "configuracion_invalida", "operaciones_desconocidas"])("%s queda privado", async (motivo) => {
    const e = escenario()
    moderarImagen.mockResolvedValue({ decision: "REVIEW", motivos: [motivo], operaciones: 0 })
    expect(await moderarYGuardarImagenReporte(e.supabase, await entrada())).toMatchObject({ estado: "REVIEW", publicada: false })
    expect(e.eventos).not.toContain("subir:reportes")
    if (motivo === "operaciones_desconocidas") expect(e.eventos).not.toContain("registrar_operaciones_moderacion")
  })
  it("consumo desconocido nunca permite aprobación aunque el adaptador falle", async () => {
    const e = escenario()
    moderarImagen.mockResolvedValue({ decision: "APPROVED", motivos: ["operaciones_desconocidas"], operaciones: 0 })
    expect(await moderarYGuardarImagenReporte(e.supabase, await entrada())).toMatchObject({ estado: "REVIEW", publicada: false })
    expect(e.eventos).not.toContain("registrar_operaciones_moderacion")
  })
  it("exceso de consumo desactiva presupuesto y no publica", async () => {
    const e = escenario()
    moderarImagen.mockResolvedValue({ decision: "APPROVED", motivos: [], operaciones: 3 })
    expect(await moderarYGuardarImagenReporte(e.supabase, await entrada())).toMatchObject({ estado: "REVIEW", publicada: false })
    expect(e.rpc).toHaveBeenCalledWith("reducir_presupuesto_moderacion", { p_diario: 0, p_mensual: 0 })
  })
  it.each(["privado", "privadoExcepcion"] as const)("%s informa fallo privado también en duplicado", async (fallo) => {
    const e = escenario(); e.fallos[fallo] = true
    const datos = await entrada()
    expect(await moderarYGuardarImagenReporte(e.supabase, datos)).toMatchObject({ estado: "ERROR_PRIVADO", publicada: false })
    expect(await moderarYGuardarImagenReporte(e.supabase, datos)).toMatchObject({ estado: "ERROR_PRIVADO", publicada: false })
    expect(moderarImagen).not.toHaveBeenCalled()
  })
  it.each(["privado", "decision", "registro"] as const)("fallo de %s no expone bytes", async (fallo) => {
    const e = escenario(); e.fallos[fallo] = true
    expect(await moderarYGuardarImagenReporte(e.supabase, await entrada())).toMatchObject({ publicada: false })
    expect(e.eventos).not.toContain("subir:reportes")
  })
  it("recupera copia fallida con token durable sin API adicional", async () => {
    const e = escenario(); e.fallos.copia = true
    expect(await moderarYGuardarImagenReporte(e.supabase, await entrada())).toMatchObject({ estado: "APPROVED", publicada: false })
    expect(e.fila().estado_publicacion).toBe("publicando")
    e.fallos.copia = false
    expect(await publicarImagenModerada(e.supabase, String(e.fila().id))).toMatchObject({ publicada: true })
    expect(moderarImagen).toHaveBeenCalledTimes(1)
  })
  it("recupera confirmación fallida sin sobrescribir objetos", async () => {
    const e = escenario(); e.fallos.confirmar = true
    await moderarYGuardarImagenReporte(e.supabase, await entrada())
    const copias = e.eventos.filter((v) => v === "subir:reportes").length
    e.fallos.confirmar = false
    expect(await publicarImagenModerada(e.supabase, String(e.fila().id))).toMatchObject({ publicada: true })
    expect(e.eventos.filter((v) => v === "subir:reportes")).toHaveLength(copias)
  })
  it("objeto existente distinto no se sobrescribe ni confirma", async () => {
    const e = escenario(); e.fallos.copia = true
    await moderarYGuardarImagenReporte(e.supabase, await entrada())
    e.objetos.set(`reportes/${e.fila().id}/publicacion`, new Uint8Array([1, 2]))
    e.fallos.copia = false
    expect(await publicarImagenModerada(e.supabase, String(e.fila().id))).toMatchObject({ publicada: false })
    expect(e.eventos).not.toContain("confirmar_publicacion_moderacion")
  })
  it("perder carrera de confirmación no borra objetos confirmados", async () => {
    const e = escenario(); e.fallos.carrera = true
    expect(await moderarYGuardarImagenReporte(e.supabase, await entrada())).toMatchObject({ publicada: true })
    expect(e.eventos).not.toContain("borrar:reportes")
  })
  it("confirmación seguida de borrado lógico no elimina objetos ya confirmados", async () => {
    const e = escenario(); e.fallos.carreraBorrado = true
    moderarImagen.mockImplementationOnce(async () => { e.fallos.borrado = true; return { decision: "APPROVED", motivos: [], operaciones: 2 } })
    await moderarYGuardarImagenReporte(e.supabase, await entrada())
    expect(e.eventos).not.toContain("borrar:reportes")
  })
  it("borrado lógico durante copia limpia huérfanos aprobados", async () => {
    const e = escenario()
    moderarImagen.mockImplementationOnce(async () => { e.fallos.borrado = true; return { decision: "APPROVED", motivos: [], operaciones: 2 } })
    expect(await moderarYGuardarImagenReporte(e.supabase, await entrada())).toMatchObject({ publicada: false })
    expect(e.eventos).toContain("borrar:reportes")
  })
  it("limpieza fallida queda auditada y es recuperable", async () => {
    const e = escenario(); e.fallos.eliminar = true
    const r = await moderarYGuardarImagenReporte(e.supabase, await entrada())
    expect(r.advertencias).toContain("limpieza_privada_pendiente")
    expect(e.fila().motivos).toContain("limpieza_privada_pendiente")
    e.fallos.eliminar = false
    expect(await limpiarImagenModerada(e.supabase, String(e.fila().id))).toEqual([])
    expect([...e.objetos.keys()].some((p) => p.startsWith("reportes-pendientes/"))).toBe(false)
  })
})

describe("evidencia de reparación en el pipeline de moderación", () => {
  /** Fila creada por `crear_evidencia_reparacion`: misma cola, destino propio. */
  function filaEvidencia() {
    return {
      id: "moderacion-1", reporte_id: 7, propietario_id: "persona", hash_sha256: "hash",
      path_privado: "persona/moderacion-1", decision: "REVIEW", motivos: [],
      estado_publicacion: "pendiente", token: null, destino: "evidencia_reparacion", evidencia_id: "evidencia-1",
    }
  }

  /** Entrada de evidencia con la foto real generada por el escenario. */
  async function entradaEvidencia() {
    const { image } = await entrada()
    return { reporteId: 7, autorId: "persona", comentario: "Bache tapado", image }
  }

  it("registra la evidencia antes de subir los bytes privados y publica la foto aprobada", async () => {
    const e = escenario(filaEvidencia())

    const resultado = await moderarYGuardarImagenEvidenciaReparacion(e.supabase, await entradaEvidencia())

    expect(resultado).toMatchObject({ evidenciaId: "evidencia-1", estado: "APPROVED", publicada: true, motivos: [] })
    expect(e.eventos.indexOf("crear_evidencia_reparacion")).toBeLessThan(e.eventos.indexOf("subir:reportes-pendientes"))
    expect(e.eventos.indexOf("decidir_imagen_moderacion")).toBeLessThan(e.eventos.indexOf("subir:reportes"))
    expect(e.fila().estado_publicacion).toBe("publicada")
    expect(e.eventos).not.toContain("borrar:reportes")
  })

  it("rechazar la foto invalida solo la evidencia y nunca retira el reporte", async () => {
    const e = escenario(filaEvidencia())
    moderarImagen.mockResolvedValue({ decision: "REJECTED", motivos: ["contenido"], operaciones: 2 })

    const resultado = await moderarYGuardarImagenEvidenciaReparacion(e.supabase, await entradaEvidencia())

    expect(resultado).toMatchObject({ evidenciaId: "evidencia-1", estado: "REJECTED", publicada: false })
    expect(resultado.motivos).toEqual(["La fotografía de la reparación fue rechazada: la evidencia no se publica y el reporte sigue pendiente."])
    expect(enviarAviso).not.toHaveBeenCalled()
    expect(e.eventos).not.toContain("subir:reportes")
  })

  it("mantiene privada la foto en revisión manual y avisa a la administración", async () => {
    const e = escenario(filaEvidencia())
    moderarImagen.mockResolvedValue({ decision: "REVIEW", motivos: ["contenido"], operaciones: 2 })

    const resultado = await moderarYGuardarImagenEvidenciaReparacion(e.supabase, await entradaEvidencia())

    expect(resultado).toMatchObject({ evidenciaId: "evidencia-1", estado: "REVIEW", publicada: false })
    expect(resultado.motivos).toEqual(["La fotografía de la reparación quedó privada y pendiente de revisión."])
    expect(notificarRevisionAdmin).toHaveBeenCalledOnce()
    expect(enviarAviso).not.toHaveBeenCalled()
    expect(e.eventos).not.toContain("subir:reportes")
  })

  it("devuelve el rechazo de la RPC sin moderar ni guardar bytes", async () => {
    const e = escenario(filaEvidencia())
    e.fallos.creacion = "PRE04"

    const resultado = await moderarYGuardarImagenEvidenciaReparacion(e.supabase, await entradaEvidencia())

    expect(resultado).toMatchObject({ evidenciaId: null, codigoRpc: "PRE04", publicada: false })
    expect(moderarImagen).not.toHaveBeenCalled()
    expect([...e.objetos.keys()]).toHaveLength(0)
    expect(e.eventos).not.toContain("subir:reportes-pendientes")
  })

  it("no declara éxito cuando la carga privada falla y deja la evidencia recuperable", async () => {
    const e = escenario(filaEvidencia())
    e.fallos.privado = true

    const fallido = await moderarYGuardarImagenEvidenciaReparacion(e.supabase, await entradaEvidencia())

    expect(fallido).toMatchObject({ evidenciaId: "evidencia-1", estado: "ERROR_PRIVADO", publicada: false })
    expect(fallido.advertencias).toContain("carga_privada_pendiente")
    expect(e.fila()).toMatchObject({ decision: "REVIEW", estado_publicacion: "pendiente" })
    expect(e.fila().motivos).toContain("carga_privada_pendiente")
    expect(e.eventos).not.toContain("decidir_imagen_moderacion")
    expect(moderarImagen).not.toHaveBeenCalled()
  })

  it("reanuda la misma evidencia al reintentar la foto que no llegó a la cola privada", async () => {
    const e = escenario(filaEvidencia())
    e.fallos.privado = true
    const entradaReparacion = await entradaEvidencia()
    await moderarYGuardarImagenEvidenciaReparacion(e.supabase, entradaReparacion)

    e.fallos.privado = false
    e.fallos.creacion = "PRE03"
    const recuperado = await moderarYGuardarImagenEvidenciaReparacion(e.supabase, entradaReparacion)

    expect(recuperado).toMatchObject({ evidenciaId: "evidencia-1", estado: "APPROVED", publicada: true })
    expect(e.fila().estado_publicacion).toBe("publicada")
    // Una sola clasificación: el reintento reanuda la carga, no vuelve a moderar ni duplica filas.
    expect(moderarImagen).toHaveBeenCalledOnce()
    expect(e.eventos.filter((evento) => evento === "subir:reportes-pendientes")).toHaveLength(2)
    expect(e.eventos.filter((evento) => evento === "confirmar_publicacion_moderacion")).toHaveLength(1)
  })

  it.each([
    ["otra cuenta", { autor_id: "otra-persona" }],
    ["evidencia ya publicada", { estado: "en_verificacion" }],
  ])("no reanuda la carga de una evidencia no recuperable (%s)", async (_caso, cambio) => {
    const e = escenario(filaEvidencia())
    e.fallos.creacion = "PRE03"
    Object.assign(e.fallos.evidencia as Record<string, unknown>, cambio)

    const resultado = await moderarYGuardarImagenEvidenciaReparacion(e.supabase, await entradaEvidencia())

    expect(resultado).toMatchObject({ evidenciaId: null, codigoRpc: "PRE03" })
    expect(e.eventos).not.toContain("subir:reportes-pendientes")
    expect(moderarImagen).not.toHaveBeenCalled()
  })

  it("no reanuda la carga con una fotografía distinta", async () => {
    const e = escenario(filaEvidencia())
    e.fallos.creacion = "PRE03"

    const resultado = await moderarYGuardarImagenEvidenciaReparacion(e.supabase, await entradaEvidencia())

    expect(resultado).toMatchObject({ evidenciaId: null, codigoRpc: "PRE03" })
    expect(e.eventos).not.toContain("subir:reportes-pendientes")
  })

  it("no sobrescribe la carga privada existente al reanudar", async () => {
    const e = escenario(filaEvidencia())
    e.fallos.privado = true
    const entradaReparacion = await entradaEvidencia()
    await moderarYGuardarImagenEvidenciaReparacion(e.supabase, entradaReparacion)
    const ruta = `reportes-pendientes/${String(e.fila().path_privado)}`
    e.objetos.set(ruta, new Uint8Array([9, 9]))
    e.fallos.privado = false
    e.fallos.creacion = "PRE03"

    const resultado = await moderarYGuardarImagenEvidenciaReparacion(e.supabase, entradaReparacion)

    expect(resultado).toMatchObject({ evidenciaId: "evidencia-1", estado: "ERROR_PRIVADO", publicada: false })
    expect(e.objetos.get(ruta)).toEqual(new Uint8Array([9, 9]))
    expect(moderarImagen).not.toHaveBeenCalled()
  })

  it("reanuda el reintento idéntico aunque tampoco se pueda escribir la marca de carga", async () => {
    const e = escenario(filaEvidencia())
    // La lectura posterior a la RPC falla y la relectura del catch también: la fila
    // existe, pero no se puede ni leerla ni marcar el fallo de carga privada.
    e.fallos.lectura = 2
    const entradaReparacion = await entradaEvidencia()

    const fallido = await moderarYGuardarImagenEvidenciaReparacion(e.supabase, entradaReparacion)

    expect(fallido).toMatchObject({ evidenciaId: "evidencia-1", estado: "ERROR_PRIVADO", publicada: false })
    expect(fallido.advertencias).toContain("carga_privada_pendiente")
    expect(e.fila().motivos).not.toContain("carga_privada_pendiente")
    expect(e.eventos).not.toContain("subir:reportes-pendientes")

    e.fallos.creacion = "PRE03"
    const recuperado = await moderarYGuardarImagenEvidenciaReparacion(e.supabase, entradaReparacion)

    expect(recuperado).toMatchObject({ evidenciaId: "evidencia-1", estado: "APPROVED", publicada: true })
    expect(e.fila().estado_publicacion).toBe("publicada")
    // Una sola clasificación y una sola confirmación: la foto no se modera dos veces.
    expect(moderarImagen).toHaveBeenCalledOnce()
    expect(e.eventos.filter((evento) => evento === "subir:reportes-pendientes")).toHaveLength(1)
    expect(e.eventos.filter((evento) => evento === "decidir_imagen_moderacion")).toHaveLength(1)
    expect(e.eventos.filter((evento) => evento === "confirmar_publicacion_moderacion")).toHaveLength(1)
  })

  it("rechaza el reintento con otro comentario sin publicar ni tocar la evidencia guardada", async () => {
    const e = escenario(filaEvidencia())
    e.fallos.privado = true
    const entradaInicial = await entradaEvidencia()
    await moderarYGuardarImagenEvidenciaReparacion(e.supabase, entradaInicial)
    const objetosGuardados = [...e.objetos.keys()]
    const motivosGuardados = [...(e.fila().motivos as string[])]
    const subidasPrivadas = e.eventos.filter((evento) => evento === "subir:reportes-pendientes").length

    e.fallos.privado = false
    e.fallos.creacion = "PRE03"
    const cambiado = await moderarYGuardarImagenEvidenciaReparacion(e.supabase, {
      ...entradaInicial,
      comentario: "Bache tapado por la municipalidad",
    })

    // El comentario nuevo nunca reemplaza al guardado: se rechaza explícitamente.
    expect(cambiado).toMatchObject({ evidenciaId: null, comentarioDistinto: true, publicada: false })
    expect(e.fallos.evidencia).toMatchObject({ comentario: "Bache tapado" })
    expect(e.fila()).toMatchObject({ decision: "REVIEW", estado_publicacion: "pendiente", token: null })
    expect(e.fila().motivos).toEqual(motivosGuardados)
    expect([...e.objetos.keys()]).toEqual(objetosGuardados)
    expect(e.eventos.filter((evento) => evento === "subir:reportes-pendientes")).toHaveLength(subidasPrivadas)
    expect(e.eventos).not.toContain("reclamar_imagen_moderacion")
    expect(e.eventos).not.toContain("reservar_operaciones_moderacion")
    expect(e.eventos).not.toContain("decidir_imagen_moderacion")
    expect(e.eventos).not.toContain("subir:reportes")
    expect(moderarImagen).not.toHaveBeenCalled()
  })

  it("acepta la carga privada cuya respuesta se perdió si Storage ya guardó los mismos bytes", async () => {
    const e = escenario(filaEvidencia())
    e.fallos.privadoRespuestaPerdida = true

    const resultado = await moderarYGuardarImagenEvidenciaReparacion(e.supabase, await entradaEvidencia())

    // Los bytes confirmados en Storage cuentan como carga hecha: se clasifica una sola vez.
    expect(resultado).toMatchObject({ evidenciaId: "evidencia-1", estado: "APPROVED", publicada: true })
    expect(e.fila().motivos).not.toContain("carga_privada_pendiente")
    expect(moderarImagen).toHaveBeenCalledOnce()
    expect(e.eventos.filter((evento) => evento === "confirmar_publicacion_moderacion")).toHaveLength(1)
  })

  it("rechaza como no reanudable una foto distinta aunque el comentario también cambie", async () => {
    const e = escenario(filaEvidencia())
    e.fallos.privado = true
    const entradaInicial = await entradaEvidencia()
    await moderarYGuardarImagenEvidenciaReparacion(e.supabase, entradaInicial)
    const motivosGuardados = [...(e.fila().motivos as string[])]
    const otrosBytes = await sharp({ create: { width: 24, height: 24, channels: 3, background: "red" } }).png().toBuffer()

    e.fallos.privado = false
    e.fallos.creacion = "PRE03"
    const resultado = await moderarYGuardarImagenEvidenciaReparacion(e.supabase, {
      ...entradaInicial,
      comentario: "Otra cosa",
      image: new File([new Uint8Array(otrosBytes)], "foto.png", { type: "image/png" }),
    })

    // La foto es otra: no se revela nada del comentario guardado ni se reanuda.
    expect(resultado).toMatchObject({ evidenciaId: null, publicada: false })
    expect(resultado.comentarioDistinto).toBeUndefined()
    expect(e.fila()).toMatchObject({ decision: "REVIEW", estado_publicacion: "pendiente" })
    expect(e.fila().motivos).toEqual(motivosGuardados)
    expect(e.eventos).not.toContain("reclamar_imagen_moderacion")
    expect(moderarImagen).not.toHaveBeenCalled()
  })

  it("reanuda el reintento cuando el comentario solo cambia en los espacios", async () => {
    const e = escenario(filaEvidencia())
    e.fallos.privado = true
    const entradaInicial = await entradaEvidencia()
    await moderarYGuardarImagenEvidenciaReparacion(e.supabase, entradaInicial)

    e.fallos.privado = false
    e.fallos.creacion = "PRE03"
    const recuperado = await moderarYGuardarImagenEvidenciaReparacion(e.supabase, {
      ...entradaInicial,
      comentario: "  Bache tapado  ",
    })

    // La creación guarda el comentario recortado, así que el reintento equivalente reanuda.
    expect(recuperado).toMatchObject({ evidenciaId: "evidencia-1", estado: "APPROVED", publicada: true })
    expect(moderarImagen).toHaveBeenCalledOnce()
    expect(e.eventos.filter((evento) => evento === "confirmar_publicacion_moderacion")).toHaveLength(1)
  })

  it("no reanuda una fila ya clasificada aunque falte la marca de carga", async () => {
    const e = escenario(filaEvidencia())
    // Revisión humana pendiente: el proveedor ya dejó su motivo y su consumo.
    Object.assign(e.fila(), { motivos: ["contenido_ambiguo_armas_violencia_o_lesiones"], operaciones: 2 })
    e.fallos.creacion = "PRE03"

    const resultado = await moderarYGuardarImagenEvidenciaReparacion(e.supabase, await entradaEvidencia())

    expect(resultado).toMatchObject({ evidenciaId: null, codigoRpc: "PRE03" })
    expect(e.eventos).not.toContain("subir:reportes-pendientes")
    expect(moderarImagen).not.toHaveBeenCalled()
  })

  it.each([
    ["clasificación en curso", { estado_publicacion: "reclamada" }],
    ["clasificación aprobada sin publicar", { estado_publicacion: "publicando", token: "publicacion" }],
  ])("no reanuda una foto con %s", async (_caso, cambio) => {
    const e = escenario(filaEvidencia())
    Object.assign(e.fila(), cambio)
    e.fallos.creacion = "PRE03"

    const resultado = await moderarYGuardarImagenEvidenciaReparacion(e.supabase, await entradaEvidencia())

    expect(resultado).toMatchObject({ evidenciaId: null, codigoRpc: "PRE03" })
    expect(e.eventos).not.toContain("subir:reportes-pendientes")
    expect(moderarImagen).not.toHaveBeenCalled()
  })

  it("dos reintentos simultáneos clasifican y publican la foto una sola vez", async () => {
    const e = escenario(filaEvidencia())
    e.fallos.lectura = 2
    const datos = await entradaEvidencia()
    await moderarYGuardarImagenEvidenciaReparacion(e.supabase, datos)
    e.fallos.creacion = "PRE03"

    const resultados = await Promise.all([
      moderarYGuardarImagenEvidenciaReparacion(e.supabase, datos),
      moderarYGuardarImagenEvidenciaReparacion(e.supabase, datos),
    ])

    // Ninguno declara éxito sin una evidencia durable: uno reanuda y publica, y el que
    // pierde el reclamo recibe el rechazo traducido, nunca una publicación.
    expect(resultados.find((resultado) => resultado.evidenciaId === "evidencia-1"))
      .toMatchObject({ estado: "APPROVED", publicada: true })
    for (const perdido of resultados.filter((resultado) => resultado.evidenciaId === null)) {
      expect(perdido).toMatchObject({ codigoRpc: "PRE03", publicada: false })
    }
    expect(moderarImagen).toHaveBeenCalledOnce()
    expect(e.eventos.filter((evento) => evento === "decidir_imagen_moderacion")).toHaveLength(1)
    expect(e.eventos.filter((evento) => evento === "confirmar_publicacion_moderacion")).toHaveLength(1)
    expect(e.fila().estado_publicacion).toBe("publicada")
  })

  it("reanuda el reintento cuando la primera lectura de la cola falla", async () => {
    const e = escenario(filaEvidencia())
    e.fallos.lectura = 1
    const entradaReparacion = await entradaEvidencia()

    const fallido = await moderarYGuardarImagenEvidenciaReparacion(e.supabase, entradaReparacion)

    expect(fallido).toMatchObject({ evidenciaId: "evidencia-1", estado: "ERROR_PRIVADO", publicada: false })
    expect(e.fila().motivos).toContain("carga_privada_pendiente")
    expect(e.eventos).not.toContain("subir:reportes-pendientes")

    e.fallos.creacion = "PRE03"
    const recuperado = await moderarYGuardarImagenEvidenciaReparacion(e.supabase, entradaReparacion)

    expect(recuperado).toMatchObject({ evidenciaId: "evidencia-1", estado: "APPROVED", publicada: true })
    expect(e.fila().estado_publicacion).toBe("publicada")
  })
})
