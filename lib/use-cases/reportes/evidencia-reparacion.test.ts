/** Contrato de los casos de uso de evidencia y verificación de reparaciones (S1–S8, S12, S15). */
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"

const mocks = vi.hoisted(() => ({
  getUserRoleContext: vi.fn(),
  moderarEvidencia: vi.fn(),
  validarImagen: vi.fn(),
  notificarEstado: vi.fn(),
}))

vi.mock("server-only", () => ({}))
vi.mock("@/lib/authz/roles", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/authz/roles")>()),
  getUserRoleContext: mocks.getUserRoleContext,
}))
vi.mock("@/lib/moderation/imagenes-reporte.server", () => ({
  moderarYGuardarImagenEvidenciaReparacion: mocks.moderarEvidencia,
  moderarYGuardarImagenReporte: vi.fn(),
  eliminarFotoReportePublicada: vi.fn(),
  publicarImagenModerada: vi.fn(),
  limpiarImagenModerada: vi.fn(),
}))
vi.mock("@/lib/media/report-image-validation.server", () => ({
  validateUploadedReportImage: mocks.validarImagen,
}))
vi.mock("@/lib/notifications/report-notifications", () => ({
  sendStatusNotificationEmail: mocks.notificarEstado,
  sendCommentNotificationEmail: vi.fn(),
  sendAdminReviewNotificationEmail: vi.fn(),
}))

import {
  UMBRAL_CONFIRMACIONES_REPARACION,
  esRolHabilitadoParaReparacion,
  informarReparacionWorkflow,
  puedeInformarReparacion,
  resolverEvidenciaReparacionWorkflow,
  resolverImpugnacionReparacionWorkflow,
  verificarReparacionWorkflow,
} from "./evidencia-reparacion"

const MENSAJE_CUENTA = "Necesitás una cuenta registrada con el correo confirmado para informar y verificar reparaciones."

type RespuestaRpc = { data?: unknown; error?: { code?: string; message?: string } | null }

/** Cliente sintético: registra cada RPC y responde lecturas de evidencia y reporte. */
function clienteFalso(entrada: {
  rpc?: RespuestaRpc
  evidencia?: { reporte_id?: number } | null
  reporte?: Record<string, unknown> | null
} = {}) {
  const llamadas: Array<{ nombre: string; argumentos: Record<string, unknown> }> = []
  const rpc = vi.fn(async (nombre: string, argumentos: Record<string, unknown>) => {
    llamadas.push({ nombre, argumentos })
    return { data: entrada.rpc?.data ?? null, error: entrada.rpc?.error ?? null }
  })
  const from = vi.fn((tabla: string) => {
    const consulta = {
      select: () => consulta,
      eq: () => consulta,
      single: async () => ({ data: entrada.reporte ?? null, error: null }),
      maybeSingle: async () => ({
        data: tabla === "evidencias_reparacion" ? entrada.evidencia ?? null
          : tabla === "verificaciones_reparacion" ? { evidencia_id: "evidencia-1" }
            : entrada.reporte ?? null,
        error: null,
      }),
    }
    return consulta
  })
  return { supabase: { rpc, from } as unknown as SupabaseClient, rpc, from, llamadas }
}

/** Foto mínima con tipo y tamaño aceptados; su validez real la decide el módulo simulado. */
function foto() {
  return new File([new Uint8Array([1, 2, 3, 4])], "reparado.png", { type: "image/png" })
}

const REPORTE_CON_DUEÑO = {
  id: 9,
  usuario_id: "autor",
  titulo: "Bache en Av. Uruguay y Bolívar",
  estado_id: 2,
  deleted_at: null,
  ownerProfile: { username: "Autor", email: "autor@example.invalid" },
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getUserRoleContext.mockResolvedValue({ data: { roleId: 2, roleName: "Ciudadano" }, error: null })
  mocks.validarImagen.mockResolvedValue({ type: "image/png", width: 24, height: 24 })
  mocks.moderarEvidencia.mockResolvedValue({
    evidenciaId: "evidencia-1",
    estado: "APPROVED",
    publicada: true,
    motivos: [],
    advertencias: [],
  })
  mocks.notificarEstado.mockResolvedValue(undefined)
})

