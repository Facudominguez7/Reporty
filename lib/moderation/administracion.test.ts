/** Pruebas de autorización DB, lectura privada y decisiones administrativas CAS. */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { createHash } from "node:crypto"
const dobles = vi.hoisted(() => ({ sesion: vi.fn(), servicio: vi.fn(), rol: vi.fn(), publicar: vi.fn(), limpiar: vi.fn() }))
vi.mock("server-only", () => ({}))
vi.mock("@/utils/supabase/server", () => ({ createClient: dobles.sesion }))
vi.mock("@/utils/supabase/admin", () => ({ createAdminClient: dobles.servicio }))
vi.mock("@/lib/authz/roles", async (original) => ({ ...await original<object>(), getUserRoleContext: dobles.rol }))
vi.mock("./imagenes-reporte.server", () => ({ publicarImagenModerada: dobles.publicar, limpiarImagenModerada: dobles.limpiar }))
import { autorizarAdministracion, listarImagenesAdministrativas, obtenerImagenPrivada, ejecutarRevision } from "./administracion.server"
const id = "e1a3f644-9c40-4a40-9000-000000000001"
const bytes = Buffer.from("RIFF0000WEBPimagen")
let fila: Record<string, unknown>
let consulta: Record<string, ReturnType<typeof vi.fn>>
let rpc: ReturnType<typeof vi.fn>
let descarga: ReturnType<typeof vi.fn>
beforeEach(() => {
  vi.clearAllMocks()
  fila = { id, reporte_id: 7, decision: "REVIEW", estado_publicacion: "pendiente", motivos: [], token: "token-original", path_privado: "privado", hash_sha256: createHash("sha256").update(bytes).digest("hex") }
  consulta = Object.fromEntries(["select", "eq", "in", "order", "range"].map((clave) => [clave, vi.fn()]))
  for (const metodo of Object.values(consulta)) metodo.mockReturnValue(consulta)
  consulta.single = vi.fn(async () => ({ data: fila, error: null }))
  consulta.range.mockImplementation(async () => ({ data: [fila], error: null }))
  rpc = vi.fn(async () => ({ data: true, error: null }))
  descarga = vi.fn(async () => ({ data: new Blob([bytes]), error: null }))
  dobles.sesion.mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: "admin-verificado", user_metadata: { rol_id: 1 } } }, error: null }) } })
  dobles.rol.mockResolvedValue({ data: { roleId: 1 }, error: null })
  dobles.servicio.mockReturnValue({ from: vi.fn(() => consulta), rpc, storage: { from: vi.fn(() => ({ download: descarga })) } })
  dobles.publicar.mockResolvedValue({ publicada: true, advertencias: [] })
  dobles.limpiar.mockResolvedValue([])
})
describe("frontera administrativa", () => {
  it.each([2, 3, 4, 5, null])("niega rol DB %s aunque metadata diga Admin antes del servicio", async (roleId) => {
    dobles.rol.mockResolvedValue({ data: { roleId }, error: null })
    await expect(autorizarAdministracion()).rejects.toMatchObject({ estado: 403 })
    await expect(listarImagenesAdministrativas(0)).rejects.toMatchObject({ estado: 403 })
    await expect(obtenerImagenPrivada(id)).rejects.toMatchObject({ estado: 403 })
    for (const operacion of ["aprobar", "rechazar", "recuperar", "publicar", "limpiar"] as const) await expect(ejecutarRevision(id, operacion)).rejects.toMatchObject({ estado: 403 })
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
    expect(consulta.order.mock.calls).toEqual([["creado_at", { ascending: true }], ["id", { ascending: true }]])
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
