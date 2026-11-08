import { GetObjectCommand, HeadBucketCommand, HeadObjectCommand, PutObjectCommand, type S3Client } from "@aws-sdk/client-s3"
import { describe, expect, it, vi } from "vitest"

import type { ClienteR2 } from "./cliente-r2"
import type { ConfiguracionArchivoAuditoria } from "./configuracion"
import type { EventoAuditoria } from "./serializacion"
import {
  type AccionArchivoAuditoria,
  type DatosArchivado,
  type DependenciasArchivado,
  type LoteArchivado,
  ejecutarArchivado,
} from "./servicio-archivado"

const configuracion: ConfiguracionArchivoAuditoria = {
  cuentaR2: "0123456789abcdef0123456789abcdef",
  accessKeyId: "abcdef0123456789abcdef0123456789",
  secretAccessKey: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  bucket: "reporty-audit-archive",
  diasRetencion: 180,
  limitePorLote: 1000,
  purgaHabilitada: false,
  endpoint: "https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com",
}

const eventos: EventoAuditoria[] = [
  {
    id: 41,
    occurred_at: "2025-11-01T10:00:00+00:00",
    actor_id: "00000000-0000-4000-8000-0000000000a1",
    report_id: 9001,
    report_title: "Bache en Ruta 8",
    action: "report_created",
  },
  {
    id: 42,
    occurred_at: "2025-11-01T10:05:00+00:00",
    actor_id: null,
    report_id: null,
    report_title: null,
    action: "vote_not_exists",
  },
]

const lote: LoteArchivado = {
  id: "11111111-1111-4111-8111-111111111111",
  estado: "reclamado",
  primerEventoId: 41,
  ultimoEventoId: 42,
  cantidadRegistros: 2,
  primeraFecha: "2025-11-01T10:00:00+00:00",
  ultimaFecha: "2025-11-01T10:05:00+00:00",
  rutaObjeto: null,
  tamanoComprimido: null,
  hashSha256: null,
  verificadoEn: null,
}

/** R2 falso en memoria: HeadObject, PutObject y GetObject sobre un Map. */
function s3Falso(opciones: { fallarSubida?: boolean; alterarDescarga?: boolean; fallarConectividad?: boolean } = {}) {
  const objetos = new Map<string, Buffer>()
  const send = vi.fn(async (comando: unknown) => {
    if (comando instanceof HeadBucketCommand) {
      if (opciones.fallarConectividad) throw Object.assign(new Error("Denegado"), { name: "AccessDenied" })
      return {}
    }
    if (comando instanceof HeadObjectCommand) {
      const cuerpo = objetos.get((comando.input as { Key: string }).Key)
      if (!cuerpo) throw Object.assign(new Error("NotFound"), { name: "NotFound", $metadata: { httpStatusCode: 404 } })
      return { ContentLength: cuerpo.length }
    }
    if (comando instanceof PutObjectCommand) {
      if (opciones.fallarSubida) throw Object.assign(new Error("ServiceUnavailable"), { name: "ServiceUnavailable" })
      const entrada = comando.input as { Key: string; Body: Buffer }
      objetos.set(entrada.Key, Buffer.from(entrada.Body))
      return { ETag: '"ignorado"' }
    }
    if (comando instanceof GetObjectCommand) {
      const cuerpo = objetos.get((comando.input as { Key: string }).Key)
      if (!cuerpo) throw Object.assign(new Error("NotFound"), { name: "NotFound", $metadata: { httpStatusCode: 404 } })
      const bytes = opciones.alterarDescarga ? Buffer.concat([cuerpo, Buffer.from("manipulado")]) : cuerpo
      return { Body: { transformToByteArray: async () => bytes } }
    }
    return {}
  })
  return { cliente: { send } as unknown as ClienteR2, objetos, send }
}

type EstadoFalso = {
  lote: LoteArchivado | null
  estado: string
  confirmaciones: number
  eliminados: number
  fallos: string[]
  eventos: number[]
  acciones: Array<{ accion: AccionArchivoAuditoria; detalle: string }>
}