describe("participación en reparaciones (S15, L21)", () => {
  it.each([
    [2, true], [3, true], [null, true], [1, true],
    [4, false], [5, false],
  ])("habilita el rol %s = %s", (rol, habilitado) => {
    expect(esRolHabilitadoParaReparacion(rol)).toBe(habilitado)
  })

  it.each([
    [{ is_anonymous: false, email_confirmed_at: "2026-01-01T00:00:00Z" }, 2, true],
    [{ is_anonymous: false, email_confirmed_at: "2026-01-01T00:00:00Z" }, 1, true],
    [{ is_anonymous: false, email_confirmed_at: null }, 1, false],
    [{ is_anonymous: false, email_confirmed_at: null }, 2, false],
    [{ is_anonymous: true, email_confirmed_at: "2026-01-01T00:00:00Z" }, 2, false],
    [{ is_anonymous: false, email_confirmed_at: "2026-01-01T00:00:00Z" }, 4, false],
    [null, 2, false],
  ])("exige cuenta permanente con correo confirmado", (usuario, rol, habilitado) => {
    expect(puedeInformarReparacion(usuario as never, rol)).toBe(habilitado)
  })
})

describe("informar una reparación", () => {
  it("registra la evidencia y publica la foto aprobada", async () => {
    const cliente = clienteFalso()

    const resultado = await informarReparacionWorkflow(cliente.supabase, 9, "autor", {
      frase: "taparon_el_bache_con_asfalto_nuevo",
      image: foto(),
    })

    expect(resultado).toEqual({
      success: true,
      data: { evidenciaId: "evidencia-1", estado: "en_verificacion", publicada: true, motivos: [], advertencias: [] },
    })
    expect(mocks.moderarEvidencia).toHaveBeenCalledWith(cliente.supabase, {
      reporteId: 9,
      autorId: "autor",
      comentario: "Taparon el bache con asfalto nuevo",
      image: expect.any(File),
    })
  })

  it("resuelve en el servidor la etiqueta de la frase elegida, no el texto del cliente (S16)", async () => {
    const cliente = clienteFalso()

    await informarReparacionWorkflow(cliente.supabase, 9, "autor", {
      frase: "  retiraron_el_arbol_o_las_ramas_caidas  ",
      image: foto(),
    })

    expect(mocks.moderarEvidencia).toHaveBeenCalledWith(cliente.supabase, expect.objectContaining({
      comentario: "Retiraron el árbol o las ramas caídas",
    }))
  })

  it("deja la reparación informada sin publicar cuando la foto queda en revisión", async () => {
    mocks.moderarEvidencia.mockResolvedValue({
      evidenciaId: "evidencia-1",
      estado: "REVIEW",
      publicada: false,
      motivos: ["La fotografía quedó privada y pendiente de revisión."],
      advertencias: [],
    })
    const cliente = clienteFalso()

    const resultado = await informarReparacionWorkflow(cliente.supabase, 9, "autor", { frase: "repararon_el_problema_por_completo", image: foto() })

    expect(resultado).toEqual({
      success: true,
      data: {
        evidenciaId: "evidencia-1",
        estado: "informada",
        publicada: false,
        motivos: ["La fotografía quedó privada y pendiente de revisión."],
        advertencias: [],
      },
    })
  })

  it("no declara enviada la reparación cuando la foto no llegó a la cola privada", async () => {
    mocks.moderarEvidencia.mockResolvedValue({
      evidenciaId: "evidencia-1",
      estado: "ERROR_PRIVADO",
      publicada: false,
      motivos: ["No pudimos guardar la fotografía."],
      advertencias: ["carga_privada_pendiente"],
    })
    const cliente = clienteFalso()

    expect(await informarReparacionWorkflow(cliente.supabase, 9, "autor", { frase: "repararon_el_problema_por_completo", image: foto() })).toEqual({
      success: false,
      error: "No pudimos guardar la fotografía de la reparación. Reintentá con la misma foto: retomamos la misma evidencia.",
    })
  })

  it.each([
    ["", "vacío"],
    ["   ", "solo espacios"],
    ["taparon_el_bache", "clave inexistente"],
    ["Taparon el bache con asfalto nuevo", "etiqueta en vez de clave"],
    ["x".repeat(501), "texto libre largo"],
    ["Bache tapado y señalizado", "texto libre"],
  ])("rechaza %j (%s) sin consultar roles ni moderar (S16)", async (frase) => {
    const cliente = clienteFalso()

    expect(await informarReparacionWorkflow(cliente.supabase, 9, "autor", { frase, image: foto() })).toEqual({
      success: false,
      error: "Elegí qué se arregló de la lista.",
    })
    expect(mocks.getUserRoleContext).not.toHaveBeenCalled()
    expect(mocks.moderarEvidencia).not.toHaveBeenCalled()
  })

  it("rechaza la foto que la moderación descarta sin cambiar el reporte", async () => {
    mocks.moderarEvidencia.mockResolvedValue({
      evidenciaId: "evidencia-1",
      estado: "REJECTED",
      publicada: false,
      motivos: ["La fotografía de la reparación fue rechazada por moderación."],
      advertencias: [],
    })
    const cliente = clienteFalso()

    const resultado = await informarReparacionWorkflow(cliente.supabase, 9, "autor", { frase: "repararon_el_problema_por_completo", image: foto() })

    expect(resultado).toMatchObject({ success: true, data: { estado: "rechazada", publicada: false } })
    expect(cliente.llamadas).toHaveLength(0)
  })

  it.each([4, 5])("rechaza al rol %s antes de moderar la foto", async (rol) => {
    mocks.getUserRoleContext.mockResolvedValue({ data: { roleId: rol }, error: null })
    const cliente = clienteFalso()

    expect(await informarReparacionWorkflow(cliente.supabase, 9, "autor", { frase: "repararon_el_problema_por_completo", image: foto() })).toEqual({
      success: false,
      error: MENSAJE_CUENTA,
    })
    expect(mocks.moderarEvidencia).not.toHaveBeenCalled()
  })

  it("habilita a administración para informar una reparación (L21)", async () => {
    mocks.getUserRoleContext.mockResolvedValue({ data: { roleId: 1, roleName: "Admin" }, error: null })
    const cliente = clienteFalso()

    expect(await informarReparacionWorkflow(cliente.supabase, 9, "admin-1", { frase: "repararon_el_problema_por_completo", image: foto() }))
      .toMatchObject({ success: true, data: { estado: "en_verificacion" } })
    expect(mocks.moderarEvidencia).toHaveBeenCalledWith(cliente.supabase, {
      reporteId: 9,
      autorId: "admin-1",
      comentario: "Repararon el problema por completo",
      image: expect.any(File),
    })
  })

  it("valida el archivo real antes de subirlo", async () => {
    mocks.validarImagen.mockRejectedValue(new Error("La imagen seleccionada no coincide con el formato real del archivo."))
    const cliente = clienteFalso()

    await expect(informarReparacionWorkflow(cliente.supabase, 9, "autor", { frase: "repararon_el_problema_por_completo", image: foto() }))
      .rejects.toThrow("La imagen seleccionada no coincide con el formato real del archivo.")
    expect(mocks.moderarEvidencia).not.toHaveBeenCalled()
  })

  it("rechaza tipos y tamaños de imagen fuera de los aceptados", async () => {
    const cliente = clienteFalso()
    const gif = new File([new Uint8Array([1])], "reparado.gif", { type: "image/gif" })
    const pesada = new File([new Uint8Array(102401)], "reparado.png", { type: "image/png" })

    expect(await informarReparacionWorkflow(cliente.supabase, 9, "autor", { frase: "repararon_el_problema_por_completo", image: gif })).toEqual({
      success: false,
      error: "La imagen debe estar en formato JPG, PNG o WebP.",
    })
    expect(await informarReparacionWorkflow(cliente.supabase, 9, "autor", { frase: "repararon_el_problema_por_completo", image: pesada })).toEqual({
      success: false,
      error: "La imagen optimizada no puede superar los 100 KB.",
    })
    expect(mocks.validarImagen).not.toHaveBeenCalled()
    expect(mocks.moderarEvidencia).not.toHaveBeenCalled()
  })

  it.each([
    ["PRE01", "cuenta", MENSAJE_CUENTA],
    ["PRE04", "cupo", "Alcanzaste el límite de 3 evidencias de reparación por día."],
    ["PRE05", "cerrado", "El reporte ya está cerrado o no está disponible para informar una reparación."],
    ["PRE11", "frase", "Elegí qué se arregló de la lista."],
    ["XX000", "inesperado", "No pudimos guardar la fotografía."],
  ])("traduce el rechazo %s de la RPC de evidencia", async (codigo, _caso, error) => {
    mocks.moderarEvidencia.mockResolvedValue({
      evidenciaId: null,
      estado: "ERROR_PRIVADO",
      publicada: false,
      motivos: ["No pudimos guardar la fotografía."],
      advertencias: [],
      codigoRpc: codigo,
      mensajeRpc: "mensaje interno de la base",
    })
    const cliente = clienteFalso()

    expect(await informarReparacionWorkflow(cliente.supabase, 9, "autor", { frase: "repararon_el_problema_por_completo", image: foto() })).toEqual({
      success: false,
      error,
    })
  })

  it("rechaza el reintento que cambia el comentario en vez de publicar el original", async () => {
    mocks.moderarEvidencia.mockResolvedValue({
      evidenciaId: null,
      estado: "ERROR_PRIVADO",
      publicada: false,
      motivos: [],
      advertencias: [],
      comentarioDistinto: true,
    })
    const cliente = clienteFalso()

    expect(await informarReparacionWorkflow(cliente.supabase, 9, "autor", {
      frase: "limpiaron_la_basura_o_el_microbasural",
      image: foto(),
    })).toEqual({
      success: false,
      error: "Esta reparación ya quedó informada con otra frase. Reintentá con la misma foto y la frase original, o esperá la revisión de la evidencia ya enviada.",
    })
  })

  it("distingue la foto repetida de la evidencia ya activa", async () => {
    const cliente = clienteFalso()
    mocks.moderarEvidencia.mockResolvedValueOnce({
      evidenciaId: null,
      estado: "ERROR_PRIVADO",
      publicada: false,
      motivos: [],
      advertencias: [],
      codigoRpc: "PRE03",
      mensajeRpc: "Esa fotografía ya fue registrada en este reporte",
    })
    expect(await informarReparacionWorkflow(cliente.supabase, 9, "autor", { frase: "repararon_el_problema_por_completo", image: foto() })).toEqual({
      success: false,
      error: "Esa fotografía ya fue registrada en este reporte.",
    })

    mocks.moderarEvidencia.mockResolvedValueOnce({
      evidenciaId: null,
      estado: "ERROR_PRIVADO",
      publicada: false,
      motivos: [],
      advertencias: [],
      codigoRpc: "PRE03",
      mensajeRpc: "El reporte ya tiene una evidencia de reparación activa",
    })
    expect(await informarReparacionWorkflow(cliente.supabase, 9, "autor", { frase: "repararon_el_problema_por_completo", image: foto() })).toEqual({
      success: false,
      error: "Este reporte ya tiene una reparación informada en verificación.",
    })
  })
})

