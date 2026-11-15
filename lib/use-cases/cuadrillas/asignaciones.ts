import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import {
  cerrarAsignacion,
  cerrarAsignacionAbiertaDeReporte,
  insertarAsignacion,
  insertarObservacion,
  listarAsignacionesDeReporte,
  obtenerAsignacion,
  obtenerAsignacionAbierta,
  obtenerAsignacionAbiertaDeCuadrilla,
  obtenerCuadrilla,
  clasificarConflictoAsignacion,
  type AsignacionCuadrilla,
  type Cuadrilla,
  type ObservacionCuadrilla,
} from "@/database/queries/cuadrillas"
import { ESTADOS_OPERATIVOS, ETIQUETAS_MOTIVO_CIERRE, REPORT_STATE_IDS } from "@/lib/authz/catalog"
import { applyReportStateChange, getReportContext } from "@/lib/use-cases/reportes/detail-mutations"
import { sendCrewAssignedEmail } from "@/lib/notifications/report-notifications"
import { pushCuadrillaAsignada } from "@/lib/push/avisos.server"

import { calcularAccionesDisponibles } from "./acciones-disponibles"
import { asegurarOperadorDeCuadrillas, type ResultadoAccion } from "./guardias"

type PropietarioReporte = { username: string | null; email: string | null }

type PropietarioRelation = PropietarioReporte | PropietarioReporte[] | null

type ContextoReporte = {
  id: number
  usuarioId: string | null
  titulo: string
  estadoId: number | null
  deletedAt: string | null
  propietario: PropietarioReporte | null
}

function obtenerPropietario(relacion: PropietarioRelation): PropietarioReporte | null {
  if (Array.isArray(relacion)) {
    return relacion[0] ?? null
  }

  return relacion ?? null
}

/**
 * Lee el contexto mínimo de un reporte necesario para autorizar y ejecutar una acción
 * operativa de cuadrillas (existencia, borrado lógico, estado administrativo y datos de
 * contacto del propietario para notificaciones).
 */
async function leerContextoReporte(
  supabase: SupabaseClient,
  reporteId: number,
): Promise<ResultadoAccion<ContextoReporte>> {
  const { data, error } = await supabase
    .from("reportes")
    .select(
      `
        id,
        usuario_id,
        titulo,
        estado_id,
        deleted_at,
        propietario:profiles!reportes_usuario_id_fkey(username, email)
      `,
    )
    .eq("id", reporteId)
    .maybeSingle()

  if (error || !data) {
    return { success: false, error: "No pudimos encontrar el reporte." }
  }

  return {
    success: true,
    data: {
      id: data.id,
      usuarioId: data.usuario_id,
      titulo: data.titulo,
      estadoId: data.estado_id,
      deletedAt: data.deleted_at,
      propietario: obtenerPropietario(data.propietario as PropietarioRelation),
    },
  }
}

/**
 * Valida que un reporte admita una acción operativa de cuadrillas: no debe estar eliminado
 * ni tener ya un estado administrativo cerrado (Reparado/Rechazado).
 */
function validarReporteParaAccionOperativa(contexto: ContextoReporte): ResultadoAccion<true> {
  if (contexto.deletedAt) {
    return { success: false, error: "El reporte ya no está disponible." }
  }

  if (contexto.estadoId !== REPORT_STATE_IDS.PENDIENTE) {
    return { success: false, error: "El reporte ya está cerrado." }
  }

  return { success: true, data: true }
}

/**
 * Lee una cuadrilla y verifica que exista y esté activa.
 */
async function leerCuadrillaActiva(supabase: SupabaseClient, cuadrillaId: number): Promise<ResultadoAccion<Cuadrilla>> {
  const { data } = await obtenerCuadrilla(supabase, cuadrillaId)

  if (!data || !data.activa) {
    return { success: false, error: "La cuadrilla seleccionada está inactiva." }
  }

  return { success: true, data }
}

