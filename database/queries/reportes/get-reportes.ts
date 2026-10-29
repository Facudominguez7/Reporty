/**
 * Query para obtener reportes con filtros
 * 
 * Permite filtrar reportes por:
 * - Texto de búsqueda (busca en título y descripción)
 * - Categoría
 * - Estado
 * - Prioridad
 */

import { unstable_cache } from "next/cache"

import { createClient } from "@/utils/supabase/server"
import { createPublicClient } from "@/utils/supabase/public"
import { getPublicProfilesByIds, indexPublicProfilesById } from "@/database/queries/profiles"
import { obtenerEstadoOperativoPublicoPorReporte } from "@/database/queries/cuadrillas"
import { cuadrillasHabilitadas } from "@/lib/features"
import {
  getPreferredReportListingImageUrl,
  getPrimaryReportImageUrl,
  isMissingReportImageColumnsError,
  resolveReportImageRows,
  type ReportImageRow,
} from "@/lib/media/report-images"
import { REPORT_STATE_IDS, type EstadoOperativo } from "@/lib/authz/catalog"
import type { ReportCardData } from "@/components/lista-reportes-client"

export type ReporteDB = {
  id: number
  usuario_id: string | null
  titulo: string
  descripcion: string | null
  created_at: string
  lat: number | null
  lon: number | null
  categoria: { nombre: string } | null
  prioridad: { nombre: string } | null
  estado: { nombre: string } | null
  autor: { username: string | null } | null
  fotos: (ReportImageRow & { publicUrl?: string | null })[] | null
}

type ReporteDBRaw = Omit<ReporteDB, "fotos"> & {
  fotos: ReportImageRow[] | null
}

export type ReportStatusCounts = {
  all: number
  resolved: number
  pending: number
}

export type FiltrosReportes = {
  search?: string
  categoria?: string
  estado?: string
  prioridad?: string
  soloConCoordenadas?: boolean
  /** Deja solo los reportes en estado Pendiente: el mapa muestra únicamente problemas abiertos. */
  soloPendientes?: boolean
  limite?: number
  offset?: number
}

export type ReportMapItem = {
  id: number
  title: string
  description: string
  category: string
  priority: string
  status: string
  location: string
  coordinates: [number, number]
  author: string
  createdAt: string
  image?: string
  estadoOperativo?: EstadoOperativo | null
  cuadrillaNombre?: string | null
}

export type DashboardUserReport = {
  id: number
  titulo: string
  descripcion: string
  categoria: string
  prioridad: string
  estado: string
  imageUrl: string | null
  createdAt: string
  autor: string
}

const CATEGORY_FILTER_IDS = {
  bache: 1,
  semaforo: 2,
  arbolcaido: 3,
  alumbrado: 4,
  residuos: 5,
  seguridad: 6,
  otros: 7,
  agua: 8,
} as const

const PRIORITY_FILTER_IDS = {
  alta: 1,
  media: 2,
  baja: 3,
} as const

const STATE_FILTER_IDS = {
  pendiente: 1,
  reparado: 2,
  rechazado: 3,
} as const

const FOLLOW_UP_FILTER = "seguimiento"

function normalizeFilterValue(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "")
}

function resolveLookupFilterId(
  filters: Record<string, number>,
  value: string | undefined,
) {
  if (!value || value === "all") {
    return null
  }

  return filters[normalizeFilterValue(value)] ?? null
}

function getSingleRelationName<T extends { nombre: string }>(
  relation: T | T[] | null,
  fallback: string,
) {
  if (Array.isArray(relation)) {
    return relation[0]?.nombre ?? fallback
  }

  return relation?.nombre ?? fallback
}

function getSingleUsername(
  relation:
    | {
        username: string | null
      }
    | {
        username: string | null
      }[]
    | null,
  fallback = "Anónimo",
) {
  if (Array.isArray(relation)) {
    return relation[0]?.username ?? fallback
  }

  return relation?.username ?? fallback
}