describe("confirmar o impugnar una reparación", () => {
  const confirmacion = {
    tipo: "confirmacion",
    repetida: false,
    evidencia_estado: "en_verificacion",
    reporte_estado_id: 1,
    cerrado: false,
    confirmaciones: 2,
    impugnaciones: 0,
    impugnaciones_pendientes: 0,
  }

  it("registra la confirmación y devuelve el avance verificado", async () => {
    const cliente = clienteFalso({ rpc: { data: confirmacion, error: null } })

    const resultado = await verificarReparacionWorkflow(cliente.supabase, "evidencia-1", "vecino", "confirmacion")

    expect(resultado).toEqual({
      success: true,
      data: {
        tipo: "confirmacion",
        repetida: false,
        evidenciaEstado: "en_verificacion",
        reporteEstadoId: 1,
        cerrado: false,
        confirmaciones: 2,
        impugnaciones: 0,
        impugnacionesPendientes: 0,
        umbral: UMBRAL_CONFIRMACIONES_REPARACION,
      },
    })
    expect(cliente.llamadas).toEqual([{
      nombre: "registrar_verificacion_reparacion",
      argumentos: { p_evidencia_id: "evidencia-1", p_usuario_id: "vecino", p_tipo: "confirmacion", p_motivo: null },
    }])
    expect(mocks.notificarEstado).not.toHaveBeenCalled()
  })

  it("registra la impugnación con la etiqueta de la frase elegida (S17)", async () => {
    const cliente = clienteFalso({
      rpc: { data: { ...confirmacion, tipo: "impugnacion", impugnaciones: 1, impugnaciones_pendientes: 1 }, error: null },
    })

    const resultado = await verificarReparacionWorkflow(cliente.supabase, "evidencia-1", "vecino", "impugnacion", "  el_problema_sigue_igual  ")

    expect(resultado).toMatchObject({ success: true, data: { tipo: "impugnacion", impugnacionesPendientes: 1 } })
    expect(cliente.llamadas[0].argumentos).toEqual({
      p_evidencia_id: "evidencia-1",
      p_usuario_id: "vecino",
      p_tipo: "impugnacion",
      p_motivo: "El problema sigue igual",
    })
  })

  it.each([
    ["", "vacío"],
    ["   ", "solo espacios"],
    ["sigue_roto", "clave inexistente"],
    ["El problema sigue igual", "etiqueta en vez de clave"],
    ["x".repeat(501), "texto libre largo"],
  ])("exige una frase del catálogo para impugnar: %j (%s)", async (motivo) => {
    const cliente = clienteFalso()

    expect(await verificarReparacionWorkflow(cliente.supabase, "evidencia-1", "vecino", "impugnacion", motivo)).toEqual({
      success: false,
      error: "Elegí por qué no está reparado de la lista.",
    })
    expect(cliente.llamadas).toHaveLength(0)
    expect(mocks.getUserRoleContext).not.toHaveBeenCalled()
  })

  it("rechaza un tipo de verificación desconocido", async () => {
    const cliente = clienteFalso()
    expect(await verificarReparacionWorkflow(cliente.supabase, "evidencia-1", "vecino", "aprobar" as never)).toEqual({
      success: false,
      error: "Elegí confirmar o impugnar la reparación.",
    })
    expect(cliente.llamadas).toHaveLength(0)
  })

  it.each([4, 5])("no permite verificar con el rol %s", async (rol) => {
    mocks.getUserRoleContext.mockResolvedValue({ data: { roleId: rol }, error: null })
    const cliente = clienteFalso({ rpc: { data: confirmacion, error: null } })

    expect(await verificarReparacionWorkflow(cliente.supabase, "evidencia-1", "vecino", "confirmacion")).toEqual({
      success: false,
      error: MENSAJE_CUENTA,
    })
    expect(cliente.llamadas).toHaveLength(0)
  })

  it("habilita a administración para confirmar e impugnar (L21)", async () => {
    mocks.getUserRoleContext.mockResolvedValue({ data: { roleId: 1, roleName: "Admin" }, error: null })
    const cliente = clienteFalso({ rpc: { data: confirmacion, error: null } })

    await expect(verificarReparacionWorkflow(cliente.supabase, "evidencia-1", "admin-1", "confirmacion"))
      .resolves.toMatchObject({ success: true, data: { tipo: "confirmacion" } })
    expect(cliente.llamadas[0].argumentos).toEqual({
      p_evidencia_id: "evidencia-1",
      p_usuario_id: "admin-1",
      p_tipo: "confirmacion",
      p_motivo: null,
    })

    const impugnado = clienteFalso({
      rpc: { data: { ...confirmacion, tipo: "impugnacion", impugnaciones: 1, impugnaciones_pendientes: 1 }, error: null },
    })
    await expect(verificarReparacionWorkflow(impugnado.supabase, "evidencia-1", "admin-1", "impugnacion", "  lo_arreglaron_solo_en_parte  "))
      .resolves.toMatchObject({ success: true, data: { tipo: "impugnacion" } })
    expect(impugnado.llamadas[0].argumentos).toMatchObject({ p_usuario_id: "admin-1", p_motivo: "Lo arreglaron solo en parte" })
  })

  it.each([
    ["PRE01", MENSAJE_CUENTA],
    ["PRE02", "No podés validar tu propia evidencia."],
    ["PRE05", "La reparación ya no está disponible para verificar."],
    ["PRE06", "Ya registraste una verificación distinta para esta evidencia."],
    ["PRE09", "La evidencia ya fue resuelta."],
  ])("explica el rechazo %s de la RPC de verificación", async (codigo, error) => {
    const cliente = clienteFalso({ rpc: { data: null, error: { code: codigo, message: "detalle interno" } } })

    expect(await verificarReparacionWorkflow(cliente.supabase, "evidencia-1", "vecino", "confirmacion")).toEqual({
      success: false,
      error,
    })
    expect(mocks.notificarEstado).not.toHaveBeenCalled()
  })

  it("rechaza una respuesta de RPC incompleta sin inventar el resultado", async () => {
    const cliente = clienteFalso({ rpc: { data: { tipo: "confirmacion" }, error: null } })

    expect(await verificarReparacionWorkflow(cliente.supabase, "evidencia-1", "vecino", "confirmacion")).toEqual({
      success: false,
      error: "No pudimos registrar tu verificación. Recargá e intentá nuevamente.",
    })
  })

  it("repetir la misma verificación devuelve el estado actual sin volver a cerrar", async () => {
    const cliente = clienteFalso({ rpc: { data: { ...confirmacion, repetida: true, confirmaciones: 3 }, error: null } })

    const resultado = await verificarReparacionWorkflow(cliente.supabase, "evidencia-1", "vecino", "confirmacion")

    expect(resultado).toMatchObject({ success: true, data: { repetida: true, confirmaciones: 3, cerrado: false } })
    expect(mocks.notificarEstado).not.toHaveBeenCalled()
  })

  it("avisa al autor cuando las tres confirmaciones cierran el reporte", async () => {
    const cliente = clienteFalso({
      rpc: { data: { ...confirmacion, confirmaciones: 3, reporte_estado_id: 2, cerrado: true }, error: null },
      evidencia: { reporte_id: 9 },
      reporte: REPORTE_CON_DUEÑO,
    })

    const resultado = await verificarReparacionWorkflow(cliente.supabase, "evidencia-1", "vecino", "confirmacion")

    expect(resultado).toMatchObject({ success: true, data: { cerrado: true, reporteEstadoId: 2 } })
    expect(mocks.notificarEstado).toHaveBeenCalledOnce()
    expect(mocks.notificarEstado).toHaveBeenCalledWith(expect.objectContaining({
      ownerEmail: "autor@example.invalid",
      reporteId: 9,
      reporteTitulo: "Bache en Av. Uruguay y Bolívar",
      nuevoEstado: "Reparado",
    }))
  })

  it("no deshace la verificación si falla el aviso por correo", async () => {
    mocks.notificarEstado.mockRejectedValue(new Error("correo no disponible"))
    const cliente = clienteFalso({
      rpc: { data: { ...confirmacion, confirmaciones: 3, reporte_estado_id: 2, cerrado: true }, error: null },
      evidencia: { reporte_id: 9 },
      reporte: REPORTE_CON_DUEÑO,
    })

    await expect(verificarReparacionWorkflow(cliente.supabase, "evidencia-1", "vecino", "confirmacion"))
      .resolves.toMatchObject({ success: true, data: { cerrado: true } })
  })
})