/**
 * Avisa al dueño del reporte que se le asignó una cuadrilla: push (si la tiene activada) y
 * correo (si tiene email). Ningún fallo rompe el flujo de asignación.
 *
 * @param supabase - Cliente de servicio, necesario para leer las suscripciones push.
 * @param contexto - Reporte asignado y su propietario.
 * @param cuadrillaNombre - Nombre de la cuadrilla, si se conoce.
 */
export async function notificarCuadrillaAsignada(
  supabase: SupabaseClient,
  contexto: ContextoReporte,
  cuadrillaNombre: string | null,
) {
  if (!contexto.usuarioId) {
    return
  }

  await pushCuadrillaAsignada(supabase, {
    usuarioId: contexto.usuarioId,
    reporteId: contexto.id,
    titulo: contexto.titulo,
    cuadrillaNombre,
  })

  if (!contexto.propietario?.email) {
    return
  }

  try {
    await sendCrewAssignedEmail({
      ownerEmail: contexto.propietario.email,
      ownerUsername: contexto.propietario.username,
      reporteId: contexto.id,
      reporteTitulo: contexto.titulo,
      cuadrillaNombre,
      detalle: null,
    })
  } catch (notificationError) {
    console.error("Error al enviar notificación de asignación de cuadrilla:", notificationError)
  }
}

/**
 * Asigna una cuadrilla a un reporte. Solo notifica por email en la PRIMERA asignación de la
 * vida del reporte (las reasignaciones nunca notifican): esto se determina antes del INSERT
 * contando las asignaciones previas existentes.
 */
export async function asignarCuadrillaWorkflow(
  supabase: SupabaseClient,
  actorUserId: string,
  datos: {
    reporteId: number
    cuadrillaId: number
    observacion?: string
    observacionPublica?: boolean
  },
): Promise<ResultadoAccion<AsignacionCuadrilla>> {
  const guardia = await asegurarOperadorDeCuadrillas(supabase, actorUserId)
  if (!guardia.success) {
    return guardia
  }

  const contextoResultado = await leerContextoReporte(supabase, datos.reporteId)
  if (!contextoResultado.success) {
    return contextoResultado
  }

  const validacion = validarReporteParaAccionOperativa(contextoResultado.data)
  if (!validacion.success) {
    return validacion
  }

  const cuadrillaResultado = await leerCuadrillaActiva(supabase, datos.cuadrillaId)
  if (!cuadrillaResultado.success) {
    return cuadrillaResultado
  }

  const { data: asignacionesPrevias } = await listarAsignacionesDeReporte(supabase, datos.reporteId)
  const esPrimeraAsignacion = asignacionesPrevias.length === 0

  const insertResultado = await insertarAsignacion(supabase, {
    reporteId: datos.reporteId,
    cuadrillaId: datos.cuadrillaId,
    asignadaPor: actorUserId,
  })

  if (insertResultado.guardFailure === "cuadrilla_inactiva") {
    return { success: false, error: "La cuadrilla seleccionada está inactiva." }
  }

  if (insertResultado.guardFailure === "reporte_no_disponible") {
    return { success: false, error: "El reporte ya no está disponible." }
  }

  const conflicto = clasificarConflictoAsignacion(insertResultado.error)
  if (conflicto === "cuadrilla_ocupada") {
    return {
      success: false,
      error: `${cuadrillaResultado.data.nombre} ya está trabajando en otro reporte. Una cuadrilla atiende un reporte a la vez: cerrá o reasigná esa intervención primero.`,
    }
  }
  if (conflicto === "reporte_ya_asignado") {
    return {
      success: false,
      error: "Este reporte ya tiene una cuadrilla asignada. Recargá para ver la asignación vigente.",
    }
  }

  if (insertResultado.error || !insertResultado.data) {
    return { success: false, error: "No pudimos asignar la cuadrilla." }
  }

  const asignacion = insertResultado.data

  const { error: observacionError } = await insertarObservacion(supabase, {
    asignacionId: asignacion.id,
    autorId: actorUserId,
    contenido: datos.observacion?.trim() || "Cuadrilla asignada.",
    observacionPublica: datos.observacionPublica ?? false,
    estadoOperativoResultante: ESTADOS_OPERATIVOS.EN_PROGRESO,
  })

  if (observacionError) {
    console.error("No pudimos registrar la observación de asignación de cuadrilla:", observacionError)
  }

  if (esPrimeraAsignacion) {
    await notificarCuadrillaAsignada(supabase, contextoResultado.data, cuadrillaResultado.data.nombre)
  }

  return { success: true, data: asignacion }
}