function datosFalsos(opciones: {
  reclamar?: LoteArchivado | null
  pendientesPurga?: LoteArchivado[]
  eventosDelLote?: EventoAuditoria[]
  fallarPurgaPrevia?: boolean
} = {}) {
  const estado: EstadoFalso = {
    lote: null,
    estado: "reclamado",
    confirmaciones: 0,
    eliminados: 0,
    fallos: [],
    eventos: (opciones.eventosDelLote ?? eventos).map((evento) => evento.id),
    acciones: [],
  }

  const datos = {
    reclamar: vi.fn(async (_limite: number, _dias: number, _ejecutor: string) => {
      if (opciones.reclamar === null) return null
      estado.lote = opciones.reclamar ?? lote
      estado.estado = "reclamado"
      return estado.lote
    }),
    previsualizar: vi.fn(async () => ({
      cantidad: 2,
      primerEventoId: 41,
      ultimoEventoId: 42,
      primeraFecha: "2025-11-01T10:00:00+00:00",
      ultimaFecha: "2025-11-01T10:05:00+00:00",
    })),
    eventosDelLote: vi.fn(async () => opciones.eventosDelLote ?? eventos),
    confirmarSubida: vi.fn(async () => {
      estado.confirmaciones += 1
      estado.estado = "subido"
      return true
    }),
    verificarLote: vi.fn(async () => {
      estado.estado = "verificado"
      return true
    }),
    eliminarOrigen: vi.fn(async () => {
      if (opciones.fallarPurgaPrevia) throw new Error("R2 no responde")
      estado.estado = "origen_eliminado"
      estado.eliminados += (estado.lote?.cantidadRegistros ?? 0)
      estado.eventos = []
      return estado.lote?.cantidadRegistros ?? 0
    }),
    fallarLote: vi.fn(async (_id: string, error: string) => {
      estado.fallos.push(error)
      estado.estado = "fallido"
      return true
    }),
    lotesPendientesDePurga: vi.fn(async () => opciones.pendientesPurga ?? []),
    registrarEvento: vi.fn(async (accion: AccionArchivoAuditoria, detalle: string) => {
      estado.acciones.push({ accion, detalle })
    }),
  } satisfies DatosArchivado

  return { datos, estado }
}

function dependencias(
  cliente: ClienteR2,
  datos: DatosArchivado,
  extra: Partial<ConfiguracionArchivoAuditoria> = {},
): DependenciasArchivado {
  return { configuracion: { ...configuracion, ...extra }, cliente, datos }
}

const real = { modo: "real" as const, ejecutor: "cron" }

describe("ejecutarArchivado en modo dry-run", () => {
  it("informa qué se archivaría sin reclamar, subir ni eliminar nada", async () => {
    const { cliente, send } = s3Falso()
    const { datos, estado } = datosFalsos()

    const resumen = await ejecutarArchivado({ ...real, modo: "dry-run" }, dependencias(cliente, datos))

    expect(resumen).toMatchObject({
      modo: "dry-run",
      ok: true,
      elegibles: 2,
      lote: null,
      archivo: null,
      verificado: false,
      purgado: 0,
    })
    expect(resumen.previsualizacion).toMatchObject({ cantidad: 2, primerEventoId: 41, ultimoEventoId: 42 })
    expect(datos.reclamar).not.toHaveBeenCalled()
    expect(datos.eliminarOrigen).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
    expect(estado.confirmaciones).toBe(0)
  })

  it("informa cero elegibles como resultado válido, no como error", async () => {
    const { cliente } = s3Falso()
    const { datos } = datosFalsos()
    datos.previsualizar.mockResolvedValueOnce(null as never)

    const resumen = await ejecutarArchivado({ ...real, modo: "dry-run" }, dependencias(cliente, datos))

    expect(resumen).toMatchObject({ ok: true, elegibles: 0, error: null })
    expect(resumen.mensaje).toMatch(/no hay eventos/i)
  })
})

