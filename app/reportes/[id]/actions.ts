"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { parseAporteKey } from "@/lib/reportes/aportes"
import { parseFraseImpugnacion, parseFraseReparacion } from "@/lib/reportes/frases-reparacion"

import {
  actualizarDatosReporteAdminWorkflow,
  cambiarEstadoAdminWorkflow,
  quitarFotoReporteAdminWorkflow,
  reemplazarFotoReporteAdminWorkflow,
  crearComentarioWorkflow,
  eliminarComentarioAdminWorkflow,
  eliminarComentarioPropioWorkflow,
  eliminarReporteAdminWorkflow,
  eliminarReportePropioWorkflow,
  mutationErrorMessage as workflowErrorMessage,
  votarNoExisteWorkflow,
} from "@/lib/use-cases/reportes"
import {
  MENSAJE_CUENTA_REPARACION_REQUERIDA,
  MENSAJE_FRASE_REPARACION_INVALIDA,
  MENSAJE_MOTIVO_IMPUGNACION_INVALIDO,
  informarReparacionWorkflow,
  puedeInformarReparacion,
  resolverEvidenciaReparacionWorkflow,
  resolverImpugnacionReparacionWorkflow,
  verificarReparacionWorkflow,
  type AccionEvidenciaAdministrativa,
  type DecisionImpugnacionReparacion,
  type TipoVerificacionReparacion,
} from "@/lib/use-cases/reportes/evidencia-reparacion"
import { canParticipateInCommunity, getUserRoleContext, puedeOperarCuadrillas } from "@/lib/authz/roles"
import { verificarCaptchaDeAccion } from "@/lib/security/turnstile-guard.server"
import { createAdminClient } from "@/utils/supabase/admin"
import { createClient } from "@/utils/supabase/server"

// Keep the existing integer policy: Zod 4's .int() additionally enforces safe integers.
const reportIdSchema = z.coerce.number().positive().refine(Number.isInteger, "Expected integer, received float")
const commentIdSchema = reportIdSchema
const contributionSchema = z.string().refine((value) => parseAporteKey(value) !== null, "Elegí una actualización válida.")
const stateIdSchema = reportIdSchema
const photoIdSchema = reportIdSchema
const evidenciaIdSchema = z.string().uuid()
// La evidencia no acepta texto libre: solo la clave de una frase del catálogo (S16).
const fraseReparacionSchema = z.string().trim()
  .refine((value) => parseFraseReparacion(value) !== null, MENSAJE_FRASE_REPARACION_INVALIDA)
const reportPhotoSchema = z.instanceof(File)
const reportEditSchema = z.object({
  titulo: z.string().trim().min(3).max(120),
  descripcion: z.string().trim().min(10).max(5000),
  categoriaId: z.number().int().positive(),
  prioridadId: z.number().int().positive(),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
}).strict().partial()
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: "Tenés que indicar al menos un campo editable.",
  })
  .refine((value) => {
    const updatesLocation = value.lat !== undefined || value.lon !== undefined
    return !updatesLocation || (value.lat !== undefined && value.lon !== undefined)
  }, { message: "La latitud y longitud deben indicarse juntas." })
type ReportEditInput = z.infer<typeof reportEditSchema>

/** Preserve the scalar validation errors already returned by these public actions. */
function mutationErrorMessage(error: unknown, fallback: string) {
  if (!(error instanceof z.ZodError)) return workflowErrorMessage(error, fallback)
  return JSON.stringify(error.issues.map((issue) => {
    if (issue.code === "too_small") {
      return { code: issue.code, minimum: issue.minimum, type: "number", inclusive: issue.inclusive, exact: false, message: "Number must be greater than 0", path: issue.path }
    }
    if ((issue.code === "custom" && issue.message === "Expected integer, received float") || (issue.code === "invalid_type" && "received" in issue && issue.received === "Infinity")) {
      return { code: "invalid_type", expected: "integer", received: "float", message: "Expected integer, received float", path: issue.path }
    }
    if (issue.code === "invalid_type" && "received" in issue && issue.received === "NaN") {
      return { code: issue.code, expected: "number", received: "nan", path: issue.path, message: "Expected number, received nan" }
    }
    if (issue.code === "custom") return { code: issue.code, message: issue.message, path: issue.path }
    return issue
  }), null, 2)
}