function formatLocation(lat: number | null, lon: number | null) {
  if (lat === null || lon === null) {
    return "Ubicación no disponible"
  }

  return `Lat ${lat.toFixed(4)}, Lon ${lon.toFixed(4)}`
}

function mapReportToCardData(report: ReporteDB): ReportCardData {
  return {
    id: report.id,
    title: report.titulo,
    description: report.descripcion ?? "",
    category: getSingleRelationName(report.categoria, "Sin categoría"),
    priority: getSingleRelationName(report.prioridad, "Sin prioridad"),
    status: getSingleRelationName(report.estado, "Sin estado"),
    location: formatLocation(report.lat, report.lon),
    author: getSingleUsername(report.autor),
    createdAt: report.created_at,
    image: getPrimaryReportImageUrl(report.fotos),
    thumbnailImage: getPreferredReportListingImageUrl(report.fotos),
  }
}

function mapReportToMapItem(report: ReporteDB): ReportMapItem | null {
  if (report.lat === null || report.lon === null) {
    return null
  }

  const cardData = mapReportToCardData(report)

  return {
    id: cardData.id,
    title: cardData.title,
    description: cardData.description || "Sin descripción",
    category: cardData.category,
    priority: cardData.priority,
    status: cardData.status,
    location: cardData.location,
    coordinates: [report.lat, report.lon],
    author: cardData.author,
    createdAt: cardData.createdAt,
    image: cardData.thumbnailImage ?? undefined,
  }
}

function mapReportToDashboardItem(report: ReporteDB): DashboardUserReport {
  return {
    id: report.id,
    titulo: report.titulo,
    descripcion: report.descripcion ?? "",
    categoria: getSingleRelationName(report.categoria, "Sin categoría"),
    prioridad: getSingleRelationName(report.prioridad, "Sin prioridad"),
    estado: getSingleRelationName(report.estado, "Sin estado"),
    imageUrl: getPreferredReportListingImageUrl(report.fotos),
    createdAt: report.created_at,
    autor: getSingleUsername(report.autor),
  }
}

type ImageSelectMode = "thumbnail" | "canonical" | "legacy"

const buildReportesSelect = (imageSelectMode: ImageSelectMode) => `id,
      usuario_id,
      titulo,
      descripcion,
      created_at,
      lat,
      lon,
      categoria:categorias!reportes_categoria_id_fkey(nombre),
      prioridad:prioridades!reportes_prioridad_id_fkey(nombre),
      estado:estados!reportes_estado_id_fkey(nombre),
      fotos:fotos_reporte(${imageSelectMode === "thumbnail"
        ? "url,bucket,path,thumbnail_url,thumbnail_bucket,thumbnail_path"
        : imageSelectMode === "canonical"
          ? "url,bucket,path"
          : "url"})`

async function fetchReportes(
  supabase: Awaited<ReturnType<typeof createClient>>,
  filtros: Required<Pick<FiltrosReportes, "soloConCoordenadas" | "limite" | "offset">> & FiltrosReportes,
  imageSelectMode: ImageSelectMode,
) {
  const {
    search,
    categoria,
    estado,
    prioridad,
    soloConCoordenadas,
    soloPendientes,
    limite,
    offset,
  } = filtros

  let query = supabase
    .from("reportes")
    .select(buildReportesSelect(imageSelectMode))
    .is("deleted_at", null)

  if (search && search.trim() !== "") {
    query = query.or(`titulo.ilike.%${search}%,descripcion.ilike.%${search}%`)
  }

  const categoriaId = resolveLookupFilterId(CATEGORY_FILTER_IDS, categoria)
  if (categoriaId !== null) {
    query = query.eq("categoria_id", categoriaId)
  }

  if (normalizeFilterValue(estado ?? "") === FOLLOW_UP_FILTER) {
    query = query.not("estado_id", "in", "(1,2,3)")
  } else {
    const estadoId = resolveLookupFilterId(STATE_FILTER_IDS, estado)
    if (estadoId !== null) {
      query = query.eq("estado_id", estadoId)
    }
  }

  const prioridadId = resolveLookupFilterId(PRIORITY_FILTER_IDS, prioridad)
  if (prioridadId !== null) {
    query = query.eq("prioridad_id", prioridadId)
  }

  if (soloConCoordenadas) {
    query = query.not("lat", "is", null).not("lon", "is", null)
  }

  if (soloPendientes) {
    query = query.eq("estado_id", REPORT_STATE_IDS.PENDIENTE)
  }

  // Fetch one extra row to know whether another page exists without an expensive exact count.
  return query
    .order("created_at", { ascending: false })
    .range(offset, offset + limite)
    .returns<ReporteDBRaw[]>()
}