/**
 * Registra una observación libre sobre una asignación de cuadrilla abierta, sin cambiar su
 * estado operativo. Revalida con `calcularAccionesDisponibles` que la acción `observar` siga
 * vigente antes de insertar. Devuelve también la asignación (no solo la observación) para que
 * el llamador pueda revalidar la página del reporte sin una lectura extra.
 */
export async function registrarObservacionWorkflow(
  supabase: SupabaseClient,
  actorUserId: string,
  datos: {
    asignacionId: number
    observacion: string
    observacionPublica?: boolean
  },
): Promise<ResultadoAccion<{ asignacion: AsignacionCuadrilla; observacion: ObservacionCuadrilla }>> {
  const guardia = await asegurarOperadorDeCuadrillas(supabase, actorUserId)
  if (!guardia.success) {
    return guardia
  }

  const asignacionResultado = await obtenerAsignacion(supabase, datos.asignacionId)
  if (asignacionResultado.error || !asignacionResultado.data) {
    return { success: false, error: "No pudimos encontrar la asignación de cuadrilla." }
  }

  const asignacionActual = asignacionResultado.data

  const contextoResultado = await leerContextoReporte(supabase, asignacionActual.reporteId)
  if (!contextoResultado.success) {
    return contextoResultado
  }

  const validacion = validarReporteParaAccionOperativa(contextoResultado.data)
  if (!validacion.success) {
    return validacion
  }

  const accionesDisponibles = calcularAccionesDisponibles({
    roleId: guardia.data,
    estadoReporteId: contextoResultado.data.estadoId,
    reporteEliminado: false,
    asignacionAbierta: asignacionActual,
  })

  if (!accionesDisponibles.includes("observar")) {
    return { success: false, error: "Esa acción ya no está disponible para esta asignación." }
  }

  const { data: observacion, error: observacionError } = await insertarObservacion(supabase, {
    asignacionId: asignacionActual.id,
    autorId: actorUserId,
    contenido: datos.observacion,
    observacionPublica: datos.observacionPublica ?? false,
    estadoOperativoResultante: null,
  })

  if (observacionError || !observacion) {
    return { success: false, error: "No pudimos registrar la observación." }
  }

  return { success: true, data: { asignacion: asignacionActual, observacion } }
}

/**
 * Cancela la intervención de una cuadrilla (motivo `cancelada`). NO toca `reportes.estado_id`:
 * el reporte simplemente vuelve a quedar sin cuadrilla, disponible para una nueva asignación.
 */