describe("resolución administrativa de la evidencia (S8)", () => {
  it.each([2, 3, 5, null])("rechaza al rol %s antes de llamar a la RPC", async (rol) => {
    mocks.getUserRoleContext.mockResolvedValue({ data: { roleId: rol }, error: null })
    const cliente = clienteFalso({ rpc: { data: null, error: null } })

    expect(await resolverEvidenciaReparacionWorkflow(cliente.supabase, "evidencia-1", "admin", "aprobar")).toEqual({
      success: false,
      error: "No tenés permisos de administrador para esta acción.",
    })
    expect(cliente.llamadas).toHaveLength(0)
  })

  it("aprueba la evidencia y deja el reporte reparado", async () => {
    mocks.getUserRoleContext.mockResolvedValue({ data: { roleId: 1 }, error: null })
    const cliente = clienteFalso({
      rpc: {
        data: {
          evidencia_id: "evidencia-1", accion: "aprobar", repetida: false, evidencia_estado: "validada",
          reporte_estado_id: 2, cerrado: true, revertido: false,
          confirmaciones: 1, impugnaciones: 0, impugnaciones_pendientes: 0,
        },
        error: null,
      },
      evidencia: { reporte_id: 9 },
      reporte: REPORTE_CON_DUEÑO,
    })

    const resultado = await resolverEvidenciaReparacionWorkflow(cliente.supabase, "evidencia-1", "admin", "aprobar", "  Foto clara  ")

    expect(resultado).toEqual({
      success: true,
      data: {
        accion: "aprobar",
        repetida: false,
        evidenciaEstado: "validada",
        reporteEstadoId: 2,
        cerrado: true,
        revertido: false,
        confirmaciones: 1,
        impugnaciones: 0,
        impugnacionesPendientes: 0,
      },
    })
    expect(cliente.llamadas[0]).toEqual({
      nombre: "resolver_evidencia_reparacion_admin",
      argumentos: { p_evidencia_id: "evidencia-1", p_administrador_id: "admin", p_accion: "aprobar", p_motivo: "Foto clara" },
    })
    expect(mocks.notificarEstado).toHaveBeenCalledOnce()
  })

  it("rechazar invalida la evidencia sin cerrar el reporte ni avisar al autor", async () => {
    mocks.getUserRoleContext.mockResolvedValue({ data: { roleId: 1 }, error: null })
    const cliente = clienteFalso({
      rpc: {
        data: {
          evidencia_id: "evidencia-1", accion: "rechazar", repetida: false, evidencia_estado: "rechazada",
          reporte_estado_id: 1, cerrado: false, revertido: false,
          confirmaciones: 0, impugnaciones: 1, impugnaciones_pendientes: 0,
        },
        error: null,
      },
    })

    expect(await resolverEvidenciaReparacionWorkflow(cliente.supabase, "evidencia-1", "admin", "rechazar")).toMatchObject({
      success: true,
      data: { accion: "rechazar", evidenciaEstado: "rechazada", cerrado: false },
    })
    expect(mocks.notificarEstado).not.toHaveBeenCalled()
  })

  it("revierte una evidencia validada y devuelve el reporte a pendiente", async () => {
    mocks.getUserRoleContext.mockResolvedValue({ data: { roleId: 1 }, error: null })
    const cliente = clienteFalso({
      rpc: {
        data: {
          evidencia_id: "evidencia-1", accion: "revertir", repetida: false, evidencia_estado: "revertida",
          reporte_estado_id: 1, cerrado: false, revertido: true,
          confirmaciones: 3, impugnaciones: 0, impugnaciones_pendientes: 0,
        },
        error: null,
      },
    })

    expect(await resolverEvidenciaReparacionWorkflow(cliente.supabase, "evidencia-1", "admin", "revertir", "Error de moderación")).toMatchObject({
      success: true,
      data: { accion: "revertir", evidenciaEstado: "revertida", revertido: true, reporteEstadoId: 1 },
    })
    expect(cliente.llamadas[0].argumentos).toEqual({
      p_evidencia_id: "evidencia-1", p_administrador_id: "admin", p_accion: "revertir", p_motivo: "Error de moderación",
    })
  })

  it.each([
    ["PRE12", "La evidencia todavía no tiene la foto publicada: no se puede aprobar la reparación."],
    ["PRE09", "La evidencia ya cambió de estado. Recargá la revisión e intentá nuevamente."],
    ["PRE08", "No tenés permisos de administrador para esta acción."],
    ["PRE05", "La evidencia o el reporte ya no están disponibles."],
  ])("explica el rechazo %s de la resolución administrativa", async (codigo, error) => {
    mocks.getUserRoleContext.mockResolvedValue({ data: { roleId: 1 }, error: null })
    const cliente = clienteFalso({ rpc: { data: null, error: { code: codigo, message: "detalle interno" } } })

    expect(await resolverEvidenciaReparacionWorkflow(cliente.supabase, "evidencia-1", "admin", "aprobar")).toEqual({
      success: false,
      error,
    })
  })

  it("rechaza una acción administrativa desconocida", async () => {
    const cliente = clienteFalso()
    expect(await resolverEvidenciaReparacionWorkflow(cliente.supabase, "evidencia-1", "admin", "publicar" as never)).toEqual({
      success: false,
      error: "Acción administrativa inválida.",
    })
    expect(cliente.llamadas).toHaveLength(0)
  })
})