/**
 * Recupera reportes desde la base de datos aplicando filtros opcionales.
 *
 * @param filtros - Opciones de filtrado:
 *   - `search`: texto a buscar en `titulo` y `descripcion`
 *   - `categoria`: nombre de la categoría (o `"all"` para no filtrar)
 *   - `estado`: nombre del estado (o `"all"` para no filtrar)
 *   - `prioridad`: nombre de la prioridad (o `"all"` para no filtrar)
 *   - `soloConCoordenadas`: si `true`, solo incluye reportes con `lat` y `lon`
 *   - `soloPendientes`: si `true`, incluye solo los reportes en estado Pendiente
 *   - `limite`: número máximo de resultados (por defecto 12)
 * @returns Objeto con `data` — lista de reportes (`ReporteDB[]`) o `null`, y `error` — el error devuelto por Supabase o `null`.
 */
export async function getReportes(filtros: FiltrosReportes = {}) {
  const supabase = await createClient()
  const {
    search,
    categoria,
    estado,
    prioridad,
    soloConCoordenadas = false,
    soloPendientes = false,
    limite = 12,
    offset = 0
  } = filtros

  const normalizedFilters = {
    search,
    categoria,
    estado,
    prioridad,
    soloConCoordenadas,
    soloPendientes,
    limite,
    offset,
  }

  let { data, error } = await fetchReportes(supabase, normalizedFilters, "thumbnail")

  if (error && isMissingReportImageColumnsError(error)) {
    ;({ data, error } = await fetchReportes(supabase, normalizedFilters, "canonical"))
  }

  if (error && isMissingReportImageColumnsError(error)) {
    ;({ data, error } = await fetchReportes(supabase, normalizedFilters, "legacy"))
  }

  // fetchReportes asks for one extra row: if it came back, there is another page.
  const rows = data ?? []
  const hasMore = rows.length > limite
  const pageRows = hasMore ? rows.slice(0, limite) : rows

  // Both lookups only need the ids of this page, so they run at the same time.
  const [{ data: publicProfiles }, estadosOperativos] = await Promise.all([
    getPublicProfilesByIds(
      supabase,
      pageRows.map((report) => report.usuario_id ?? ""),
    ),
    // Without crews there is no operational state to show, so the lookup is skipped.
    cuadrillasHabilitadas()
      ? obtenerEstadoOperativoPublicoPorReporte(
          supabase,
          pageRows.map((report) => report.id),
        )
      : new Map<number, never>(),
  ])
  const profilesById = indexPublicProfilesById(publicProfiles)

  const resolvedData = pageRows.map((report: ReporteDBRaw) => ({
    ...report,
    autor: report.usuario_id
      ? { username: profilesById.get(report.usuario_id)?.username ?? null }
      : null,
    fotos: resolveReportImageRows(report.fotos),
  }))

  return { data: resolvedData, error, hasMore, estadosOperativos }
}

