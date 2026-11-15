import { beforeEach, describe, expect, it, vi } from "vitest"

const envio = vi.hoisted(() => ({ enviarPush: vi.fn(), leerClavesVapid: vi.fn() }))
vi.mock("@/lib/push/enviar.server", () => envio)

import {
  pushCambioEstadoReporte,
  pushComentarioReporte,
  pushCuadrillaAsignada,
  pushMascotaEncontrada,
  pushModeracionPendiente,
} from "./avisos.server"

/**
 * Cliente de servicio falso: solo responde la consulta de administradores.
 *
 * @param admins - Filas de `profiles` con rol administrador, o un error.
 * @returns El cliente y el doble de `eq` para inspeccionar el filtro.
 */
function clienteFalso(admins: { data: Array<{ id: string }> | null; error: unknown }) {
  const eq = vi.fn(async () => admins)
  return { cliente: { from: vi.fn(() => ({ select: vi.fn(() => ({ eq })) })) } as never, eq }
}

const { cliente: ADMIN } = clienteFalso({ data: [], error: null })

beforeEach(() => {
  envio.enviarPush.mockReset().mockResolvedValue({ enviadas: 1, vencidas: 0, fallidas: 0 })
  envio.leerClavesVapid.mockReset().mockReturnValue({ publicKey: "p", privateKey: "k", subject: "mailto:x" })
})

describe("mensajes push de reportes", () => {
  it("avisa al dueño que su reporte quedó Reparado, con link al reporte", async () => {
    await pushCambioEstadoReporte(ADMIN, { usuarioId: "dueño", reporteId: 7, titulo: "Bache en Uruguay 1200", nuevoEstado: "Reparado" })

    expect(envio.enviarPush).toHaveBeenCalledWith({
      admin: ADMIN,
      usuarioIds: ["dueño"],
      tipo: "estado_reporte",
      mensaje: { titulo: "Tu reporte fue marcado como Reparado", cuerpo: "Bache en Uruguay 1200", url: "/reportes/7", etiqueta: "reporte-7-estado" },
    })
  })

  it("avisa al dueño que su reporte fue rechazado", async () => {
    await pushCambioEstadoReporte(ADMIN, { usuarioId: "dueño", reporteId: 7, titulo: "Bache", nuevoEstado: "Rechazado" })
    expect(envio.enviarPush.mock.calls[0][0].mensaje.titulo).toBe("Tu reporte fue rechazado")
  })

  it("avisa la cuadrilla asignada, con o sin nombre", async () => {
    await pushCuadrillaAsignada(ADMIN, { usuarioId: "dueño", reporteId: 9, titulo: "Luminaria", cuadrillaNombre: "Alumbrado Norte" })
    await pushCuadrillaAsignada(ADMIN, { usuarioId: "dueño", reporteId: 9, titulo: "Luminaria", cuadrillaNombre: null })

    expect(envio.enviarPush.mock.calls.map(([p]) => [p.tipo, p.mensaje.titulo, p.mensaje.cuerpo, p.mensaje.etiqueta])).toEqual([
      ["estado_reporte", "Asignaron una cuadrilla a tu reporte", "Alumbrado Norte va a trabajar en «Luminaria».", "reporte-9-estado"],
      ["estado_reporte", "Asignaron una cuadrilla a tu reporte", "Una cuadrilla va a trabajar en «Luminaria».", "reporte-9-estado"],
    ])
  })

  it("avisa el comentario con el autor y un extracto acotado", async () => {
    await pushComentarioReporte(ADMIN, { usuarioId: "dueño", reporteId: 3, autor: "ana", contenido: "x".repeat(300) })
    const { tipo, mensaje } = envio.enviarPush.mock.calls[0][0]

    expect(tipo).toBe("comentarios")
    expect(mensaje.titulo).toBe("Nuevo comentario en tu reporte")
    expect(mensaje.cuerpo).toBe(`ana: ${"x".repeat(139)}…`)
    expect(mensaje).toMatchObject({ url: "/reportes/3", etiqueta: "reporte-3-comentarios" })
  })

  it("sin autor visible usa «Alguien»", async () => {
    await pushComentarioReporte(ADMIN, { usuarioId: "dueño", reporteId: 3, autor: null, contenido: "Hola" })
    expect(envio.enviarPush.mock.calls[0][0].mensaje.cuerpo).toBe("Alguien: Hola")
  })
})

describe("mensaje push de mascotas", () => {
  it("avisa que la mascota figura como encontrada, con link a la publicación", async () => {
    await pushMascotaEncontrada(ADMIN, { usuarioId: "dueño", mascotaId: 4 })

    expect(envio.enviarPush).toHaveBeenCalledWith({
      admin: ADMIN,
      usuarioIds: ["dueño"],
      tipo: "mascotas",
      mensaje: {
        titulo: "La mascota que publicaste figura como encontrada",
        cuerpo: "Entrá para ver la publicación.",
        url: "/mascotas/4",
        etiqueta: "mascota-4",
      },
    })
  })
})

describe("mensaje push de moderación", () => {
  it("avisa a todos los administradores, con link a la cola correcta", async () => {
    const { cliente, eq } = clienteFalso({ data: [{ id: "a1" }, { id: "a2" }], error: null })

    await pushModeracionPendiente(cliente, { tipo: "reporte", reporteId: 5, titulo: "Árbol caído" })
    await pushModeracionPendiente(cliente, { tipo: "foto", reporteId: 6, titulo: "Reporte N.º 6" })

    expect(eq).toHaveBeenCalledWith("rol_id", 1)
    expect(envio.enviarPush.mock.calls.map(([p]) => [p.usuarioIds, p.tipo, p.mensaje.titulo, p.mensaje.url])).toEqual([
      [["a1", "a2"], "moderacion", "Reporte pendiente de revisión", "/admin/moderacion?tipo=reportes"],
      [["a1", "a2"], "moderacion", "Fotografía pendiente de revisión", "/admin/moderacion"],
    ])
  })

  it("sin título propio no repite el número de reporte", async () => {
    const { cliente } = clienteFalso({ data: [{ id: "a1" }], error: null })

    await pushModeracionPendiente(cliente, { tipo: "foto", reporteId: 6 })
    expect(envio.enviarPush.mock.calls[0][0].mensaje.cuerpo).toBe("Reporte N.º 6")
  })

  it("sin claves VAPID no consulta los administradores", async () => {
    envio.leerClavesVapid.mockReturnValue(null)
    const { cliente, eq } = clienteFalso({ data: [{ id: "a1" }], error: null })

    await pushModeracionPendiente(cliente, { tipo: "foto", reporteId: 6, titulo: "x" })
    expect(eq).not.toHaveBeenCalled()
    expect(envio.enviarPush).not.toHaveBeenCalled()
  })

  it("si falla la consulta de administradores no lanza ni envía", async () => {
    const { cliente } = clienteFalso({ data: null, error: { message: "boom" } })
    vi.spyOn(console, "error").mockImplementation(() => {})

    await expect(pushModeracionPendiente(cliente, { tipo: "foto", reporteId: 6, titulo: "x" })).resolves.toBeUndefined()
    expect(envio.enviarPush).not.toHaveBeenCalled()
  })
})
