import { getPuntosUsuario } from "@/database/queries/puntos"
import type {
  ReportesPorCategoria,
  TiempoPromedioResolucion,
  ZonaConReportes,
} from "@/database/queries/interesado"
import { getDashboardUserReports, type DashboardUserReport, type FiltrosReportes } from "@/database/queries/reportes/get-reportes"
import { getUserRoleContext } from "@/lib/authz/roles"
import { createClient } from "@/utils/supabase/server"

export type DashboardAnalyticsData = {
  totalReportes: number
  reportesResueltos: number
  reportesPendientes: number
  reportesEnProgreso: number
  tasaResolucion: number
}

export type DashboardPageData = {
  user: {
    id: string
    email: string | null
    /** Nombre de usuario público (`profiles.username`), editable desde «Mi cuenta». */
    username: string | null
  } | null
  isAnalyticsDashboard: boolean
  /** Rol persistido del usuario (`profiles.rol_id`), para decidir qué accesos operativos mostrar. */
  roleId: number | null
  puntos: number
  userReports: DashboardUserReport[]
  estadisticas: DashboardAnalyticsData | null
  reportesPorCategoria: ReportesPorCategoria[]
  tiempoResolucion: TiempoPromedioResolucion | null
  zonasCalientes: ZonaConReportes[]
}

/**
 * Reúne los datos de «Mi cuenta» para la persona de la sesión: rol, puntos, reportes propios y
 * nombre de usuario.
 *
 * @param filtros - Filtros de la lista de reportes propios.
 * @returns Los datos de la página, con `user: null` si no hay sesión.
 */
export async function getDashboardPageData(
  filtros: Pick<FiltrosReportes, "search" | "categoria" | "estado" | "prioridad"> = {},
): Promise<DashboardPageData> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return {
      user: null,
      isAnalyticsDashboard: false,
      roleId: null,
      puntos: 0,
      userReports: [],
      estadisticas: null,
      reportesPorCategoria: [],
      tiempoResolucion: null,
      zonasCalientes: [],
    }
  }

  const { data: roleContext } = await getUserRoleContext(supabase, user.id)
  // Role-specific analytics live in /admin; /dashboard is the personal dashboard for every authenticated role.
  const [{ puntos }, { data: userReports }, { data: perfil }] = await Promise.all([
    getPuntosUsuario(supabase, user.id),
    getDashboardUserReports(user.id, filtros),
    // Cada persona puede leer su propio perfil (RLS de `profiles`).
    supabase.from("profiles").select("username").eq("id", user.id).maybeSingle(),
  ])

  return {
    user: { id: user.id, email: user.email ?? null, username: perfil?.username ?? null },
    isAnalyticsDashboard: false,
    roleId: roleContext?.roleId ?? null,
    puntos,
    userReports,
    estadisticas: null,
    reportesPorCategoria: [],
    tiempoResolucion: null,
    zonasCalientes: [],
  }
}