export async function cancelarIntervencionWorkflow(
  supabase: SupabaseClient,
  actorUserId: string,
  datos: {
    asignacionId: number
    observacion?: string
    observacionPublica?: boolean
  },
): Promise<ResultadoAccion<{ asignacion: AsignacionCuadrilla; cambio: boolean }>> {
  const guardia = await asegurarOperadorDeCuadrillas(supabase, actorUserId)
  if (!guardia.success) {
    return guardia
  }

  const asignacionResultado = await obtenerAsignacion(supabase, datos.asignacionId)
  if (asignacionResultado.error || !asignacionResultado.data) {
    return { success: false, error: "No pudimos encontrar la asignación de cuadrilla." }
  }

  const asignacionActual = asignacionResultado.data

  const contextoResultado = await leerContextoReporte(supabase, asignacionActual.reporteId)
  if (!contextoResultado.success) {
    return contextoResultado
  }

  const validacion = validarReporteParaAccionOperativa(contextoResultado.data)
  if (!validacion.success) {
    return validacion
  }

  const accionesDisponibles = calcularAccionesDisponibles({
    roleId: guardia.data,
    estadoReporteId: contextoResultado.data.estadoId,
    reporteEliminado: false,
    asignacionAbierta: asignacionActual,
  })

  if (!accionesDisponibles.includes("cancelar")) {
    return { success: false, error: "Esa acción ya no está disponible para esta asignación." }
  }

  const cierre = await cerrarAsignacion(supabase, datos.asignacionId, "cancelada")

  if (cierre.error) {
    return { success: false, error: "No pudimos cerrar la intervención de la cuadrilla." }
  }

  if (!cierre.data) {
    const releida = await obtenerAsignacion(supabase, datos.asignacionId)

    if (releida.error || !releida.data) {
      return { success: false, error: "No pudimos encontrar la asignación de cuadrilla." }
    }

    if (releida.data.estadoOperativo === "cerrada" && releida.data.motivoCierre === "cancelada") {
      return { success: true, data: { asignacion: releida.data, cambio: false } }
    }

    return {
      success: false,
      error: "La asignación cambió mientras procesábamos la acción. Recargá e intentá nuevamente.",
    }
  }

  const asignacion = cierre.data

  const { error: observacionError } = await insertarObservacion(supabase, {
    asignacionId: asignacion.id,
    autorId: actorUserId,
    contenido: datos.observacion?.trim() || ETIQUETAS_MOTIVO_CIERRE.cancelada,
    observacionPublica: datos.observacionPublica ?? false,
    estadoOperativoResultante: ESTADOS_OPERATIVOS.CERRADA,
  })

  if (observacionError) {
    console.error("No pudimos registrar la observación de cierre de intervención:", observacionError)
  }

  return { success: true, data: { asignacion, cambio: true } }
}

/**
 * Reasigna un reporte a otra cuadrilla. Secuencia fija de 8 pasos (0-8): guardas y lecturas
 * primero, sin ninguna escritura hasta el paso 4.
 */
