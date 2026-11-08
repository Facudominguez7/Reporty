import type { SupabaseClient } from "@supabase/supabase-js"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { ClienteR2 } from "./cliente-r2"
import type { ConfiguracionArchivoAuditoria } from "./configuracion"
import { comprimirGzip, serializarJsonl } from "./serializacion"
import {
  ErrorLoteNoDisponible,
  listarArchivosArchivados,
  prepararDescargaArchivada,
  recuperarEventosArchivados,
} from "./servicio-recuperacion"

const verificarEsAdmin = vi.hoisted(() => vi.fn())
vi.mock("@/database/queries/admin/verificar-admin", () => ({ verificarEsAdmin }))

// El cliente de servicio del panel y el de sesión son el mismo falso en estas pruebas.
const adminActual = vi.hoisted(() => ({ cliente: null as unknown }))
vi.mock("@/utils/supabase/admin", () => ({ createAdminClient: () => adminActual.cliente }))

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

const usuarioId = "00000000-0000-4000-8000-0000000000a1"
const loteId = "11111111-1111-4111-8111-111111111111"
const ruta = "audit/v1/2025/11/audit-41-42-aaaaaaaaaaaaaaaa.jsonl.gz"

const eventos = [
  {
    id: 41,
    occurred_at: "2025-11-01T10:00:00+00:00",
    actor_id: "00000000-0000-4000-8000-0000000000a2",
    report_id: 9001,
    report_title: "Bache en Ruta 8",
    action: "report_created",
  },
]

type Resultado = { data: unknown; error: unknown }

type ConstructorConsulta = {
  select: (columnas?: string) => ConstructorConsulta
  in: (columna: string, valores: string[]) => ConstructorConsulta
  eq: (columna: string, valor: string) => ConstructorConsulta
  gte: (columna: string, valor: string) => ConstructorConsulta
  lte: (columna: string, valor: string) => ConstructorConsulta
  order: (columna: string, opciones?: { ascending?: boolean }) => ConstructorConsulta
  limit: (cantidad: number) => ConstructorConsulta
  maybeSingle: () => Promise<Resultado>
  then: (resolver: (valor: Resultado) => void) => void
}

/** Constructor de consultas encadenable que registra cada llamada. */
function constructorConsulta(lista: Resultado, unica: Resultado, registro: string[]): ConstructorConsulta {
  const constructor = {} as ConstructorConsulta
  const anotar = (texto: string) => {
    registro.push(texto)
    return constructor
  }

  constructor.select = (columnas) => anotar(`select:${columnas ?? ""}`)
  constructor.in = (columna, valores) => anotar(`in:${columna}=${valores.join(",")}`)
  constructor.eq = (columna, valor) => anotar(`eq:${columna}=${valor}`)
  constructor.gte = (columna, valor) => anotar(`gte:${columna}=${valor}`)
  constructor.lte = (columna, valor) => anotar(`lte:${columna}=${valor}`)
  constructor.order = (columna, opciones) => anotar(`order:${columna}:${opciones?.ascending === false ? "desc" : "asc"}`)
  constructor.limit = (cantidad) => anotar(`limit:${cantidad}`)
  constructor.maybeSingle = async () => unica
  constructor.then = (resolver) => {
    resolver(lista)
  }

  return constructor
}

function supabaseFalso(
  opciones: { filas?: unknown[]; fila?: unknown; errorLista?: unknown; errorFila?: unknown; errorRpc?: unknown } = {},
) {
  const registro: string[] = []
  const rpc = vi.fn(async (nombre: string) => {
    registro.push(`rpc:${nombre}`)
    return { data: 1, error: opciones.errorRpc ?? null }
  })
  const from = vi.fn(() => constructorConsulta(
    { data: opciones.filas ?? [], error: opciones.errorLista ?? null },
    { data: opciones.fila ?? null, error: opciones.errorFila ?? null },
    registro,
  ))
  const cliente = { from, rpc } as unknown as SupabaseClient
  adminActual.cliente = cliente
  return { cliente, registro, rpc, from }
}

/** R2 falso en memoria con un único objeto descargable. */
function r2Falso(objetos: Map<string, Buffer>) {
  const send = vi.fn(async () => {
    throw new Error("no debería usarse")
  })
  const cliente: ClienteR2 = {
    send: (async (comando: { constructor: { name: string }; input: { Key: string } }) => {
      if (comando.constructor.name !== "GetObjectCommand") throw new Error(`comando inesperado: ${comando.constructor.name}`)
      const cuerpo = objetos.get(comando.input.Key)
      if (!cuerpo) throw Object.assign(new Error("NotFound"), { name: "NotFound", $metadata: { httpStatusCode: 404 } })
      return { Body: { transformToByteArray: async () => cuerpo } }
    }) as unknown as ClienteR2["send"],
  }
  return { cliente, send }
}

