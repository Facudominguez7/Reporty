export const APORTES_COMUNITARIOS = [
  { key: "problema_sigue_igual", label: "El problema sigue igual" },
  { key: "problema_empeoro", label: "El problema empeoró" },
  { key: "problema_mejoro_continua", label: "El problema mejoró, pero continúa" },
  { key: "problema_ya_no_visible", label: "Ya no veo el problema" },
  { key: "me_comunique_area_responsable", label: "Me comuniqué con el área responsable" },
  { key: "comenzaron_trabajos", label: "Vi que comenzaron los trabajos" },
  { key: "trabajos_detenidos", label: "Los trabajos parecen estar detenidos" },
] as const

export type AporteKey = (typeof APORTES_COMUNITARIOS)[number]["key"]

export function parseAporteKey(value: unknown): AporteKey | null {
  return typeof value === "string" && APORTES_COMUNITARIOS.some((aporte) => aporte.key === value)
    ? (value as AporteKey)
    : null
}

export type ActivityComment = {
  id: number
  reporte_id: number
  usuario_id: string
  contenido: string
  tipo_aporte?: string | null
  created_at: string
  profiles: { username: string } | { username: string }[]
}

type StatusHistory = {
  id: number
  reporte_id: number
  estado_nuevo_id: number
  created_at: string
  comentario: string | null
  estado_nuevo?: { id: number; nombre: string } | { id: number; nombre: string }[] | null
  usuario?: { username: string | null } | null
}

export function mergeReportActivity(comments: ActivityComment[], history: StatusHistory[]) {
  const entries = [
    ...comments.map((comment) => ({
      kind: "contribution" as const,
      id: `comment-${comment.id}`,
      createdAt: comment.created_at,
      content: comment.contenido,
      username: Array.isArray(comment.profiles) ? comment.profiles[0]?.username ?? "Usuario" : comment.profiles.username,
      legacy: !comment.tipo_aporte,
    })),
    ...history.map((event) => {
      const state = Array.isArray(event.estado_nuevo) ? event.estado_nuevo[0] : event.estado_nuevo
      return {
        kind: "status" as const,
        id: `status-${event.id}`,
        createdAt: event.created_at,
        content: `El reporte cambió a ${state?.nombre ?? "un nuevo estado"}`,
        detail: event.comentario,
        username: event.usuario?.username ?? "Sistema",
        legacy: false,
      }
    }),
  ]

  return entries.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id))
}