export async function reasignarCuadrillaWorkflow(
  supabase: SupabaseClient,
  actorUserId: string,
  datos: {
    reporteId: number
    cuadrillaId: number
    observacion?: string
    observacionPublica?: boolean
  },
): Promise<ResultadoAccion<AsignacionCuadrilla>> {
  // 0. Guard de rol. Si falla, se aborta sin escribir nada.
  const guardia = await asegurarOperadorDeCuadrillas(supabase, actorUserId)
  if (!guardia.success) {
    return guardia
  }

  // 1. Leer contexto del reporte. Falta / eliminado / ya cerrado -> abortar. Cero escrituras.
  const contextoResultado = await leerContextoReporte(supabase, datos.reporteId)
  if (!contextoResultado.success) {
    return contextoResultado
  }

  const validacion = validarReporteParaAccionOperativa(contextoResultado.data)
  if (!validacion.success) {
    return validacion
  }

  // 2. Leer la cuadrilla. Falta o inactiva -> abortar. Cero escrituras.
  const cuadrillaResultado = await leerCuadrillaActiva(supabase, datos.cuadrillaId)
  if (!cuadrillaResultado.success) {
    return cuadrillaResultado
  }

  // 3. Leer la asignación abierta. Ninguna / misma cuadrilla -> abortar. Cero escrituras.
  const abiertaResultado = await obtenerAsignacionAbierta(supabase, datos.reporteId)

  if (abiertaResultado.error) {
    return { success: false, error: "No pudimos leer la asignación vigente del reporte." }
  }

  if (!abiertaResultado.data) {
    return { success: false, error: "Este reporte no tiene una cuadrilla asignada." }
  }

  if (abiertaResultado.data.cuadrillaId === datos.cuadrillaId) {
    return { success: false, error: "El reporte ya está asignado a esa cuadrilla." }
  }

  // 3.b Verificar que la cuadrilla destino esté libre ANTES de escribir nada.
  //
  // El índice `idx_asignaciones_cuadrilla_ocupada` ya garantiza la invariante, pero si el
  // choque se descubriera recién en el INSERT del paso 5 la asignación vieja ya estaría
  // cerrada: el operador perdería la cuadrilla que tenía por haber elegido mal el destino.
  // Esta lectura previa no es la autoridad (el índice lo es) y no cierra la ventana de
  // carrera; solo evita el daño colateral en el caso común, que es elegir una cuadrilla que
  // se ve ocupada en pantalla.
  const ocupacionDestino = await obtenerAsignacionAbiertaDeCuadrilla(supabase, datos.cuadrillaId)
  if (ocupacionDestino.data) {
    return {
      success: false,
      error: `${cuadrillaResultado.data.nombre} ya está trabajando en otro reporte. Una cuadrilla atiende un reporte a la vez.`,
    }
  }

  // 4. PRIMERA ESCRITURA: cerrar la asignación abierta actual con motivo "reasignada". El
  // orden es cerrar-y-después-insertar y no al revés: el índice único parcial
  // `(reporte_id) where estado_operativo <> 'cerrada'` rechazaría el INSERT del paso 5 si la
  // fila vieja siguiera abierta. Y si el paso 5 fallara después de este cierre, el reporte
  // simplemente queda sin asignación abierta — exactamente el mismo estado que tenía antes
  // de que existiera esta funcionalidad, totalmente recuperable a mano (un operador puede
  // volver a asignar cualquier cuadrilla).
  const cierre = await cerrarAsignacionAbiertaDeReporte(supabase, datos.reporteId, "reasignada")

  if (cierre.error || !cierre.data) {
    return {
      success: false,
      error: "La asignación cambió mientras procesábamos la acción. Recargá e intentá nuevamente.",
    }
  }

  // 5. Insertar la nueva asignación.
  const insertResultado = await insertarAsignacion(supabase, {
    reporteId: datos.reporteId,
    cuadrillaId: datos.cuadrillaId,
    asignadaPor: actorUserId,
  })

  if (insertResultado.guardFailure) {
    return { success: false, error: "La cuadrilla seleccionada está inactiva." }
  }

  const conflictoReasignacion = clasificarConflictoAsignacion(insertResultado.error)
  if (conflictoReasignacion === "cuadrilla_ocupada") {
    // El chequeo previo del paso 3.b lo cubre en el caso normal; llegar acá significa que la
    // cuadrilla se ocupó en el intervalo. La asignación anterior ya quedó cerrada, así que el
    // reporte queda sin cuadrilla y hay que volver a asignarlo.
    return {
      success: false,
      error: `${cuadrillaResultado.data.nombre} fue asignada a otro reporte mientras procesábamos la acción. El reporte quedó sin cuadrilla: volvé a asignarlo.`,
    }
  }
  if (conflictoReasignacion === "reporte_ya_asignado") {
    return {
      success: false,
      error: "Este reporte ya tiene una cuadrilla asignada. Recargá para ver la asignación vigente.",
    }
  }

  if (insertResultado.error || !insertResultado.data) {
    return { success: false, error: "No pudimos asignar la nueva cuadrilla." }
  }

  const nuevaAsignacion = insertResultado.data

  // 6. Observaciones de cierre y apertura: si fallan, se loguean y se ignoran (mismo criterio
  // que ya usa este repo para `historial_estados` en detail-mutations.ts).
  const { error: observacionCierreError } = await insertarObservacion(supabase, {
    asignacionId: cierre.data.id,
    autorId: actorUserId,
    contenido: "Reasignado a otra cuadrilla.",
    observacionPublica: false,
    estadoOperativoResultante: ESTADOS_OPERATIVOS.CERRADA,
  })

  if (observacionCierreError) {
    console.error("No pudimos registrar la observación de cierre por reasignación:", observacionCierreError)
  }

  const { error: observacionAperturaError } = await insertarObservacion(supabase, {
    asignacionId: nuevaAsignacion.id,
    autorId: actorUserId,
    contenido: datos.observacion?.trim() || "Cuadrilla reasignada.",
    observacionPublica: datos.observacionPublica ?? false,
    estadoOperativoResultante: ESTADOS_OPERATIVOS.EN_PROGRESO,
  })

  if (observacionAperturaError) {
    console.error("No pudimos registrar la observación de apertura por reasignación:", observacionAperturaError)
  }

  // 7. Sin email: la reasignación no es un hito notificable.
  // 8. Éxito.
  return { success: true, data: nuevaAsignacion }
}

