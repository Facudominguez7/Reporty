export const ROLE_IDS = {
  ADMIN: 1,
  CIUDADANO: 2,
  INTERESADO: 3,
  OPERADOR: 4,
  /** Anonymous guest identity (Supabase Anonymous Sign-Ins). Assigned and promoted by the DB trigger. */
  INVITADO: 5,
} as const;

export type RoleId = (typeof ROLE_IDS)[keyof typeof ROLE_IDS];

export const REPORT_STATE_IDS = {
  PENDIENTE: 1,
  REPARADO: 2,
  RECHAZADO: 3,
} as const;

export const REPORT_STATUS_VOTE_THRESHOLD = 5;

export type ReportStateId =
  (typeof REPORT_STATE_IDS)[keyof typeof REPORT_STATE_IDS];

export const REPORT_BUCKET = "reportes" as const;

export const REPORT_CREATOR_ROLE_IDS = [
  ROLE_IDS.ADMIN,
  ROLE_IDS.CIUDADANO,
  ROLE_IDS.INVITADO,
] as const;

export const DASHBOARD_ROLE_IDS = [
  ROLE_IDS.ADMIN,
  ROLE_IDS.INTERESADO,
  ROLE_IDS.OPERADOR,
] as const;

export const ADMIN_REPORT_STATE_IDS = [
  REPORT_STATE_IDS.REPARADO,
  REPORT_STATE_IDS.RECHAZADO,
] as const;

/** Roles habilitados para administrar el catálogo de cuadrillas (alta, edición, activación). */
export const CREW_MANAGEMENT_ROLE_IDS = [
  ROLE_IDS.ADMIN,
  ROLE_IDS.OPERADOR,
] as const;

/** Roles habilitados para operar cuadrillas: asignar reportes, registrar observaciones y cerrar intervenciones. */
export const CREW_OPERATION_ROLE_IDS = [
  ROLE_IDS.ADMIN,
  ROLE_IDS.OPERADOR,
] as const;

/** Estados operativos de una asignación de cuadrilla a un reporte (distintos del estado administrativo del reporte). */
export const ESTADOS_OPERATIVOS = {
  EN_PROGRESO: "en_progreso",
  CERRADA: "cerrada",
} as const;

export type EstadoOperativo =
  (typeof ESTADOS_OPERATIVOS)[keyof typeof ESTADOS_OPERATIVOS];

/** Motivos de cierre que solo cierran la intervención de la cuadrilla, sin tocar `reportes.estado_id`. */
export const MOTIVOS_CIERRE_OPERATIVOS = [
  "cancelada",
  "reasignada",
] as const;

export type MotivoCierreOperativo = (typeof MOTIVOS_CIERRE_OPERATIVOS)[number];

/** Motivos de cierre que resuelven el reporte (`reportes.estado_id`): pueden aplicarlos ADMIN y OPERADOR. */
export const MOTIVOS_CIERRE_RESOLUTIVOS = [
  "reparado",
  "rechazado",
] as const;

export type MotivoCierreResolutivo =
  (typeof MOTIVOS_CIERRE_RESOLUTIVOS)[number];

export type MotivoCierre = MotivoCierreOperativo | MotivoCierreResolutivo;

/**
 * Etiquetas en español para cada estado operativo. El tipado `Record` exhaustivo
 * hace que `tsc` falle si se agrega un estado nuevo sin su etiqueta correspondiente.
 */
export const ETIQUETAS_ESTADO_OPERATIVO: Record<EstadoOperativo, string> = {
  en_progreso: "En progreso",
  cerrada: "Intervención cerrada",
};

/**
 * Etiquetas en español para cada motivo de cierre. El tipado `Record` exhaustivo
 * hace que `tsc` falle si se agrega un motivo nuevo sin su etiqueta correspondiente.
 */
export const ETIQUETAS_MOTIVO_CIERRE: Record<MotivoCierre, string> = {
  cancelada: "Intervención cancelada",
  reasignada: "Reasignada a otra cuadrilla",
  reparado: "Confirmado como reparado",
  rechazado: "Confirmado como rechazado",
};
