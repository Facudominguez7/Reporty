import "server-only"

import { subirArchivo, verificarArchivo, type ClienteR2 } from "./cliente-r2"
import { LIMITE_LOTE_MAXIMO, type ConfiguracionArchivoAuditoria } from "./configuracion"
import { construirRutaArchivo } from "./rutas-objeto"
import { calcularHashSha256, comprimirGzip, serializarJsonl, type EventoAuditoria } from "./serializacion"

/**
 * Servicio de archivado de la auditoría histórica.
 *
 * Orquesta una única corrida: reclama un lote acotado en PostgreSQL, lo serializa
 * como JSON Lines, lo comprime, lo sube a R2, lo vuelve a descargar para verificar
 * la integridad y recién entonces —si la purga está habilitada— elimina de la base
 * los identificadores exactos reclamados.
 *
 * Invariantes:
 * - ninguno de los dos caminos deja eventos fuera de la base sin un objeto
 *   verificado en R2;
 * - un fallo libera los reclamos, así que la corrida siguiente retoma el trabajo;
 * - el nombre del objeto es content-addressed, así que reintentar no duplica nada;
 * - el acceso a datos y a R2 entra por `DependenciasArchivado`, lo que permite
 *   probar todos los caminos sin credenciales ni consumo real.
 */

/** Acciones de auditoría de las operaciones administrativas del archivo. */
export type AccionArchivoAuditoria = "audit_archive_uploaded" | "audit_archive_verified" | "audit_archive_purged"

/** Lote tal como lo devuelve la base de control. */
export type LoteArchivado = {
  id: string
  estado: string
  primerEventoId: number
  ultimoEventoId: number
  cantidadRegistros: number
  primeraFecha: string
  ultimaFecha: string
  rutaObjeto: string | null
  tamanoComprimido: number | null
  hashSha256: string | null
  verificadoEn: string | null
}

/** Descripción del próximo lote archivable, sin reclamarlo. */
export type PrevisualizacionLote = {
  cantidad: number
  primerEventoId: number
  ultimoEventoId: number
  primeraFecha: string
  ultimaFecha: string
}

/** Métricas básicas del archivo para el panel administrativo. */
export type MetricasArchivo = {
  lotes: number
  lotesFallidos: number
  lotesPendientesPurga: number
  eventosArchivados: number
  eventosPurgados: number
  bytesEnR2: number
  elegibles: number
  eventosEnPostgres: number
  espacioTablaBytes: number
}

/** Acceso a la base de control del archivo. */
export type DatosArchivado = {
  /** Describe el próximo lote sin reclamarlo (modo `dry-run`). */
  previsualizar(limite: number, diasRetencion: number): Promise<PrevisualizacionLote | null>
  /** Reclama un lote; devuelve `null` si no hay elegibles o hay otra corrida en curso. */
  reclamar(limite: number, diasRetencion: number, ejecutor: string): Promise<LoteArchivado | null>
  /** Eventos reclamados por el lote, por identificadores exactos y en orden determinístico. */
  eventosDelLote(lote: LoteArchivado): Promise<EventoAuditoria[]>
  confirmarSubida(lote: LoteArchivado, subida: { ruta: string; tamano: number; hash: string }): Promise<boolean>
  verificarLote(id: string): Promise<boolean>
  eliminarOrigen(id: string, hash: string): Promise<number>
  fallarLote(id: string, error: string): Promise<boolean>
  lotesPendientesDePurga(limite: number): Promise<LoteArchivado[]>
  /**
   * Marca fallidos los lotes interrumpidos más viejos que esas horas y libera sus
   * reclamos, para que la corrida actual pueda retomarlos.
   */
  recuperarEstancados(horas: number): Promise<number>
  registrarEvento(accion: AccionArchivoAuditoria, detalle: string, actorId: string | null): Promise<void>
}

/** Dependencias de una corrida: configuración validada, cliente R2 y acceso a datos. */
export type DependenciasArchivado = {
  configuracion: ConfiguracionArchivoAuditoria
  cliente: ClienteR2
  datos: DatosArchivado
}