/**
 * Cierra un reporte con cuadrilla (o sin ella) marcándolo "Reparado" o "Rechazado". El
 * operador es quien sabe que el trabajo terminó (se entera por radio o teléfono, nunca usa
 * el sistema la cuadrilla en sí), así que ADMIN y OPERADOR pueden ejecutar este cierre.
 *
 * Reutiliza la MISMA composición que `cambiarEstadoAdminWorkflow` en `detail-mutations.ts`
 * (`getReportContext` + `applyReportStateChange`), solo que con la guarda de operador de
 * cuadrillas en lugar de la de administrador: los puntos, el `historial_estados` y el email
 * de cambio de estado del reporte salen por ese único camino, sin reimplementarlos acá.
 *
 * Solo después de confirmar ese éxito cierra la asignación de cuadrilla abierta (si la hay)
 * con el motivo resolutivo correspondiente. El orden es cierre-de-reporte-y-después-
 * cierre-de-asignación, nunca al revés: en el orden inverso, un reintento tras un fallo de
 * red podría emitir los puntos y el email del reporte dos veces, mientras que cerrar la
 * asignación es una operación idempotente y de bajo riesgo (0 filas = "no tenía asignación
 * abierta", un no-op legítimo) que puede repetirse sin efectos visibles para el usuario.
 */
export async function cerrarReporteConCuadrillaWorkflow(
  supabase: SupabaseClient,
  actorUserId: string,
  datos: {
    reporteId: number
    nuevoEstadoId: typeof REPORT_STATE_IDS.REPARADO | typeof REPORT_STATE_IDS.RECHAZADO
    comentario?: string
  },
): Promise<ResultadoAccion<{ estadoId: number; asignacionCerrada: boolean }>> {
  const guardia = await asegurarOperadorDeCuadrillas(supabase, actorUserId)
  if (!guardia.success) {
    return guardia
  }

  const reporteResultado = await getReportContext(supabase, datos.reporteId)
  if (!reporteResultado.success) {
    return reporteResultado
  }

  const cambioEstado = await applyReportStateChange(
    supabase,
    reporteResultado.data,
    datos.nuevoEstadoId,
    actorUserId,
    datos.comentario?.trim() || "Cierre registrado por operador de cuadrillas",
  )

  if (!cambioEstado.success) {
    return cambioEstado
  }

  const motivoCierre = datos.nuevoEstadoId === REPORT_STATE_IDS.REPARADO ? "reparado" : "rechazado"
  const cierre = await cerrarAsignacionAbiertaDeReporte(supabase, datos.reporteId, motivoCierre)

  if (cierre.error) {
    console.error(
      "No pudimos cerrar la asignación de cuadrilla tras el cierre del reporte:",
      cierre.error,
    )
  }

  return {
    success: true,
    data: { estadoId: cambioEstado.data.estadoId, asignacionCerrada: Boolean(cierre.data) },
  }
}
