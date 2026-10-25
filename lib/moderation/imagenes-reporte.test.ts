/** Simulación de efectos durables y Storage; el proveedor nunca usa red real. */
import { beforeEach, describe, expect, it, vi } from "vitest"
import sharp from "sharp"
import type { SupabaseClient } from "@supabase/supabase-js"
const { moderarImagen } = vi.hoisted(() => ({ moderarImagen: vi.fn() }))
vi.mock("./sightengine.server", () => ({ moderarImagen }))
import { moderarYGuardarImagenReporte, publicarImagenModerada, limpiarImagenModerada } from "./imagenes-reporte.server"

/** Provee CAS y objetos en memoria, manteniendo el orden observable de efectos. */
function escenario() {
  const eventos: string[] = []
  const objetos = new Map<string, Uint8Array>()
  let fila: Record<string, unknown> | null = null
  let errorDescarga: unknown = null
  const fallos = { cuota: false, copia: false, confirmar: false, eliminar: false, privado: false, privadoExcepcion: false, registro: false, decision: false, borrado: false, propietario: "persona", carrera: false, carreraBorrado: false }
  const rpc = vi.fn(async (nombre: string, p: Record<string, unknown>) => {
    eventos.push(nombre)
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
  const from = vi.fn((tabla: string) => {
    let accion = "leer"
    let datos: Record<string, unknown> = {}
    const consulta = {
      select: vi.fn(() => consulta), eq: vi.fn(() => consulta), is: vi.fn(() => consulta),
      insert: vi.fn((d: Record<string, unknown>) => { accion = "insertar"; datos = d; return consulta }),
      update: vi.fn((d: Record<string, unknown>) => { accion = "actualizar"; datos = d; return consulta }),
      single: vi.fn(async () => ejecutar()), maybeSingle: vi.fn(async () => ejecutar()),
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
  return { errorDescarga: (error: unknown) => { errorDescarga = error }, supabase: { from, rpc, storage } as unknown as SupabaseClient, eventos, objetos, fallos, rpc, fila: () => fila! }
}

/** Crea evidencia inocua real, no una cabecera simulada. */
async function entrada() {
  const bytes = await sharp({ create: { width: 24, height: 24, channels: 3, background: "blue" } }).png().toBuffer()
  return { reporteId: 7, propietarioId: "persona", image: new File([new Uint8Array(bytes)], "foto.png", { type: "image/png" }) }
}

beforeEach(() => {
  moderarImagen.mockReset().mockResolvedValue({ decision: "APPROVED", motivos: [], operaciones: 2, proveedor: "simulado" })
})
describe("orquestación de imágenes", () => {
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
  it("ignora miniatura falsificada sin otra clasificación ni copia de esos bytes", async () => {
    const e = escenario()
    const datos = { ...await entrada(), imageThumbnail: new File(["contenido no moderado"], "falsa.webp", { type: "image/webp" }) }
    await moderarYGuardarImagenReporte(e.supabase, datos)
    expect(moderarImagen).toHaveBeenCalledTimes(1)
    const miniatura = e.objetos.get(`reportes/${e.fila().id}/publicacion-miniatura`)!
    expect((await sharp(miniatura).metadata()).format).toBe("webp")
    expect(Buffer.from(miniatura).includes(Buffer.from("contenido no moderado"))).toBe(false)
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
