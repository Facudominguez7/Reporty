"use server"

import { z } from "zod"
import { parseAporteKey } from "@/lib/reportes/aportes"

import {
  cambiarEstadoAdminWorkflow,
  crearComentarioWorkflow,
  eliminarComentarioAdminWorkflow,
  eliminarComentarioPropioWorkflow,
  eliminarReporteAdminWorkflow,
  eliminarReportePropioWorkflow,
  mutationErrorMessage,
  votarNoExisteWorkflow,
  votarReparadoWorkflow,
} from "@/lib/use-cases/reportes"
import { canParticipateInCommunity, getUserRoleContext, puedeOperarCuadrillas } from "@/lib/authz/roles"
import { createAdminClient } from "@/utils/supabase/admin"
import { createClient } from "@/utils/supabase/server"

const reportIdSchema = z.coerce.number().int().positive()
const commentIdSchema = z.coerce.number().int().positive()
const contributionSchema = z.string().refine((value) => parseAporteKey(value) !== null, "Elegí una actualización válida.")
const stateIdSchema = z.coerce.number().int().positive()

const GUEST_COMMUNITY_ERROR = "Vinculá tu correo para comentar y votar. Como invitado podés crear y seguir tus reportes."

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

export async function votarReparadoAction(reporteId: number) {
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

    return await votarReparadoWorkflow(createAdminClient(), parsedReportId, user.id)
  } catch (error) {
    return { success: false as const, error: mutationErrorMessage(error, "No pudimos registrar tu voto.") }
  }
}

export async function crearComentarioAction(reporteId: number, aporte: string) {
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

    return await crearComentarioWorkflow(createAdminClient(), parsedReportId, user.id, parsedAporte)
  } catch (error) {
    return { success: false as const, error: mutationErrorMessage(error, "No pudimos publicar tu comentario.") }
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