async function archivoComprimido() {
  return comprimirGzip(Buffer.from(serializarJsonl(eventos), "utf8"))
}

function filaLote(extra: Record<string, unknown> = {}) {
  return {
    id: loteId,
    estado: "verificado",
    cantidad_registros: 1,
    primera_fecha: "2025-11-01T10:00:00+00:00",
    ultima_fecha: "2025-11-01T10:00:00+00:00",
    ruta_objeto: ruta,
    tamano_comprimido: 120,
    hash_sha256: "a".repeat(64),
    verificado_en: "2025-12-01T00:00:00+00:00",
    origen_eliminado_en: null,
    creado_en: "2025-12-01T00:00:00+00:00",
    ...extra,
  }
}

beforeEach(() => {
  verificarEsAdmin.mockReset().mockResolvedValue({ isAdmin: true, error: null })
})

describe("listarArchivosArchivados", () => {
  it("no consulta la base cuando el rol no alcanza", async () => {
    verificarEsAdmin.mockResolvedValueOnce({ isAdmin: false, error: null })
    const { cliente, from } = supabaseFalso()

    const resultado = await listarArchivosArchivados(cliente, usuarioId)

    expect(resultado).toEqual({ unauthorized: true, archivos: [], error: null })
    expect(from).not.toHaveBeenCalled()
  })

  it("propaga el error de rol sin filtrar filas", async () => {
    const errorRol = { message: "sin rol" }
    verificarEsAdmin.mockResolvedValueOnce({ isAdmin: false, error: errorRol })
    const { cliente } = supabaseFalso({ filas: [filaLote()] })

    const resultado = await listarArchivosArchivados(cliente, usuarioId)

    expect(resultado.unauthorized).toBe(true)
    expect(resultado.archivos).toEqual([])
    expect(resultado.error).toBe(errorRol)
  })

  it("lista solo lotes archivados, del período más nuevo al más viejo", async () => {
    const { cliente, registro } = supabaseFalso({ filas: [filaLote()] })

    const resultado = await listarArchivosArchivados(cliente, usuarioId)

    expect(registro).toContain("in:estado=subido,verificado,origen_eliminado")
    expect(registro).toContain("order:primera_fecha:desc")
    expect(registro).toContain("limit:50")
    expect(resultado.archivos).toEqual([{
      id: loteId,
      estado: "verificado",
      cantidadRegistros: 1,
      primeraFecha: "2025-11-01T10:00:00+00:00",
      ultimaFecha: "2025-11-01T10:00:00+00:00",
      rutaObjeto: ruta,
      tamanoComprimido: 120,
      hashSha256: "a".repeat(64),
      verificadoEn: "2025-12-01T00:00:00+00:00",
      origenEliminadoEn: null,
      creadoEn: "2025-12-01T00:00:00+00:00",
    }])
  })

  it("filtra por rango de fechas incluyendo el día completo", async () => {
    const { cliente, registro } = supabaseFalso({ filas: [] })

    await listarArchivosArchivados(cliente, usuarioId, { desde: "2025-01-01", hasta: "2025-12-31" })

    expect(registro).toContain("gte:ultima_fecha=2025-01-01T00:00:00.000Z")
    expect(registro).toContain("lte:primera_fecha=2025-12-31T23:59:59.999Z")
  })

  it("ignora fechas con formato inválido en lugar de consultarlas", async () => {
    const { cliente, registro } = supabaseFalso({ filas: [] })

    await listarArchivosArchivados(cliente, usuarioId, { desde: "01/01/2025", hasta: "2025-13-99'; drop table x" })

    expect(registro.some((entrada) => entrada.startsWith("gte") || entrada.startsWith("lte"))).toBe(false)
  })

  it("informa el error de la consulta sin romper la página", async () => {
    const { cliente } = supabaseFalso({ errorLista: { message: "sin tabla" } })

    const resultado = await listarArchivosArchivados(cliente, usuarioId)

    expect(resultado.archivos).toEqual([])
    expect(resultado.error).toEqual({ message: "sin tabla" })
    expect(resultado.unauthorized).toBe(false)
  })
})