/** Opciones de una corrida del archivado. */
export type OpcionesArchivado = {
  /** `dry-run` no reclama, no sube y no borra: solo informa. */
  modo: "dry-run" | "real"
  /** Quién dispara la corrida: `cron`, `manual` o el identificador del Admin. */
  ejecutor: string
  /** Tope de eventos para esta corrida; se acota al máximo permitido. */
  limite?: number
  /** Días de retención caliente; por defecto lo configurado en el entorno. */
  diasRetencion?: number
  /** Actor de las entradas de auditoría de la propia corrida. */
  actorId?: string | null
}

/** Resultado de una corrida; nunca incluye datos personales ni secretos. */
export type ResumenArchivado = {
  modo: "dry-run" | "real"
  ok: boolean
  elegibles: number
  previsualizacion: PrevisualizacionLote | null
  lote: LoteArchivado | null
  archivo: { ruta: string; tamano: number; hash: string; yaExistia: boolean } | null
  verificado: boolean
  purgado: number
  purgasPrevias: number
  /** Lotes interrumpidos que se liberaron al comienzo de la corrida. */
  recuperados: number
  duracionMs: number
  mensaje: string
  error: string | null
  errores: string[]
}

/** Cantidad máxima de lotes ya verificados que se purgan por corrida. */
export const PURGAS_POR_CORRIDA = 5
/**
 * Antigüedad a partir de la cual un lote en curso se considera interrumpido.
 *
 * Es holgada a propósito: una corrida real tarda segundos o minutos, nunca horas.
 */
export const HORAS_LOTE_ESTANCADO = 12
/** Longitud máxima del mensaje de error que se guarda en la tabla de control. */
const LONGITUD_ERROR_MAXIMA = 300

/**
 * Convierte un error en un mensaje operativo de una sola línea.
 *
 * Los errores propios ya vienen saneados; para el resto se usa solo el nombre
 * técnico y el mensaje acotado, nunca el objeto completo (podría arrastrar
 * credenciales o cuerpos de respuesta).
 */
function mensajeOperativo(error: unknown): string {
  const nombre = error instanceof Error ? error.name : "ErrorDesconocido"
  const detalle = error instanceof Error ? error.message : "sin detalle"
  return `${nombre}: ${detalle}`.replace(/\s+/g, " ").slice(0, LONGITUD_ERROR_MAXIMA)
}

/**
 * Indica si todas las fechas caen en el mismo mes calendario UTC.
 *
 * @param fechas fechas ISO 8601 de los eventos del lote.
 */
export function mismoMesUtc(fechas: string[]): boolean {
  const meses = new Set(
    fechas.map((fecha) => {
      const valor = new Date(fecha)
      return Number.isNaN(valor.getTime()) ? "invalida" : `${valor.getUTCFullYear()}-${valor.getUTCMonth()}`
    }),
  )
  return meses.size <= 1 && !meses.has("invalida")
}

function acotarLimite(valor: number | undefined, porDefecto: number): number {
  const pedido = Number.isSafeInteger(valor) && (valor as number) > 0 ? (valor as number) : porDefecto
  return Math.min(Math.max(pedido, 1), LIMITE_LOTE_MAXIMO)
}

function acotarDias(valor: number | undefined, porDefecto: number): number {
  const pedido = Number.isSafeInteger(valor) && (valor as number) > 0 ? (valor as number) : porDefecto
  return Math.min(Math.max(pedido, 30), 3650)
}

/**
 * Ejecuta una corrida del archivado.
 *
 * @param opciones modo, ejecutor, límite y retención de la corrida.
 * @param dependencias configuración validada, cliente R2 y acceso a datos.
 * @returns resumen apto para el endpoint, el panel y los logs.
 */