const GUEST_COMMUNITY_ERROR = "Vinculá tu correo para comentar y votar. Como invitado podés crear y seguir tus reportes."

/**
 * Action que Turnstile vincula al aporte público. `components/report-detail/comments-section.tsx`
 * renderiza el challenge con el mismo valor, así un token emitido para otro formulario no
 * puede reutilizarse acá. Las votaciones quedan sin CAPTCHA: ya exigen identidad permanente y
 * un único voto por reporte.
 */
const ACCION_CAPTCHA_COMENTARIO = "comentar_reporte"

/**
 * Action que Turnstile vincula al formulario de evidencia de reparación. El widget de la
 * ficha del reporte debe emitir el token con este mismo valor, así un token de otro
 * formulario no sirve para subir una fotografía (S12).
 */
const ACCION_CAPTCHA_INFORMAR_REPARACION = "informar_reparacion"

/**
 * Exige la verificación anti bots del aporte público. Se ejecuta después de autorizar a quien
 * comenta y antes del workflow, así un token rechazado no publica, no suma puntos ni envía la
 * notificación al dueño del reporte.
 *
 * @param captchaToken - Token de un solo uso emitido por el challenge del formulario.
 * @returns Texto de error a devolver, o `null` cuando el aporte puede publicarse.
 */
async function verificarCaptchaDeComentario(captchaToken: string | null | undefined): Promise<string | null> {
  const resultado = await verificarCaptchaDeAccion({
    token: captchaToken,
    expectedAction: ACCION_CAPTCHA_COMENTARIO,
  })

  return resultado.ok ? null : resultado.mensaje
}

/**
 * Publica un aporte de la comunidad en un reporte.
 *
 * @param reporteId - Reporte que recibe el aporte.
 * @param aporte - Clave del aporte elegido en el formulario de actualizaciones.
 * @param captchaToken - Token Turnstile del challenge resuelto para esta publicación.
 * @returns Aporte creado y puntos otorgados, o el error en español que se muestra en el formulario.
 */
export async function crearComentarioAction(reporteId: number, aporte: string, captchaToken?: string | null) {
  try {
    const parsedReportId = reportIdSchema.parse(reporteId)
    const parsedAporte = parseAporteKey(contributionSchema.parse(aporte))
    if (!parsedAporte) return { success: false as const, error: "Elegí una actualización válida." }
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { success: false as const, error: "Tenés que iniciar sesión para comentar." }
    }

    const { data: contextoRol } = await getUserRoleContext(supabase, user.id)
    if (!canParticipateInCommunity(user, contextoRol?.roleId)) {
      return { success: false as const, error: GUEST_COMMUNITY_ERROR }
    }

    const captchaError = await verificarCaptchaDeComentario(captchaToken)
    if (captchaError) {
      return { success: false as const, error: captchaError }
    }

    return await crearComentarioWorkflow(createAdminClient(), parsedReportId, user.id, parsedAporte)
  } catch (error) {
    return { success: false as const, error: mutationErrorMessage(error, "No pudimos publicar tu comentario.") }
  }
}
export async function votarNoExisteAction(reporteId: number) {
  try {
    const parsedReportId = reportIdSchema.parse(reporteId)
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { success: false as const, error: "Tenés que iniciar sesión para votar." }
    }

    const { data: contextoRol } = await getUserRoleContext(supabase, user.id)
    if (!canParticipateInCommunity(user, contextoRol?.roleId)) {
      return { success: false as const, error: GUEST_COMMUNITY_ERROR }
    }

    if (puedeOperarCuadrillas(contextoRol?.roleId)) {
      return { success: false as const, error: "Los operadores y administradores no pueden votar." }
    }

    return await votarNoExisteWorkflow(createAdminClient(), parsedReportId, user.id)
  } catch (error) {
    return { success: false as const, error: mutationErrorMessage(error, "No pudimos registrar tu voto.") }
  }
}