describe("ejecutarArchivado en modo real", () => {
  it("reclama, sube, verifica por descarga y recién entonces purga el origen", async () => {
    const { cliente, objetos } = s3Falso()
    const { datos, estado } = datosFalsos()

    const resumen = await ejecutarArchivado(real, dependencias(cliente, datos, { purgaHabilitada: true }))

    expect(resumen).toMatchObject({ ok: true, verificado: true, purgado: 2, error: null })
    expect(resumen.archivo?.ruta).toMatch(/^audit\/v1\/2025\/11\/audit-41-42-[a-f0-9]{16}\.jsonl\.gz$/)
    expect(resumen.archivo?.hash).toMatch(/^[a-f0-9]{64}$/)
    expect(objetos.get(resumen.archivo!.ruta)).toBeTruthy()
    expect(datos.confirmarSubida).toHaveBeenCalledTimes(1)
    expect(datos.verificarLote).toHaveBeenCalledTimes(1)
    expect(datos.eliminarOrigen).toHaveBeenCalledWith(lote.id, resumen.archivo!.hash)
    expect(estado.estado).toBe("origen_eliminado")
    expect(estado.eventos).toEqual([])
    expect(estado.acciones.map((accion) => accion.accion)).toEqual([
      "audit_archive_uploaded",
      "audit_archive_verified",
      "audit_archive_purged",
    ])
  })

  it("no borra nada si la subida a R2 falla y conserva los eventos", async () => {
    const { cliente, send } = s3Falso({ fallarSubida: true })
    const { datos, estado } = datosFalsos()

    const resumen = await ejecutarArchivado(real, dependencias(cliente, datos, { purgaHabilitada: true }))

    expect(resumen).toMatchObject({ ok: false, verificado: false, purgado: 0 })
    expect(resumen.error).toMatch(/subida/i)
    expect(datos.eliminarOrigen).not.toHaveBeenCalled()
    expect(estado.estado).toBe("fallido")
    expect(estado.eventos).toEqual([41, 42])
    expect(estado.fallos).toHaveLength(1)
    expect(send).toHaveBeenCalled()
    // El error operativo no filtra credenciales.
    expect(estado.fallos[0]).not.toContain(configuracion.secretAccessKey)
  })

  it("no borra nada si la verificación posterior descubre un objeto distinto", async () => {
    const { cliente } = s3Falso({ alterarDescarga: true })
    const { datos, estado } = datosFalsos()

    const resumen = await ejecutarArchivado(real, dependencias(cliente, datos, { purgaHabilitada: true }))

    expect(resumen).toMatchObject({ ok: false, verificado: false, purgado: 0 })
    expect(resumen.error).toMatch(/integridad/i)
    expect(datos.verificarLote).not.toHaveBeenCalled()
    expect(datos.eliminarOrigen).not.toHaveBeenCalled()
    expect(estado.estado).toBe("fallido")
    expect(estado.eventos).toEqual([41, 42])
  })

  it("deja el lote verificado sin purgar cuando la purga está apagada y lo purga en la corrida siguiente", async () => {
    const primera = s3Falso()
    const primeraDatos = datosFalsos()

    const primerResumen = await ejecutarArchivado(real, dependencias(primera.cliente, primeraDatos.datos))

    expect(primerResumen).toMatchObject({ ok: true, verificado: true, purgado: 0 })
    expect(primeraDatos.datos.eliminarOrigen).not.toHaveBeenCalled()
    expect(primeraDatos.estado.estado).toBe("verificado")
    expect(primeraDatos.estado.eventos).toEqual([41, 42])

    // Segunda corrida: el lote ya verificado se purga sin volver a subir nada.
    const verificados: LoteArchivado[] = [{
      ...lote,
      estado: "verificado",
      rutaObjeto: primerResumen.archivo!.ruta,
      tamanoComprimido: primerResumen.archivo!.tamano,
      hashSha256: primerResumen.archivo!.hash,
      verificadoEn: "2025-12-01T00:00:00+00:00",
    }]
    const segunda = s3Falso({ alterarDescarga: true })
    const segundaDatos = datosFalsos({ pendientesPurga: verificados, reclamar: null })
    segundaDatos.estado.lote = verificados[0]

    const segundoResumen = await ejecutarArchivado(real, dependencias(segunda.cliente, segundaDatos.datos, {
      purgaHabilitada: true,
    }))

    expect(segundoResumen.purgasPrevias).toBe(1)
    expect(segundaDatos.datos.eliminarOrigen).toHaveBeenCalledWith(verificados[0].id, verificados[0].hashSha256)
    expect(segundaDatos.estado.eventos).toEqual([])
    // Reclamar devuelve null: ya no quedan eventos elegibles.
    expect(segundoResumen.lote).toBeNull()
  })

  it("reintentar la misma subida reutiliza la ruta y no duplica objetos", async () => {
    const almacen = s3Falso()
    const primero = datosFalsos()
    const primerResumen = await ejecutarArchivado(real, dependencias(almacen.cliente, primero.datos))
    const objetosTrasPrimera = almacen.objetos.size

    const segundo = datosFalsos()
    const segundoResumen = await ejecutarArchivado(real, dependencias(almacen.cliente, segundo.datos))

    expect(segundoResumen.archivo?.ruta).toBe(primerResumen.archivo?.ruta)
    expect(segundoResumen.archivo?.yaExistia).toBe(true)
    expect(almacen.objetos.size).toBe(objetosTrasPrimera)
    expect(segundo.datos.confirmarSubida).toHaveBeenCalledTimes(1)
  })

  it("no archiva nada cuando otra ejecución tiene el bloqueo", async () => {
    const { cliente, send } = s3Falso()
    const { datos } = datosFalsos({ reclamar: null })

    const resumen = await ejecutarArchivado(real, dependencias(cliente, datos, { purgaHabilitada: true }))

    expect(resumen).toMatchObject({ ok: true, lote: null, archivo: null, verificado: false, purgado: 0 })
    expect(resumen.mensaje).toMatch(/otra ejecución|en curso/i)
    expect(send).not.toHaveBeenCalled()
    expect(datos.eliminarOrigen).not.toHaveBeenCalled()
  })

  it("falla el lote sin subir nada cuando los eventos reclamados ya no coinciden", async () => {
    const { cliente, send } = s3Falso()
    const { datos, estado } = datosFalsos({ eventosDelLote: [eventos[0]] })

    const resumen = await ejecutarArchivado(real, dependencias(cliente, datos))

    expect(resumen.ok).toBe(false)
    expect(resumen.error).toMatch(/eventos/i)
    expect(estado.estado).toBe("fallido")
    expect(send).not.toHaveBeenCalled()
  })

  it("un fallo al purgar lotes anteriores no impide archivar el lote nuevo", async () => {
    const { cliente } = s3Falso()
    const verificados: LoteArchivado[] = [{
      ...lote,
      id: "22222222-2222-4222-8222-222222222222",
      estado: "verificado",
      rutaObjeto: "audit/v1/2025/11/audit-41-42-bbbbbbbbbbbbbbbb.jsonl.gz",
      tamanoComprimido: 100,
      hashSha256: "b".repeat(64),
      verificadoEn: "2025-12-01T00:00:00+00:00",
    }]
    const { datos } = datosFalsos({ pendientesPurga: verificados, fallarPurgaPrevia: true })

    const resumen = await ejecutarArchivado(real, dependencias(cliente, datos, { purgaHabilitada: true }))

    expect(resumen.ok).toBe(true)
    expect(resumen.purgasPrevias).toBe(0)
    expect(resumen.errores[0]).toMatch(/R2 no responde/)
    expect(resumen.archivo).not.toBeNull()
  })

  it("pasa la retención y el límite configurados al reclamo de la base", async () => {
    const { cliente } = s3Falso()
    const { datos } = datosFalsos()

    await ejecutarArchivado(
      { ...real, limite: 25, diasRetencion: 200 },
      dependencias(cliente, datos, { limitePorLote: 1000, diasRetencion: 180 }),
    )

    expect(datos.reclamar).toHaveBeenCalledWith(25, 200, "cron")
  })

  it("acota el límite pedido al máximo permitido", async () => {
    const { cliente } = s3Falso()
    const { datos } = datosFalsos()

    await ejecutarArchivado({ ...real, limite: 99999 }, dependencias(cliente, datos))

    expect(datos.reclamar.mock.calls[0][0]).toBe(5000)
  })
})

describe("DependenciasArchivado", () => {
  it("no toca la base ni R2 en el dry-run aunque el cliente falle", async () => {
    const cliente = { send: vi.fn(async () => { throw new Error("sin red") }) } as unknown as Pick<S3Client, "send">
    const { datos } = datosFalsos()

    const resumen = await ejecutarArchivado({ ...real, modo: "dry-run" }, dependencias(cliente as ClienteR2, datos))

    expect(resumen.ok).toBe(true)
    expect(cliente.send).not.toHaveBeenCalled()
  })
})
