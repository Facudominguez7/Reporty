import "server-only"

import { getUserRoleContext, isAdminRole } from "@/lib/authz/roles"
import type { EstadoDonacion } from "@/lib/donaciones/mercado-pago.server"
import { calcularTotales, mesActual, rangoDelMes, type DonacionPanel, type FiltrosDonaciones } from "@/lib/donaciones/panel"
import { createAdminClient } from "@/utils/supabase/admin"
import { createClient } from "@/utils/supabase/server"

/** Tope de filas que se leen por consulta; el panel lo avisa si se alcanza. */
export const LIMITE_DONACIONES = 1000

type FilaDonacion = {
  id: string
  pago_id: string
  created_at: string
  monto: number | string
  estado: EstadoDonacion
  estado_mp: string
  nombre: string | null
  mensaje: string | null
  usuario: { username: string | null } | Array<{ username: string | null }> | null
}

/**
 * Pasa una fila de Supabase al formato del panel. `numeric` llega como texto desde PostgREST.
 */
function mapearFila(fila: FilaDonacion): DonacionPanel {
  const usuario = Array.isArray(fila.usuario) ? fila.usuario[0] : fila.usuario
  return {
    id: fila.id,
    pagoId: fila.pago_id,
    fecha: fila.created_at,
    monto: Number(fila.monto),
    estado: fila.estado,
    estadoMp: fila.estado_mp,
    nombre: fila.nombre,
    mensaje: fila.mensaje,
    usuario: usuario?.username ?? null,
  }
}

/**
 * Verifica que quien consulta sea admin. Las donaciones se leen con service role, así que
 * esta es la única barrera: nunca llamar a las consultas de abajo sin pasar por acá.
 */
async function esAdmin(): Promise<boolean> {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) return false
  const { data: rol, error } = await getUserRoleContext(supabase, data.user.id)
  return !error && isAdminRole(rol?.roleId)
}

/**
 * Lista las donaciones filtradas (más nuevas primero) para el panel o el CSV.
 */
export async function listarDonaciones(filtros: FiltrosDonaciones) {
  if (!(await esAdmin())) return { autorizado: false as const }

  let consulta = createAdminClient()
    .from("donaciones")
    .select("id,pago_id,created_at,monto,estado,estado_mp,nombre,mensaje,usuario:profiles(username)")
    .order("created_at", { ascending: false })
    .limit(LIMITE_DONACIONES)
  if (filtros.estado) consulta = consulta.eq("estado", filtros.estado)
  if (filtros.mes) {
    const { desde, hasta } = rangoDelMes(filtros.mes)
    consulta = consulta.gte("created_at", desde).lt("created_at", hasta)
  }

  const { data, error } = await consulta.returns<FilaDonacion[]>()
  if (error) throw new Error(`No se pudieron leer las donaciones: ${error.message}`)
  return { autorizado: true as const, donaciones: (data ?? []).map(mapearFila) }
}

/**
 * Lista y totales del panel: total histórico aprobado y total aprobado del mes en curso.
 */
export async function obtenerPanelDonaciones(filtros: FiltrosDonaciones) {
  const listado = await listarDonaciones(filtros)
  if (!listado.autorizado) return listado

  const { data, error } = await createAdminClient()
    .from("donaciones")
    .select("monto,aprobada_at,created_at")
    .eq("estado", "aprobada")
    .returns<Array<{ monto: number | string; aprobada_at: string | null; created_at: string }>>()
  if (error) throw new Error(`No se pudieron sumar las donaciones: ${error.message}`)

  const aprobadas = (data ?? []).map((fila) => ({ monto: Number(fila.monto), fecha: new Date(fila.aprobada_at ?? fila.created_at).toISOString() }))
  return { ...listado, totales: calcularTotales(aprobadas, mesActual()) }
}