/**
 * Adjunta el estado operativo público, ya consultado por lote en `getReportes`, a una lista mapeada.
 * Si la vista pública falló, el mapa llega vacío y los campos operativos quedan en null:
 * un fallo acá no puede romper el mapa ni el listado de reportes.
 */
function adjuntarEstadoOperativo<T extends { id: number }>(
  items: T[],
  estadosPorReporte: Awaited<ReturnType<typeof obtenerEstadoOperativoPublicoPorReporte>>,
): Array<T & { estadoOperativo: EstadoOperativo | null; cuadrillaNombre: string | null }> {
  return items.map((item) => {
    const estado = estadosPorReporte.get(item.id)
    return {
      ...item,
      estadoOperativo: (estado?.estadoOperativo as EstadoOperativo | undefined) ?? null,
      cuadrillaNombre: estado?.cuadrillaNombre ?? null,
    }
  })
}

export async function getReportStatusCounts(
  filtros: Pick<FiltrosReportes, "search" | "categoria" | "prioridad"> = {},
): Promise<ReportStatusCounts> {
  const supabase = await createClient()
  const { search, categoria, prioridad } = filtros

  const buildCountQuery = (estadoId?: number) => {
    let query = supabase
      .from("reportes")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)

    if (search && search.trim() !== "") {
      query = query.or(`titulo.ilike.%${search}%,descripcion.ilike.%${search}%`)
    }

    const categoriaId = resolveLookupFilterId(CATEGORY_FILTER_IDS, categoria)
    if (categoriaId !== null) {
      query = query.eq("categoria_id", categoriaId)
    }

    const prioridadId = resolveLookupFilterId(PRIORITY_FILTER_IDS, prioridad)
    if (prioridadId !== null) {
      query = query.eq("prioridad_id", prioridadId)
    }

    if (estadoId !== undefined) {
      query = query.eq("estado_id", estadoId)
    }

    return query
  }

  const [{ count: all }, { count: resolved }, { count: pending }] = await Promise.all([
    buildCountQuery(),
    buildCountQuery(REPORT_STATE_IDS.REPARADO),
    buildCountQuery(REPORT_STATE_IDS.PENDIENTE),
  ])

  return {
    all: all ?? 0,
    resolved: resolved ?? 0,
    pending: pending ?? 0,
  }
}

export async function getReportCardData(filtros: FiltrosReportes = {}) {
  const { data, error, hasMore, estadosOperativos } = await getReportes(filtros)

  return {
    data: adjuntarEstadoOperativo(data.map(mapReportToCardData), estadosOperativos),
    error,
    hasMore,
  }
}

export async function getReportMapData(filtros: FiltrosReportes = {}) {
  const { data, error, estadosOperativos } = await getReportes({
    ...filtros,
    soloConCoordenadas: true,
  })

  const mapItems = data
    .map(mapReportToMapItem)
    .filter((report): report is ReportMapItem => report !== null)

  return {
    data: adjuntarEstadoOperativo(mapItems, estadosOperativos),
    error,
  }
}