export async function ejecutarArchivado(
  opciones: OpcionesArchivado,
  dependencias: DependenciasArchivado,
): Promise<ResumenArchivado> {
  const inicio = Date.now()
  const { configuracion, cliente, datos } = dependencias
  const limite = acotarLimite(opciones.limite, configuracion.limitePorLote)
  const diasRetencion = acotarDias(opciones.diasRetencion, configuracion.diasRetencion)
  const actorId = opciones.actorId ?? null

  const base = {
    modo: opciones.modo,
    elegibles: 0,
    previsualizacion: null,
    lote: null,
    archivo: null,
    verificado: false,
    purgado: 0,
    purgasPrevias: 0,
    recuperados: 0,
    error: null,
    errores: [] as string[],
  }

  if (opciones.modo === "dry-run") {
    const previsualizacion = await datos.previsualizar(limite, diasRetencion)
    const elegibles = previsualizacion?.cantidad ?? 0
    return {
      ...base,
      ok: true,
      elegibles,
      previsualizacion,
      duracionMs: Date.now() - inicio,
      mensaje: elegibles > 0
        ? `Se archivarían ${elegibles} eventos anteriores a ${diasRetencion} días.`
        : "No hay eventos elegibles: la retención caliente todavía cubre toda la auditoría.",
    }
  }

  const errores: string[] = []

  // 1. Recuperación de lotes interrumpidos: una corrida que muere entre la subida
  //    y la purga deja el lote en `reclamado` o `subido` con los reclamos tomados.
  //    Marcarlos fallidos libera los eventos para que esta corrida los retome.
  let recuperados = 0
  try {
    recuperados = await datos.recuperarEstancados(HORAS_LOTE_ESTANCADO)
  } catch (error) {
    errores.push(`recuperación de lotes estancados: ${mensajeOperativo(error)}`)
  }

  // 2. Purga de lotes ya verificados en corridas anteriores: es lo que habilita
  //    liberar espacio sin volver a subir el archivo. Se revalida el objeto remoto
  //    antes de borrar: el archivo pudo desaparecer o cambiar desde la corrida que
  //    lo verificó, y la regla es no eliminar sin un archivo verificado.
  let purgasPrevias = 0
  if (configuracion.purgaHabilitada) {
    const pendientes = await datos.lotesPendientesDePurga(PURGAS_POR_CORRIDA)
    for (const pendiente of pendientes) {
      try {
        if (!pendiente.hashSha256 || !pendiente.rutaObjeto) {
          throw new Error("El lote verificado no tiene archivo remoto registrado")
        }
        await verificarArchivo(cliente, configuracion, {
          ruta: pendiente.rutaObjeto,
          hashEsperado: pendiente.hashSha256,
          cantidadEsperada: pendiente.cantidadRegistros,
        })
        await datos.eliminarOrigen(pendiente.id, pendiente.hashSha256)
        purgasPrevias += 1
        errores.push(...await registrarSeguro(datos, "audit_archive_purged", `lote ${pendiente.id}`, actorId))
      } catch (error) {
        errores.push(`purga previa ${pendiente.id}: ${mensajeOperativo(error)}`)
      }
    }
  }

  // 3. Reclamo de un lote nuevo.
  const lote = await datos.reclamar(limite, diasRetencion, opciones.ejecutor)
  if (!lote) {
    return {
      ...base,
      ok: true,
      purgasPrevias,
      recuperados,
      errores,
      duracionMs: Date.now() - inicio,
      mensaje: "No hay eventos elegibles o hay otra ejecución en curso; no se archivó nada.",
    }
  }

  try {
    // 4. Lectura por identificadores exactos y verificación de la cantidad reclamada.
    const eventos = await datos.eventosDelLote(lote)
    if (eventos.length !== lote.cantidadRegistros) {
      throw new Error(
        `El lote reclamó ${lote.cantidadRegistros} eventos y se leyeron ${eventos.length}`,
      )
    }
    // La ruta del objeto usa el año y el mes del primer evento: un lote que
    // mezcle meses dejaría eventos en la carpeta equivocada. La base ya corta por
    // mes; esta guarda impide subir nada si alguna vez no lo hiciera.
    if (!mismoMesUtc(eventos.map((evento) => evento.occurred_at))) {
      throw new Error("El lote mezcla eventos de más de un mes calendario (UTC)")
    }

    // 5. JSON Lines, GZIP y hash de integridad sobre los bytes comprimidos.
    const comprimido = await comprimirGzip(Buffer.from(serializarJsonl(eventos), "utf8"))
    const hash = calcularHashSha256(comprimido)
    const ruta = construirRutaArchivo({
      primerId: lote.primerEventoId,
      ultimoId: lote.ultimoEventoId,
      primeraFecha: lote.primeraFecha,
      hash,
    })

    // 6. Subida idempotente: el mismo contenido produce la misma ruta.
    const subida = await subirArchivo(cliente, configuracion, { ruta, contenido: comprimido, hash })
    const confirmado = await datos.confirmarSubida(lote, { ruta, tamano: comprimido.length, hash })
    if (!confirmado) throw new Error("No se pudo registrar la subida del lote")
    errores.push(...await registrarSeguro(datos, "audit_archive_uploaded", `lote ${lote.id}`, actorId))

    // 7. Verificación: se descarga el objeto y se recalcula el hash. El ETag de R2
    //    no sirve como checksum, así que no se consulta.
    await verificarArchivo(cliente, configuracion, {
      ruta,
      hashEsperado: hash,
      cantidadEsperada: lote.cantidadRegistros,
    })
    const verificado = await datos.verificarLote(lote.id)
    if (!verificado) throw new Error("No se pudo marcar el lote como verificado")
    errores.push(...await registrarSeguro(datos, "audit_archive_verified", `lote ${lote.id}`, actorId))

    // 8. Purga del origen: solo con la verificación hecha y solo si el dueño la
    //    habilitó explícitamente.
    //    Si la purga falla, el archivo ya está a salvo: el lote queda verificado y
    //    una corrida posterior lo purga, sin volver a subir nada.
    let purgado = 0
    if (configuracion.purgaHabilitada) {
      try {
        purgado = await datos.eliminarOrigen(lote.id, hash)
        errores.push(...await registrarSeguro(datos, "audit_archive_purged", `lote ${lote.id}`, actorId))
      } catch (error) {
        errores.push(`purga del lote ${lote.id}: ${mensajeOperativo(error)}`)
      }
    }

    return {
      ...base,
      ok: true,
      elegibles: lote.cantidadRegistros,
      lote,
      archivo: { ...subida, hash },
      verificado: true,
      purgado,
      purgasPrevias,
      recuperados,
      errores,
      duracionMs: Date.now() - inicio,
      mensaje: purgado > 0
        ? `Lote de ${lote.cantidadRegistros} eventos archivado y eliminado de PostgreSQL.`
        : `Lote de ${lote.cantidadRegistros} eventos archivado y verificado; la purga está deshabilitada.`,
    }
  } catch (error) {
    const mensaje = mensajeOperativo(error)
    // 9. Ante cualquier fallo se liberan los reclamos: PostgreSQL conserva los
    //    eventos y la corrida siguiente los retoma.
    try {
      await datos.fallarLote(lote.id, mensaje)
    } catch (fallo) {
      errores.push(`no se pudo liberar el lote ${lote.id}: ${mensajeOperativo(fallo)}`)
    }

    return {
      ...base,
      ok: false,
      lote,
      purgasPrevias,
      recuperados,
      errores: [mensaje, ...errores],
      duracionMs: Date.now() - inicio,
      mensaje: "La corrida no pudo completarse: los eventos quedaron en PostgreSQL.",
      error: mensaje,
    }
  }
}

/**
 * Registra una acción de auditoría sin hacer fallar la corrida: si la auditoría
 * de la propia operación falla, se informa como error operativo y se sigue.
 */
async function registrarSeguro(
  datos: DatosArchivado,
  accion: AccionArchivoAuditoria,
  detalle: string,
  actorId: string | null,
): Promise<string[]> {
  try {
    await datos.registrarEvento(accion, detalle, actorId)
    return []
  } catch (error) {
    return [`no se pudo auditar ${accion}: ${mensajeOperativo(error)}`]
  }
}