describe("recuperarEventosArchivados", () => {
  it("rechaza un identificador que no es UUID sin consultar la base", async () => {
    const { cliente, from } = supabaseFalso()

    const resultado = await recuperarEventosArchivados(cliente, usuarioId, "../../etc/passwd")

    expect(resultado).toEqual({ unauthorized: false, recuperado: null, error: null })
    expect(from).not.toHaveBeenCalled()
  })

  it("no entrega lotes de quien no es Admin", async () => {
    verificarEsAdmin.mockResolvedValueOnce({ isAdmin: false, error: null })
    const { cliente } = supabaseFalso({ fila: filaLote() })

    const resultado = await recuperarEventosArchivados(cliente, usuarioId, loteId)

    expect(resultado.unauthorized).toBe(true)
    expect(resultado.recuperado).toBeNull()
  })

  it("recupera los eventos del objeto sin restaurarlos a PostgreSQL", async () => {
    const comprimido = await archivoComprimido()
    const objetos = new Map([[ruta, comprimido]])
    const { cliente } = supabaseFalso({ fila: filaLote({ hash_sha256: (await import("./serializacion")).calcularHashSha256(comprimido) }) })
    const r2 = r2Falso(objetos)

    const resultado = await recuperarEventosArchivados(cliente, usuarioId, loteId, { configuracion, cliente: r2.cliente })

    expect(resultado.recuperado?.eventos).toEqual([{ ...eventos[0], version: 1 }])
    expect(resultado.recuperado?.archivo.id).toBe(loteId)
    expect(resultado.error).toBeNull()
  })

  it("no devuelve datos parciales si el hash del objeto no coincide", async () => {
    const comprimido = await archivoComprimido()
    const { cliente } = supabaseFalso({ fila: filaLote({ hash_sha256: "b".repeat(64) }) })
    const r2 = r2Falso(new Map([[ruta, comprimido]]))

    const resultado = await recuperarEventosArchivados(cliente, usuarioId, loteId, { configuracion, cliente: r2.cliente })

    expect(resultado.recuperado).toBeNull()
    expect(resultado.error).toBeInstanceOf(ErrorLoteNoDisponible)
  })

  it("devuelve null cuando el lote no existe o no tiene objeto remoto", async () => {
    const vacio = supabaseFalso({ fila: null })
    const sinObjeto = supabaseFalso({ fila: filaLote({ ruta_objeto: null }) })
    const r2 = r2Falso(new Map())

    await expect(recuperarEventosArchivados(vacio.cliente, usuarioId, loteId, { configuracion, cliente: r2.cliente }))
      .resolves.toEqual({ unauthorized: false, recuperado: null, error: null })
    await expect(recuperarEventosArchivados(sinObjeto.cliente, usuarioId, loteId, { configuracion, cliente: r2.cliente }))
      .resolves.toEqual({ unauthorized: false, recuperado: null, error: null })
  })
})

describe("prepararDescargaArchivada", () => {
  it("entrega los bytes comprimidos con su nombre de archivo", async () => {
    const comprimido = await archivoComprimido()
    const { cliente } = supabaseFalso({ fila: filaLote({ hash_sha256: (await import("./serializacion")).calcularHashSha256(comprimido) }) })
    const r2 = r2Falso(new Map([[ruta, comprimido]]))

    const resultado = await prepararDescargaArchivada(cliente, usuarioId, loteId, { configuracion, cliente: r2.cliente })

    expect(resultado.descarga).toEqual({
      nombre: "audit-41-42-aaaaaaaaaaaaaaaa.jsonl.gz",
      contenido: comprimido,
      tamano: comprimido.length,
    })
  })

  it("audita la descarga con el Admin como actor", async () => {
    const comprimido = await archivoComprimido()
    const { cliente, rpc, registro } = supabaseFalso({
      fila: filaLote({ hash_sha256: (await import("./serializacion")).calcularHashSha256(comprimido) }),
    })
    const r2 = r2Falso(new Map([[ruta, comprimido]]))

    await prepararDescargaArchivada(cliente, usuarioId, loteId, { configuracion, cliente: r2.cliente })

    expect(registro).toContain("rpc:auditoria_registrar_evento")
    expect(rpc).toHaveBeenCalledWith("auditoria_registrar_evento", {
      p_accion: "audit_archive_downloaded",
      p_detalle: `lote ${loteId}`,
      p_actor: usuarioId,
    })
  })

  it("entrega el archivo aunque falle el registro de auditoría", async () => {
    const comprimido = await archivoComprimido()
    const { cliente } = supabaseFalso({
      fila: filaLote({ hash_sha256: (await import("./serializacion")).calcularHashSha256(comprimido) }),
      errorRpc: { message: "sin permiso" },
    })
    const r2 = r2Falso(new Map([[ruta, comprimido]]))

    const resultado = await prepararDescargaArchivada(cliente, usuarioId, loteId, { configuracion, cliente: r2.cliente })

    expect(resultado.descarga?.tamano).toBe(comprimido.length)
    expect(resultado.error).toEqual({ message: "sin permiso" })
  })

  it("no rompe la página cuando falta la configuración de R2", async () => {
    const { cliente } = supabaseFalso({ fila: filaLote() })
    vi.stubEnv("R2_ACCOUNT_ID", "")

    const resultado = await prepararDescargaArchivada(cliente, usuarioId, loteId)

    expect(resultado.descarga).toBeNull()
    expect(resultado.error).toBeInstanceOf(Error)
    vi.unstubAllEnvs()
  })
})