export async function getDashboardUserReports(
  userId: string,
  filtros: Pick<FiltrosReportes, "search" | "categoria" | "estado" | "prioridad"> = {},
) {
  const supabase = await createClient()
  const { search, categoria, estado, prioridad } = filtros

  const fetchDashboardReports = async (imageSelectMode: ImageSelectMode) => {
    let query = supabase
      .from("reportes")
      .select(buildReportesSelect(imageSelectMode))
      .eq("usuario_id", userId)
      .is("deleted_at", null)

    if (search && search.trim() !== "") {
      query = query.or(`titulo.ilike.%${search}%,descripcion.ilike.%${search}%`)
    }

    const categoriaId = resolveLookupFilterId(CATEGORY_FILTER_IDS, categoria)
    if (categoriaId !== null) query = query.eq("categoria_id", categoriaId)

    if (normalizeFilterValue(estado ?? "") === FOLLOW_UP_FILTER) {
      query = query.not("estado_id", "in", "(1,2,3)")
    } else {
      const estadoId = resolveLookupFilterId(STATE_FILTER_IDS, estado)
      if (estadoId !== null) query = query.eq("estado_id", estadoId)
    }

    const prioridadId = resolveLookupFilterId(PRIORITY_FILTER_IDS, prioridad)
    if (prioridadId !== null) query = query.eq("prioridad_id", prioridadId)

    return query
      .order("created_at", { ascending: false })
      .returns<ReporteDBRaw[]>()
  }

  let { data, error } = await fetchDashboardReports("thumbnail")

  if (error && isMissingReportImageColumnsError(error)) {
    ;({ data, error } = await fetchDashboardReports("canonical"))
  }

  if (error && isMissingReportImageColumnsError(error)) {
    ;({ data, error } = await fetchDashboardReports("legacy"))
  }

  if (error || !data) {
    return { data: [], error }
  }

  return {
    data: data
      .map((report) => ({
        ...report,
        fotos: resolveReportImageRows(report.fotos),
      }))
      .map(mapReportToDashboardItem),
    error: null,
  }
}

type LookupRow = { id: number; nombre: string }

/** Lookup tables change only through migrations, so one hour of staleness is safe. */
const LOOKUP_REVALIDATE_SECONDS = 3600

/**
 * Runs a cached lookup and keeps the `{ data, error }` shape callers expect.
 * The cached loader throws on query errors so a failed read is never stored in the cache.
 */
async function readCachedLookup(load: () => Promise<LookupRow[]>) {
  try {
    return { data: await load(), error: null }
  } catch (error) {
    console.error("Error al obtener catálogo:", error)
    return { data: null, error: error as Error }
  }
}

const loadCategorias = unstable_cache(
  async (): Promise<LookupRow[]> => {
    const { data, error } = await createPublicClient()
      .from("categorias")
      .select("id, nombre")
      .order("nombre")

    if (error) throw error

    return (data ?? []).sort((a, b) => {
      const aIsOther = a.nombre.localeCompare("Otros", "es", { sensitivity: "base" }) === 0
      const bIsOther = b.nombre.localeCompare("Otros", "es", { sensitivity: "base" }) === 0

      if (aIsOther !== bIsOther) {
        return aIsOther ? 1 : -1
      }

      return a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" })
    })
  },
  ["lookup-categorias"],
  { revalidate: LOOKUP_REVALIDATE_SECONDS, tags: ["lookups"] },
)

const loadEstados = unstable_cache(
  async (): Promise<LookupRow[]> => {
    const { data, error } = await createPublicClient()
      .from("estados")
      .select("id, nombre")
      .order("nombre")

    if (error) throw error
    return data ?? []
  },
  ["lookup-estados"],
  { revalidate: LOOKUP_REVALIDATE_SECONDS, tags: ["lookups"] },
)

const loadPrioridades = unstable_cache(
  async (): Promise<LookupRow[]> => {
    const { data, error } = await createPublicClient()
      .from("prioridades")
      .select("id, nombre")
      .order("id", { ascending: false })

    if (error) throw error
    return data ?? []
  },
  ["lookup-prioridades"],
  { revalidate: LOOKUP_REVALIDATE_SECONDS, tags: ["lookups"] },
)

/**
 * Recupera todas las categorías disponibles por nombre, dejando "Otros" al final.
 * El resultado se cachea entre requests (ver `LOOKUP_REVALIDATE_SECONDS`).
 */
export function getCategorias() {
  return readCachedLookup(loadCategorias)
}

/**
 * Recupera la lista de todos los estados ordenados por nombre, cacheada entre requests.
 */
export function getEstados() {
  return readCachedLookup(loadEstados)
}

/**
 * Obtiene la lista de prioridades en el orden Baja, Media y Alta, cacheada entre requests.
 */
export function getPrioridades() {
  return readCachedLookup(loadPrioridades)
}