/**
 * Forma que todavía consume la ficha del reporte. La acción ya nunca devuelve éxito
 * (S15): la rama exitosa existe solo para que el cliente anterior siga compilando
 * hasta que la interfaz de evidencia la reemplace.
 */
type ResultadoVotoReparadoRetirado =
  | {
      success: true
      data: {
        count: number
        votosNoExiste: number
        votosReparado: number
        primero: boolean
        cambio: boolean
        stateChangedTo: number | null
        needsAdminReview: boolean
      }
    }
  | { success: false; error: string }

/**
 * El voto comunitario «reparado» fue reemplazado por la evidencia fotográfica y su
 * verificación comunitaria (S15). La acción se conserva para que el cliente anterior
 * reciba un mensaje claro: nunca escribe estado, puntos ni cierra el reporte.
 *
 * @param reporteId - Reporte sobre el que se intentó votar.
 * @returns Siempre un rechazo explicativo; el identificador se valida igual que antes.
 */
export async function votarReparadoAction(reporteId: number): Promise<ResultadoVotoReparadoRetirado> {
  try {
    reportIdSchema.parse(reporteId)
    return {
      success: false as const,
      error: "El voto «reparado» fue reemplazado: informá la reparación con una foto y la comunidad la verifica.",
    }
  } catch (error) {
    return { success: false as const, error: mutationErrorMessage(error, "No pudimos registrar tu voto.") }
  }
}

export async function eliminarComentarioPropioAction(comentarioId: number) {
  try {
    const parsedCommentId = commentIdSchema.parse(comentarioId)
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { success: false as const, error: "Tenés que iniciar sesión para eliminar el comentario." }
    }

    return await eliminarComentarioPropioWorkflow(createAdminClient(), parsedCommentId, user.id)
  } catch (error) {
    return { success: false as const, error: mutationErrorMessage(error, "No pudimos eliminar el comentario.") }
  }
}

export async function eliminarComentarioAdminAction(comentarioId: number) {
  try {
    const parsedCommentId = commentIdSchema.parse(comentarioId)
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { success: false as const, error: "Tenés que iniciar sesión para eliminar el comentario." }
    }

    return await eliminarComentarioAdminWorkflow(createAdminClient(), parsedCommentId, user.id)
  } catch (error) {
    return { success: false as const, error: mutationErrorMessage(error, "No pudimos eliminar el comentario.") }
  }
}

export async function eliminarReportePropioAction(reporteId: number) {
  try {
    const parsedReportId = reportIdSchema.parse(reporteId)
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { success: false as const, error: "Tenés que iniciar sesión para eliminar el reporte." }
    }

    return await eliminarReportePropioWorkflow(createAdminClient(), parsedReportId, user.id)
  } catch (error) {
    return { success: false as const, error: mutationErrorMessage(error, "No pudimos eliminar el reporte.") }
  }
}

export async function eliminarReporteAdminAction(reporteId: number) {
  try {
    const parsedReportId = reportIdSchema.parse(reporteId)
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { success: false as const, error: "Tenés que iniciar sesión para eliminar el reporte." }
    }

    return await eliminarReporteAdminWorkflow(createAdminClient(), parsedReportId, user.id)
  } catch (error) {
    return { success: false as const, error: mutationErrorMessage(error, "No pudimos eliminar el reporte.") }
  }
}

export async function actualizarReporteAdminAction(reporteId: number, input: ReportEditInput) {
  try {
    const parsedReportId = reportIdSchema.parse(reporteId)
    const parsedInput = reportEditSchema.parse(input)
    const session = await createClient()
    const { data: { user } } = await session.auth.getUser()

    if (!user || user.is_anonymous) {
      return { success: false as const, error: "Tenés que iniciar sesión para editar el reporte." }
    }

    const result = await actualizarDatosReporteAdminWorkflow(
      createAdminClient(), parsedReportId, user.id, parsedInput,
    )
    if (result.success) revalidatePath(`/reportes/${parsedReportId}`)
    return result
  } catch (error) {
    return { success: false as const, error: mutationErrorMessage(error, "No pudimos editar el reporte.") }
  }
}

