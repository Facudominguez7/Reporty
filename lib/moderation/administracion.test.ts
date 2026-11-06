/** Pruebas de autorización DB, lectura privada y decisiones administrativas CAS. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createHash } from "node:crypto"
const dobles = vi.hoisted(() => ({ sesion: vi.fn(), servicio: vi.fn(), rol: vi.fn(), publicar: vi.fn(), limpiar: vi.fn(), avisar: vi.fn(), preparar: vi.fn() }))
vi.mock("./avisos-retiro.server", () => ({ enviarAvisoRetiro: dobles.avisar, VENTANA_REINTENTO_MS: (24 * 60 - 5) * 60000 }))
vi.mock("server-only", () => ({}))
vi.mock("@/utils/supabase/server", () => ({ createClient: dobles.sesion }))
vi.mock("@/utils/supabase/admin", () => ({ createAdminClient: dobles.servicio }))
vi.mock("@/lib/media/preparar-imagen-reporte.server", () => ({ prepararImagenReporte: dobles.preparar }))
vi.mock("@/lib/authz/roles", async (original) => ({ ...await original<object>(), getUserRoleContext: dobles.rol }))
vi.mock("./imagenes-reporte.server", () => ({ publicarImagenModerada: dobles.publicar, limpiarImagenModerada: dobles.limpiar }))
import { autorizarAdministracion, listarImagenesAdministrativas, obtenerImagenPrivada, ejecutarRevision, editarMascotaAdministrativamente, subirFotoReemplazoMascotaAdministrativamente } from "./administracion.server"
const id = "e1a3f644-9c40-4a40-9000-000000000001"
const bytes = Buffer.from("RIFF0000WEBPimagen")
let fila: Record<string, unknown>
let consulta: Record<string, ReturnType<typeof vi.fn>>
let rpc: ReturnType<typeof vi.fn>
let descarga: ReturnType<typeof vi.fn>
beforeEach(() => {
  vi.clearAllMocks()
  fila = { id, reporte_id: 7, decision: "REVIEW", estado_publicacion: "pendiente", motivos: [], token: "token-original", path_privado: "privado", hash_sha256: createHash("sha256").update(bytes).digest("hex"), reemplaza_foto_id: null }
  consulta = Object.fromEntries(["select", "eq", "in", "is", "or", "limit", "order", "range"].map((clave) => [clave, vi.fn()]))
  for (const metodo of Object.values(consulta)) metodo.mockReturnValue(consulta)
  consulta.single = vi.fn(async () => ({ data: fila, error: null }))
  consulta.maybeSingle = vi.fn(async () => ({ data: fila, error: null }))
  consulta.range.mockImplementation(async () => ({ data: [fila], error: null }))
  rpc = vi.fn(async () => ({ data: true, error: null }))
  descarga = vi.fn(async () => ({ data: new Blob([bytes]), error: null }))
  dobles.preparar.mockResolvedValue({ original: bytes, miniatura: bytes })
  dobles.sesion.mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: "admin-verificado", user_metadata: { rol_id: 1 } } }, error: null }) }, rpc })
  dobles.rol.mockResolvedValue({ data: { roleId: 1 }, error: null })
  dobles.servicio.mockReturnValue({ from: vi.fn(() => consulta), rpc, storage: { from: vi.fn(() => ({ download: descarga, upload: vi.fn(async () => ({ error: null })), remove: vi.fn(async () => ({ error: null })), getPublicUrl: vi.fn(() => ({ data: { publicUrl: "https://example.invalid/photo" } })) })) } })
  dobles.publicar.mockResolvedValue({ publicada: true, advertencias: [] })
  dobles.limpiar.mockResolvedValue([])
  dobles.avisar.mockResolvedValue("pendiente")
})
afterEach(() => vi.unstubAllGlobals())

function mockReplacementMetadataFailure(concurrentFinalizer: boolean, finalizerResponseLost = false, currentReadFailed = false, reconcileFails = false, petBeforeReadFailed = false) {
  const evidence = {
    id, propietario_id: "owner", path_privado: "owner/private", path_publico: null,
    hash_sha256: createHash("sha256").update(bytes).digest("hex"), decision: "REVIEW", estado: "pendiente",
    estado_publicacion: "pendiente", publish_token: null, reemplaza_mascota_id: 9, mascota_id: null, motivos: [] as string[],
  }
  let petReads = 0
  const remove = vi.fn(async () => ({ error: null }))
  const upload = vi.fn(async () => ({ error: null }))
  let publicDownloads = 0
  const from = vi.fn((table: string) => {
    let selected = ""
    let idFilter: unknown
    let updatePayload: Record<string, unknown> | null = null
    const query: Record<string, any> = {}
    for (const method of ["select", "eq", "is", "update", "limit", "single", "maybeSingle", "contains"]) query[method] = vi.fn((...args: unknown[]) => {
      if (method === "select") selected = String(args[0])
      if (method === "eq" && args[0] === "id") idFilter = args[1]
      if (method === "update") updatePayload = args[0] as Record<string, unknown>
      if (method === "contains" && updatePayload) {
        Object.assign(evidence, updatePayload)
        return Promise.resolve({ error: null })
      }
      if (method === "single") {
        if (table === "mascotas_fotos_moderacion" && idFilter === "old-evidence") return Promise.resolve({ data: null, error: { message: "metadata unavailable" } })
        return Promise.resolve({ data: evidence, error: null })
      }
      if (method === "maybeSingle") {
        if (table === "mascotas_fotos_moderacion" && updatePayload) {
          Object.assign(evidence, updatePayload)
          return Promise.resolve({ data: { id }, error: null })
        }
        if (table === "mascotas_fotos_moderacion") return Promise.resolve({ data: evidence, error: null })
        if (table === "mascotas_perdidas") {
          petReads += 1
          if (selected === "id") return Promise.resolve({ data: { id: 9 }, error: null })
          if (selected === "foto_moderacion_id") return Promise.resolve(petBeforeReadFailed
            ? { data: null, error: { message: "pre-finalization lookup unavailable" } }
            : { data: { foto_moderacion_id: "old-evidence" }, error: null })
          if (currentReadFailed && selected === "foto_moderacion_id,foto_path") return Promise.resolve({ data: null, error: { message: "pet lookup unavailable" } })
          return Promise.resolve({ data: concurrentFinalizer ? { foto_moderacion_id: id, foto_path: `mascotas/${id}.webp` } : { foto_moderacion_id: "old-evidence", foto_path: "mascotas/old-evidence.webp" }, error: null })
        }
      }
      if (method === "limit") return Promise.resolve({ data: concurrentFinalizer ? [{ id: 9 }] : [], error: null })
      return query
    })
    return query
  })
  const service = {
    from,
    storage: { from: vi.fn((bucket: string) => ({
      download: vi.fn(async () => {
        if (bucket === "reportes-pendientes") return { data: new Blob([bytes]), error: null }
        publicDownloads += 1
        return publicDownloads === 1 ? { data: null, error: { statusCode: "404" } } : { data: null, error: { statusCode: "404" } }
      }), upload, remove, getPublicUrl: vi.fn(() => ({ data: { publicUrl: "https://example.invalid/photo" } })),
    })) },
  }
  dobles.servicio.mockReturnValue(service)
  rpc.mockImplementation(async (name: string) => name === "reclamar_reemplazo_foto_mascota"
    ? { data: "claim-token", error: null }
    : name === "finalizar_reemplazo_foto_mascota"
      ? finalizerResponseLost ? { data: null, error: { message: "response lost" } }
        : { data: concurrentFinalizer ? "" : "mascotas/old-evidence.webp", error: null }
      : name === "conciliar_reemplazo_foto_mascota"
        ? reconcileFails ? { data: null, error: { message: "marker persistence failed" } }
          : { data: concurrentFinalizer ? "actual" : "limpieza", error: null }
        : { data: null, error: null })
  vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })))
  return { evidence, from, upload, remove }
}

describe("frontera administrativa", () => {
  it("finalizes instead of deleting the uploaded photo when old-photo metadata lookup fails", async () => {
    const flow = mockReplacementMetadataFailure(false)
    const result = await ejecutarRevision(id, "aprobar")
    expect(result).toMatchObject({ exito: true, mensaje: expect.stringContaining("foto anterior quedó pendiente") })
    expect(rpc).toHaveBeenCalledWith("finalizar_reemplazo_foto_mascota", { p_evidencia_id: id, p_token: "claim-token" })
    expect(flow.remove).not.toHaveBeenCalled()
  })
  it("does not delete a photo when a concurrent finalizer committed but its response was lost", async () => {
    const flow = mockReplacementMetadataFailure(true, true)
    const result = await ejecutarRevision(id, "aprobar")
    expect(result).toMatchObject({ exito: true, mensaje: expect.stringContaining("ya está activo") })
    expect(flow.remove).not.toHaveBeenCalled()
    expect(rpc).toHaveBeenCalledWith("finalizar_reemplazo_foto_mascota", { p_evidencia_id: id, p_token: "claim-token" })
  })
  it("reconciles before cleanup when the pre-finalization listing lookup fails", async () => {
    const flow = mockReplacementMetadataFailure(false, false, false, false, true)
    const result = await ejecutarRevision(id, "aprobar")
    expect(result).toMatchObject({ exito: false, mensaje: expect.stringContaining("limpieza quedó registrada") })
    expect(rpc).toHaveBeenCalledWith("conciliar_reemplazo_foto_mascota", { p_evidencia_id: id })
    expect(flow.remove).not.toHaveBeenCalledWith([`mascotas/${id}.webp`])
  })
  it("persists reconciliation after finalizer and follow-up lookup are uncertain", async () => {
    const flow = mockReplacementMetadataFailure(false, true, true)
    const result = await ejecutarRevision(id, "aprobar")
    expect(result).toMatchObject({ exito: false, mensaje: expect.stringContaining("limpieza quedó registrada") })
    expect(rpc).toHaveBeenCalledWith("conciliar_reemplazo_foto_mascota", { p_evidencia_id: id })
    expect(flow.remove).not.toHaveBeenCalled()
  })
  it("fails closed if durable reconciliation marker persistence fails", async () => {
    const flow = mockReplacementMetadataFailure(false, true, true, true)
    const result = await ejecutarRevision(id, "aprobar")
    expect(result).toMatchObject({ exito: false, mensaje: expect.stringContaining("ni registrar su limpieza") })
    expect(flow.remove).not.toHaveBeenCalled()
  })
  it("recognizes a concurrent finalizer through durable reconciliation without deleting the active photo", async () => {
    const flow = mockReplacementMetadataFailure(true, true, true)
    const result = await ejecutarRevision(id, "aprobar")
    expect(result).toMatchObject({ exito: true, mensaje: expect.stringContaining("ya está activo") })
    expect(rpc).toHaveBeenCalledWith("conciliar_reemplazo_foto_mascota", { p_evidencia_id: id })
    expect(flow.remove).not.toHaveBeenCalled()
  })
  it("reconciliation retry keeps a now-current replacement and clears its pending marker", async () => {
    const flow = mockReplacementMetadataFailure(true)
    flow.evidence.estado_publicacion = "rechazada"
    flow.evidence.motivos = ["limpieza_publica_pendiente"]
    const result = await ejecutarRevision(id, "limpiar")
    expect(result).toMatchObject({ exito: true })
    expect(flow.remove).not.toHaveBeenCalledWith([`mascotas/${id}.webp`])
  })
  it("reconciliation retry deletes only a non-current replacement that is already non-publishable", async () => {
    const flow = mockReplacementMetadataFailure(false)
    flow.evidence.estado_publicacion = "rechazada"
    flow.evidence.motivos = ["limpieza_publica_pendiente"]
    const result = await ejecutarRevision(id, "limpiar")
    expect(result).toMatchObject({ exito: true })
    expect(flow.remove).toHaveBeenCalledWith([`mascotas/${id}.webp`])
  })
  it("stores an admin replacement privately under a DB-created moderation row", async () => {
    fila.propietario_id = "owner-id"
    rpc.mockImplementation(async (_name, params) => ({ data: params.p_evidencia_id, error: null }))
    const file = new File(["image"], "pet.webp", { type: "image/webp" })
    const result = await subirFotoReemplazoMascotaAdministrativamente(9, file)
    expect(result).toMatchObject({ exito: true, mascotaId: 9, imagenId: expect.any(String) })
    expect(dobles.preparar).toHaveBeenCalledWith(file)
    expect(rpc).toHaveBeenCalledWith("crear_revision_reemplazo_foto_mascota", { p_mascota_id: 9, p_evidencia_id: result.imagenId, p_hash: createHash("sha256").update(bytes).digest("hex") })
    const storage = dobles.servicio.mock.results[0].value.storage.from
    expect(storage).toHaveBeenCalledWith("reportes-pendientes")
    expect(storage.mock.results[0].value.upload).toHaveBeenCalledWith(`owner-id/${result.imagenId}`, bytes, expect.objectContaining({ upsert: false, contentType: "image/webp" }))
  })
  it("does not process or store an unapproved caller's replacement photo", async () => {
    dobles.rol.mockResolvedValue({ data: { roleId: 2 }, error: null })
    const file = new File(["image"], "pet.webp", { type: "image/webp" })
    await expect(subirFotoReemplazoMascotaAdministrativamente(9, file)).rejects.toMatchObject({ estado: 403 })
    expect(dobles.preparar).not.toHaveBeenCalled()
    expect(dobles.servicio).not.toHaveBeenCalled()
  })
  it("admin edits allowed fields via authenticated RPC, not service-role writes", async () => {
    const input = { id: 9, tipoAnimal: "gato" as const, descripcion: "Revisada", lat: -34, lon: -56, telefono: "555123", estado: "perdida" as const }
    expect(await editarMascotaAdministrativamente(input)).toMatchObject({ exito: true, mascotaId: 9 })
    expect(rpc).toHaveBeenCalledWith("editar_mascota_moderacion", {
      p_mascota_id: 9, p_tipo_animal: "gato", p_descripcion: "Revisada", p_lat: -34, p_lon: -56, p_telefono: "555123", p_estado: "perdida",
    })
    expect(dobles.servicio.mock.results[0].value.from).not.toHaveBeenCalled()
  })
  it("non-admin cannot edit and invalid required fields never reach DB", async () => {
    dobles.rol.mockResolvedValue({ data: { roleId: 2 }, error: null })
    await expect(editarMascotaAdministrativamente({ id: 9, tipoAnimal: "perro", descripcion: "Edit", lat: 0, lon: 0, telefono: "555", estado: "encontrada" })).rejects.toMatchObject({ estado: 403 })
    dobles.rol.mockResolvedValue({ data: { roleId: 1 }, error: null })
    await expect(editarMascotaAdministrativamente({ id: 9, tipoAnimal: "perro", descripcion: "  ", lat: 0, lon: 0, telefono: "555", estado: "perdida" })).rejects.toMatchObject({ estado: 400 })
    expect(rpc).not.toHaveBeenCalled()
  })
  it.each([2, 3, 4, 5, null])("niega rol DB %s aunque metadata diga Admin antes del servicio", async (roleId) => {
    dobles.rol.mockResolvedValue({ data: { roleId }, error: null })
    await expect(autorizarAdministracion()).rejects.toMatchObject({ estado: 403 })
    await expect(listarImagenesAdministrativas(0)).rejects.toMatchObject({ estado: 403 })
    await expect(obtenerImagenPrivada(id)).rejects.toMatchObject({ estado: 403 })
    for (const operacion of ["aprobar", "rechazar", "recuperar", "publicar", "limpiar", "avisar", "conciliar"] as const) await expect(ejecutarRevision(id, operacion)).rejects.toMatchObject({ estado: 403 })
    expect(dobles.servicio).not.toHaveBeenCalled(); expect(dobles.publicar).not.toHaveBeenCalled(); expect(dobles.limpiar).not.toHaveBeenCalled()
  })
  it("sin sesión devuelve 401 sin consultar rol ni servicio", async () => {
    dobles.sesion.mockResolvedValue({ auth: { getUser: async () => ({ data: { user: null } }) } })
    await expect(obtenerImagenPrivada(id)).rejects.toMatchObject({ estado: 401 })
    expect(dobles.rol).not.toHaveBeenCalled(); expect(dobles.servicio).not.toHaveBeenCalled()
  })
  it("sesión anónima y error DB de rol fallan cerrados", async () => {
    dobles.sesion.mockResolvedValueOnce({ auth: { getUser: async () => ({ data: { user: { id: "invitado", is_anonymous: true } } }) } })
    await expect(autorizarAdministracion()).rejects.toMatchObject({ estado: 403 })
    dobles.rol.mockResolvedValueOnce({ data: { roleId: 1 }, error: {} })
    await expect(autorizarAdministracion()).rejects.toMatchObject({ estado: 403 })
    expect(dobles.servicio).not.toHaveBeenCalled()
  })
  it("UUID inválido no toca DB ni helpers", async () => {
    await expect(ejecutarRevision("invalido", "aprobar")).rejects.toMatchObject({ estado: 400 })
    await expect(obtenerImagenPrivada("invalido")).rejects.toMatchObject({ estado: 400 })
    expect(dobles.servicio).not.toHaveBeenCalled(); expect(dobles.rol).not.toHaveBeenCalled()
  })
  it("lista acotada ordenada no serializa secretos ni rutas", async () => {
    const lista = await listarImagenesAdministrativas(2)
    expect(consulta.range).toHaveBeenCalledWith(40, 59)
    expect(consulta.order.mock.calls).toContainEqual(["creado_at", { ascending: true }])
    expect(consulta.order.mock.calls).toContainEqual(["id", { ascending: true }])
    expect(consulta.select.mock.calls[0][0]).not.toContain("*")
    expect(JSON.stringify(lista)).not.toMatch(/privado|token|sha256/)
  })
  it("prioriza cola activa y permite inspeccionar terminales para retención", async () => {
    await listarImagenesAdministrativas(0)
    expect(consulta.in).toHaveBeenCalledWith("estado_publicacion", ["pendiente", "reclamada", "publicando"])
    await listarImagenesAdministrativas(0, true)
    expect(consulta.in).toHaveBeenCalledWith("estado_publicacion", ["publicada", "rechazada"])
  })
  it("muestra motivos reales sin filtrar códigos desconocidos", async () => {
    fila.motivos = ["contenido_ambiguo_armas_violencia_o_lesiones", "proveedor_no_disponible", "secreto-falso"]
    const lista = await listarImagenesAdministrativas(0)
    expect(lista[0].motivos.join(" ")).toContain("armas")
    expect(lista[0].motivos.join(" ")).toContain("Proveedor no disponible")
    expect(JSON.stringify(lista)).not.toContain("secreto-falso")
  })
  it("preview verifica hash y máximo antes de devolver bytes", async () => {
    expect(await obtenerImagenPrivada(id)).toEqual(new Uint8Array(bytes))
    fila.hash_sha256 = "otro"
    await expect(obtenerImagenPrivada(id)).rejects.toMatchObject({ estado: 404 })
    descarga.mockResolvedValue({ data: new Blob([new Uint8Array(102401)]) })
    await expect(obtenerImagenPrivada(id)).rejects.toMatchObject({ estado: 404 })
  })
  it.each(["aprobar", "rechazar"] as const)("%s registra identidad verificada y delega fecha al RPC", async (operacion) => {
    await ejecutarRevision(id, operacion)
    expect(rpc).toHaveBeenCalledWith("decidir_imagen_moderacion", expect.objectContaining({ p_administrador: "admin-verificado", p_decision: operacion === "aprobar" ? "APPROVED" : "REJECTED" }))
    expect(operacion === "aprobar" ? dobles.publicar : dobles.limpiar).toHaveBeenCalled()
  })
  it("rechazar un reemplazo conserva el reporte y no genera aviso de retiro", async () => {
    fila.reemplaza_foto_id = 22
    expect(await ejecutarRevision(id, "rechazar")).toMatchObject({ exito: true, mensaje: expect.stringContaining("reporte y sus fotos actuales se conservan") })
    expect(dobles.avisar).not.toHaveBeenCalled()
    expect(dobles.limpiar).toHaveBeenCalledWith(dobles.servicio.mock.results[0].value, id)
  })
  it("rejects report-retirement actions for a rejected replacement", async () => {
    fila.reemplaza_foto_id = 22
    fila.decision = "REJECTED"; fila.estado_publicacion = "rechazada"
    expect(await ejecutarRevision(id, "avisar")).toMatchObject({ exito: false })
    expect(dobles.avisar).not.toHaveBeenCalled()
  })
  it("rechazo comunica retiro aunque el aviso quede pendiente", async () => {
    expect(await ejecutarRevision(id, "rechazar")).toMatchObject({ exito: true, reporteId: 7, mensaje: expect.stringContaining("Reporte retirado") })
    expect(dobles.avisar).toHaveBeenCalledWith(dobles.servicio.mock.results[0].value, 7)
  })
  it("reintento de aviso sólo para rechazo terminal, sin proveedor de clasificación", async () => {
    fila.decision = "REJECTED"; fila.estado_publicacion = "rechazada"
    expect(await ejecutarRevision(id, "avisar")).toMatchObject({ exito: true })
    expect(dobles.avisar).toHaveBeenCalledTimes(1)
    expect(dobles.publicar).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })
  it("conciliación usa actor verificado y token releído, nunca envía", async () => {
    fila.decision = "REJECTED"; fila.estado_publicacion = "rechazada"
    expect(await ejecutarRevision(id, "conciliar")).toMatchObject({ exito: true, mensaje: expect.stringContaining("no se envió") })
    expect(rpc).toHaveBeenCalledExactlyOnceWith("conciliar_aviso_retiro", { p_reporte_id: 7, p_token: "token-original", p_administrador: "admin-verificado" })
    expect(dobles.avisar).not.toHaveBeenCalled()
    expect(dobles.publicar).not.toHaveBeenCalled()
  })
  it("conciliación CAS perdida no afirma éxito ni entrega", async () => {
    fila.decision = "REJECTED"; fila.estado_publicacion = "rechazada"
    rpc.mockResolvedValue({ data: false, error: null })
    expect(await ejecutarRevision(id, "conciliar")).toMatchObject({ exito: false })
    expect(dobles.avisar).not.toHaveBeenCalled()
  })
  it("proyección del aviso no revela destinatario ni token", async () => {
    Object.assign(fila, { decision: "REJECTED", estado_publicacion: "rechazada", destinatario: "privado@ejemplo.invalid", estado: "reclamado", intentos: 3, primer_intento_at: new Date(Date.now() - 86400000).toISOString() })
    const lista = await listarImagenesAdministrativas(0, true)
    expect(lista[0].aviso).toEqual({ estado: "reclamado", intentos: 3, conciliacion: true })
    expect(JSON.stringify(lista)).not.toMatch(/privado@|token-original/)
  })
  it("terminal histórica sin outbox sigue visible sin inferir destinatario", async () => {
    fila.decision = "REJECTED"; fila.estado_publicacion = "rechazada"
    consulta.maybeSingle.mockResolvedValue({ data: null, error: null })
    const lista = await listarImagenesAdministrativas(0, true)
    expect(lista[0].aviso).toBeUndefined()
    expect(dobles.avisar).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })
  it("CAS perdedor no publica ni limpia", async () => {
    rpc.mockResolvedValue({ data: false, error: null })
    expect(await ejecutarRevision(id, "aprobar")).toMatchObject({ exito: false, mensaje: expect.stringContaining("Otro") })
    expect(dobles.publicar).not.toHaveBeenCalled(); expect(dobles.limpiar).not.toHaveBeenCalled()
  })
  it("recuperación explícita usa token original sin actor RPC y registra motivo", async () => {
    fila.estado_publicacion = "reclamada"
    await ejecutarRevision(id, "recuperar")
    expect(rpc).toHaveBeenCalledWith("decidir_imagen_moderacion", { p_id: id, p_token: "token-original", p_decision: "REVIEW", p_administrador: null, p_motivos: ["reclamo_recuperado_por_administracion"] })
    expect(dobles.publicar).not.toHaveBeenCalled(); expect(dobles.limpiar).not.toHaveBeenCalled()
  })
  it("reclamo recuperado exige nueva decisión humana y nuevo actor verificado", async () => {
    fila.estado_publicacion = "reclamada"
    rpc.mockImplementation(async (_nombre, parametros) => {
      if (parametros.p_token === "token-original" && parametros.p_decision === "REVIEW") {
        fila.token = null; fila.estado_publicacion = "pendiente"
      }
      return { data: true, error: null }
    })
    await ejecutarRevision(id, "recuperar")
    await ejecutarRevision(id, "aprobar")
    expect(rpc.mock.calls[1][1]).toMatchObject({ p_token: null, p_administrador: "admin-verificado", p_decision: "APPROVED" })
    expect(fila.token).toBeNull()
    expect(dobles.publicar).toHaveBeenCalledTimes(1)
  })
  it("reintenta publicación únicamente con helper sin RPC de clasificación/cuota", async () => {
    fila.decision = "APPROVED"; fila.estado_publicacion = "publicando"
    await ejecutarRevision(id, "publicar")
    expect(dobles.publicar).toHaveBeenCalled(); expect(rpc).not.toHaveBeenCalled()
  })
  it("carga faltante bloquea aprobación pero permite rechazo", async () => {
    fila.motivos = ["carga_privada_pendiente"]
    descarga.mockResolvedValue({ data: null, error: {} })
    await expect(ejecutarRevision(id, "aprobar")).rejects.toMatchObject({ estado: 404 })
    expect(rpc).not.toHaveBeenCalled()
    await ejecutarRevision(id, "rechazar")
    expect(dobles.limpiar).toHaveBeenCalled()
  })
  it("fallo de limpieza queda visible sin afirmar borrado exitoso", async () => {
    fila.estado_publicacion = "rechazada"; fila.decision = "REJECTED"
    dobles.limpiar.mockResolvedValue(["limpieza_privada_pendiente"])
    expect(await ejecutarRevision(id, "limpiar")).toMatchObject({ exito: true, mensaje: expect.stringContaining("limpieza pendiente") })
  })
})