describe("resolución administrativa de impugnaciones (S5, S8)", () => {
  const resolucion = {
    verificacion_id: "impugnacion-1",
    decision: "descartada",
    repetida: false,
    evidencia_estado: "en_verificacion",
    reporte_estado_id: 1,
    cerrado: false,
    confirmaciones: 3,
    impugnaciones: 1,
    impugnaciones_pendientes: 0,
  }

  it.each([2, 3, 4, 5, null])("rechaza al rol %s", async (rol) => {
    mocks.getUserRoleContext.mockResolvedValue({ data: { roleId: rol }, error: null })
    const cliente = clienteFalso({ rpc: { data: resolucion, error: null } })

    expect(await resolverImpugnacionReparacionWorkflow(cliente.supabase, "impugnacion-1", "admin", "descartada")).toEqual({
      success: false,
      error: "No tenés permisos de administrador para esta acción.",
    })
    expect(cliente.llamadas).toHaveLength(0)
  })

  it("aceptar la impugnación invalida la evidencia sin cerrar el reporte", async () => {
    mocks.getUserRoleContext.mockResolvedValue({ data: { roleId: 1 }, error: null })
    const cliente = clienteFalso({
      rpc: { data: { ...resolucion, decision: "aceptada", evidencia_estado: "rechazada", confirmaciones: 2 }, error: null },
    })

    expect(await resolverImpugnacionReparacionWorkflow(cliente.supabase, "impugnacion-1", "admin", "aceptada", "  Sigue igual  ")).toMatchObject({
      success: true,
      data: { accion: "aceptada", evidenciaEstado: "rechazada", cerrado: false },
    })
    expect(cliente.llamadas[0]).toEqual({
      nombre: "resolver_impugnacion_reparacion",
      argumentos: { p_verificacion_id: "impugnacion-1", p_administrador_id: "admin", p_decision: "aceptada", p_motivo: "Sigue igual" },
    })
    expect(mocks.notificarEstado).not.toHaveBeenCalled()
  })

  it("descartar la impugnación reevalúa el umbral y puede cerrar el reporte", async () => {
    mocks.getUserRoleContext.mockResolvedValue({ data: { roleId: 1 }, error: null })
    const cliente = clienteFalso({
      rpc: { data: { ...resolucion, evidencia_estado: "validada", reporte_estado_id: 2, cerrado: true }, error: null },
      evidencia: { reporte_id: 9 },
      reporte: REPORTE_CON_DUEÑO,
    })

    const resultado = await resolverImpugnacionReparacionWorkflow(cliente.supabase, "impugnacion-1", "admin", "descartada")

    expect(resultado).toMatchObject({ success: true, data: { accion: "descartada", cerrado: true, evidenciaEstado: "validada" } })
    expect(mocks.notificarEstado).toHaveBeenCalledOnce()
  })

  it("rechaza una decisión desconocida sin llamar a la RPC", async () => {
    const cliente = clienteFalso()
    expect(await resolverImpugnacionReparacionWorkflow(cliente.supabase, "impugnacion-1", "admin", "ignorada" as never)).toEqual({
      success: false,
      error: "Elegí aceptar o descartar la impugnación.",
    })
    expect(cliente.llamadas).toHaveLength(0)
  })

  it.each([
    ["PRE07", "La impugnación ya fue resuelta o no corresponde a esta evidencia."],
    ["PRE11", "No pudimos resolver la impugnación."],
  ])("explica el rechazo %s de la resolución de impugnación", async (codigo, error) => {
    mocks.getUserRoleContext.mockResolvedValue({ data: { roleId: 1 }, error: null })
    const cliente = clienteFalso({ rpc: { data: null, error: { code: codigo, message: "detalle interno" } } })

    expect(await resolverImpugnacionReparacionWorkflow(cliente.supabase, "impugnacion-1", "admin", "descartada")).toEqual({
      success: false,
      error,
    })
  })
})