export async function reemplazarFotoReporteAdminAction(reporteId: number, fotoId: number, image: File) {
  try {
    const parsedReportId = reportIdSchema.parse(reporteId)
    const parsedPhotoId = photoIdSchema.parse(fotoId)
    const parsedImage = reportPhotoSchema.parse(image)
    const session = await createClient()
    const { data: { user } } = await session.auth.getUser()
    if (!user || user.is_anonymous) return { success: false as const, error: "Tenés que iniciar sesión para editar la foto." }

    const result = await reemplazarFotoReporteAdminWorkflow(createAdminClient(), parsedReportId, parsedPhotoId, user.id, parsedImage)
    if (result.success) revalidatePath(`/reportes/${parsedReportId}`)
    return result
  } catch (error) {
    return { success: false as const, error: mutationErrorMessage(error, "No pudimos reemplazar la foto.") }
  }
}

export async function quitarFotoReporteAdminAction(reporteId: number, fotoId: number) {
  try {
    const parsedReportId = reportIdSchema.parse(reporteId)
    const parsedPhotoId = photoIdSchema.parse(fotoId)
    const session = await createClient()
    const { data: { user } } = await session.auth.getUser()
    if (!user || user.is_anonymous) return { success: false as const, error: "Tenés que iniciar sesión para editar la foto." }

    const result = await quitarFotoReporteAdminWorkflow(createAdminClient(), parsedReportId, parsedPhotoId, user.id)
    if (result.success) revalidatePath(`/reportes/${parsedReportId}`)
    return result
  } catch (error) {
    return { success: false as const, error: mutationErrorMessage(error, "No pudimos quitar la foto.") }
  }
}

export async function cambiarEstadoAdminAction(reporteId: number, nuevoEstadoId: number, comentario?: string) {
  try {
    const parsedReportId = reportIdSchema.parse(reporteId)
    const parsedStateId = stateIdSchema.parse(nuevoEstadoId)
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { success: false as const, error: "Tenés que iniciar sesión para cambiar el estado." }
    }

    return await cambiarEstadoAdminWorkflow(createAdminClient(), parsedReportId, parsedStateId, user.id, comentario)
  } catch (error) {
    return { success: false as const, error: mutationErrorMessage(error, "No pudimos actualizar el estado del reporte.") }
  }
}

const MENSAJE_EVIDENCIA_INVALIDA = "No pudimos identificar la evidencia de reparación."

/**
 * Resuelve una sesión habilitada para el flujo de reparaciones con el cliente de sesión
 * y el catálogo de roles. La autorización se repite en el caso de uso y en la RPC (S12).
 *
 * @param mensajeSinSesion - Texto que recibe quien todavía no inició sesión.
 * @returns La cuenta autenticada o el error que se muestra en el formulario.
 */
async function sesionParaReparaciones(mensajeSinSesion: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: mensajeSinSesion } as const

  const { data: contextoRol } = await getUserRoleContext(supabase, user.id)
  if (!puedeInformarReparacion(user, contextoRol?.roleId)) {
    return { error: MENSAJE_CUENTA_REPARACION_REQUERIDA } as const
  }
  return { usuario: user } as const
}

/**
 * Informa una reparación con su fotografía y la frase elegida de la lista (S1, S16).
 * La foto pasa por la validación de archivo y por el sistema de moderación existente,
 * con verificación anti bots; el reporte no cambia de estado por subir la foto (S2).
 * Una frase que no está en el catálogo se rechaza antes de la sesión, del CAPTCHA y de
 * cualquier escritura.
 *
 * @param reporteId - Reporte que se informa como reparado.
 * @param frase - Clave de la frase del catálogo elegida en el formulario.
 * @param image - Fotografía ya optimizada en el navegador.
 * @param captchaToken - Token Turnstile del challenge resuelto para esta carga.
 * @returns Evidencia creada con su estado visible, o el error en español.
 */
