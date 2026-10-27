import type { PostgrestError, SupabaseClient, User } from "@supabase/supabase-js";

import {
  CREW_MANAGEMENT_ROLE_IDS,
  CREW_OPERATION_ROLE_IDS,
  DASHBOARD_ROLE_IDS,
  REPORT_CREATOR_ROLE_IDS,
  ROLE_IDS,
  type RoleId,
} from "./catalog";

type RoleRelation =
  | {
      nombre: string | null;
    }
  | Array<{
      nombre: string | null;
    }>
  | null;

type ProfileRoleRow = {
  rol_id: number | null;
  roles: RoleRelation;
};

export type UserRoleContext = {
  roleId: RoleId | null;
  roleName: string | null;
};

function getRoleName(roles: RoleRelation) {
  if (Array.isArray(roles)) {
    return roles[0]?.nombre ?? null;
  }

  return roles?.nombre ?? null;
}

/**
 * Normaliza un `rol_id` crudo de la base de datos a un `RoleId` válido del catálogo.
 * Valida por pertenencia a `ROLE_IDS` (no por literales enumerados a mano) para que
 * un rol nuevo agregado al catálogo funcione acá sin tocar esta función de nuevo.
 */
function toRoleId(roleId: number | null | undefined): RoleId | null {
  const idsValidos = Object.values(ROLE_IDS) as number[];
  if (idsValidos.includes(roleId as number)) {
    return roleId as RoleId;
  }

  return null;
}

export async function getUserRoleContext(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ data: UserRoleContext | null; error: PostgrestError | null }> {
  const { data, error } = await supabase
    .from("profiles")
    .select("rol_id, roles (nombre)")
    .eq("id", userId)
    .single();

  if (error) {
    return { data: null, error };
  }

  return {
    data: {
      roleId: toRoleId(data?.rol_id),
      roleName: getRoleName((data as ProfileRoleRow | null)?.roles ?? null),
    },
    error: null,
  };
}

export function canCreateReports(roleId: number | null | undefined) {
  return REPORT_CREATOR_ROLE_IDS.includes(roleId as (typeof REPORT_CREATOR_ROLE_IDS)[number]);
}

export function canViewDashboard(roleId: number | null | undefined) {
  return DASHBOARD_ROLE_IDS.includes(roleId as (typeof DASHBOARD_ROLE_IDS)[number]);
}

/** Roles that can enter the role-aware administrative workspace. */
export function canAccessAdminPanel(roleId: number | null | undefined) {
  return canViewDashboard(roleId);
}

export function isAdminRole(roleId: number | null | undefined) {
  return roleId === ROLE_IDS.ADMIN;
}

/** Indica si el rol puede administrar el catálogo de cuadrillas (alta, edición, activación). */
export function puedeGestionarCuadrillas(roleId: number | null | undefined) {
  return CREW_MANAGEMENT_ROLE_IDS.includes(roleId as (typeof CREW_MANAGEMENT_ROLE_IDS)[number]);
}

/** Indica si el rol puede operar cuadrillas: asignar reportes, observar y cerrar intervenciones. */
export function puedeOperarCuadrillas(roleId: number | null | undefined) {
  return CREW_OPERATION_ROLE_IDS.includes(roleId as (typeof CREW_OPERATION_ROLE_IDS)[number]);
}

/** Whether the role is the anonymous guest role assigned to Supabase anonymous users. */
export function isGuestRole(roleId: number | null | undefined) {
  return roleId === ROLE_IDS.INVITADO;
}

/**
 * Whether the user is a Supabase anonymous identity. Only trust users returned by
 * `auth.getUser()`, which validates the session against Supabase Auth.
 */
export function isAnonymousUser(user: Pick<User, "is_anonymous"> | null | undefined) {
  return user?.is_anonymous === true;
}

/**
 * Community features (comments, votes, points, ranking) require a permanent identity:
 * both the verified auth flag and the DB role must say the user is not a guest.
 */
export function canParticipateInCommunity(
  user: Pick<User, "is_anonymous"> | null | undefined,
  roleId: number | null | undefined,
) {
  return Boolean(user) && !isAnonymousUser(user) && !isGuestRole(roleId);
}

/**
 * Votes on a report ("no existe" / "reparado") come from the community: guests cannot vote,
 * and neither can admins or operators, who close reports through their own tools.
 */
export function puedeVotarReportes(
  user: Pick<User, "is_anonymous"> | null | undefined,
  roleId: number | null | undefined,
) {
  return canParticipateInCommunity(user, roleId) && !isAdminRole(roleId) && !esRolOperador(roleId);
}

/** Indica si el rol es exactamente OPERADOR municipal. */
export function esRolOperador(roleId: number | null | undefined) {
  return roleId === ROLE_IDS.OPERADOR;
}