export async function informarReparacionAction(
  reporteId: number,
  frase: string,
  image: File,
  captchaToken?: string | null,
) {
  try {
    const parsedReportId = reportIdSchema.parse(reporteId)
    const parsedFrase = fraseReparacionSchema.safeParse(frase)
    if (!parsedFrase.success) {
      return { success: false as const, error: MENSAJE_FRASE_REPARACION_INVALIDA }
    }
    if (!(image instanceof File)) {
      return { success: false as const, error: "Adjuntá una fotografía de la reparación." }
    }

    const sesion = await sesionParaReparaciones("Tenés que iniciar sesión para informar una reparación.")
    if ("error" in sesion) return { success: false as const, error: sesion.error }

    const captcha = await verificarCaptchaDeAccion({
      token: captchaToken,
      expectedAction: ACCION_CAPTCHA_INFORMAR_REPARACION,
    })
    if (!captcha.ok) return { success: false as const, error: captcha.mensaje }

    const resultado = await informarReparacionWorkflow(createAdminClient(), parsedReportId, sesion.usuario.id, {
      frase: parsedFrase.data,
      image,
    })
    if (resultado.success) revalidatePath(`/reportes/${parsedReportId}`)
    return resultado
  } catch (error) {
    return { success: false as const, error: mutationErrorMessage(error, "No pudimos informar la reparación.") }
  }
}

/**
 * Confirma o impugna una reparación informada (S4, S6, S7). La RPC exige autoría
 * distinta, una sola verificación por cuenta y tres confirmaciones sin impugnaciones
 * pendientes; la acción solo valida la sesión, los identificadores y que el motivo sea
 * una frase del catálogo cerrado (S17).
 *
 * @param reporteId - Reporte de la evidencia, usado para revalidar su ficha.
 * @param evidenciaId - Evidencia en verificación.
 * @param tipo - «confirmacion» o «impugnacion».
 * @param fraseClave - Clave de la frase del catálogo; obligatoria al impugnar.
 * @returns Avance de la verificación, o el error en español que se muestra en la ficha.
 */
async function verificarReparacionAction(
  reporteId: number,
  evidenciaId: string,
  tipo: TipoVerificacionReparacion,
  fraseClave?: string,
) {
  try {
    const parsedReportId = reportIdSchema.parse(reporteId)
    const parsedEvidenciaId = evidenciaIdSchema.safeParse(evidenciaId)
    if (!parsedEvidenciaId.success) return { success: false as const, error: MENSAJE_EVIDENCIA_INVALIDA }

    const motivo = fraseClave === undefined ? undefined : fraseClave.trim()
    if (tipo === "impugnacion" && parseFraseImpugnacion(motivo) === null) {
      return { success: false as const, error: MENSAJE_MOTIVO_IMPUGNACION_INVALIDO }
    }

    const sesion = await sesionParaReparaciones("Tenés que iniciar sesión para confirmar o impugnar una reparación.")
    if ("error" in sesion) return { success: false as const, error: sesion.error }

    const resultado = await verificarReparacionWorkflow(
      createAdminClient(), parsedEvidenciaId.data, sesion.usuario.id, tipo, motivo,
    )
    if (resultado.success) revalidatePath(`/reportes/${parsedReportId}`)
    return resultado
  } catch (error) {
    return { success: false as const, error: mutationErrorMessage(error, "No pudimos registrar tu verificación.") }
  }
}

/**
 * Confirma que la reparación informada es real.
 *
 * @param reporteId - Reporte de la evidencia, usado para revalidar su ficha.
 * @param evidenciaId - Evidencia en verificación.
 */
export async function confirmarReparacionAction(reporteId: number, evidenciaId: string) {
  return verificarReparacionAction(reporteId, evidenciaId, "confirmacion")
}

/**
 * Impugna una reparación informada; el motivo es una frase obligatoria del catálogo (S4, S5, S17).
 *
 * @param reporteId - Reporte de la evidencia, usado para revalidar su ficha.
 * @param evidenciaId - Evidencia en verificación.
 * @param motivo - Clave de la frase que explica por qué la reparación no está hecha.
 */
export async function impugnarReparacionAction(reporteId: number, evidenciaId: string, motivo: string) {
  return verificarReparacionAction(reporteId, evidenciaId, "impugnacion", motivo)
}

/**
 * Aprobación, rechazo o reversión administrativa de una evidencia (S8). Aprobar exige
 * la foto publicada; revertir una evidencia validada devuelve el reporte a Pendiente.
 *
 * @param reporteId - Reporte de la evidencia, usado para revalidar su ficha.
 * @param evidenciaId - Evidencia que se resuelve.
 * @param accion - «aprobar», «rechazar» o «revertir».
 * @param motivo - Motivo opcional que queda en la auditoría y en el historial.
 * @returns Resultado durable de la evidencia, o el error en español.
 */
export async function resolverEvidenciaReparacionAdminAction(
  reporteId: number,
  evidenciaId: string,
  accion: AccionEvidenciaAdministrativa,
  motivo?: string,
) {
  try {
    const parsedReportId = reportIdSchema.parse(reporteId)
    const parsedEvidenciaId = evidenciaIdSchema.safeParse(evidenciaId)
    if (!parsedEvidenciaId.success) return { success: false as const, error: MENSAJE_EVIDENCIA_INVALIDA }
    if (accion !== "aprobar" && accion !== "rechazar" && accion !== "revertir") {
      return { success: false as const, error: "Acción administrativa inválida." }
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user || user.is_anonymous) {
      return { success: false as const, error: "Tenés que iniciar sesión para revisar la evidencia." }
    }

    const resultado = await resolverEvidenciaReparacionWorkflow(
      createAdminClient(), parsedEvidenciaId.data, user.id, accion, (motivo ?? "").trim() || undefined,
    )
    if (resultado.success) revalidatePath(`/reportes/${parsedReportId}`)
    return resultado
  } catch (error) {
    return { success: false as const, error: mutationErrorMessage(error, "No pudimos resolver la evidencia.") }
  }
}

/**
 * Acepta o descarta una impugnación pendiente (S5, S8). Aceptarla rechaza la evidencia y
 * el reporte sigue pendiente; descartarla reevalúa el umbral de confirmaciones.
 *
 * @param reporteId - Reporte de la evidencia, usado para revalidar su ficha.
 * @param verificacionId - Impugnación pendiente.
 * @param decision - «aceptada» o «descartada».
 * @param motivo - Motivo opcional de la decisión administrativa.
 * @returns Resultado durable de la impugnación, o el error en español.
 */
export async function resolverImpugnacionReparacionAdminAction(
  reporteId: number,
  verificacionId: string,
  decision: DecisionImpugnacionReparacion,
  motivo?: string,
) {
  try {
    const parsedReportId = reportIdSchema.parse(reporteId)
    const parsedVerificacionId = evidenciaIdSchema.safeParse(verificacionId)
    if (!parsedVerificacionId.success) return { success: false as const, error: MENSAJE_EVIDENCIA_INVALIDA }
    if (decision !== "aceptada" && decision !== "descartada") {
      return { success: false as const, error: "Elegí aceptar o descartar la impugnación." }
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user || user.is_anonymous) {
      return { success: false as const, error: "Tenés que iniciar sesión para revisar la evidencia." }
    }

    const resultado = await resolverImpugnacionReparacionWorkflow(
      createAdminClient(), parsedVerificacionId.data, user.id, decision, (motivo ?? "").trim() || undefined,
    )
    if (resultado.success) revalidatePath(`/reportes/${parsedReportId}`)
    return resultado
  } catch (error) {
    return { success: false as const, error: mutationErrorMessage(error, "No pudimos resolver la impugnación.") }
  }
}
