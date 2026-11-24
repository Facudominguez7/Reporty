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
import { filtroBusquedaDefensoria, obtenerIdBusquedaDefensoria } from "@/database/queries/reportes/filtro-defensoria"

import { createClient } from "@/utils/supabase/server"
import { createPublicClient } from "@/utils/supabase/public"
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js"
import type { ZonaMapa } from "@/lib/map/zona"
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
  estado_id?: number | null
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
  /** Deja solo los reportes en estado Pendiente. */
  soloPendientes?: boolean
  /** Bandeja de la Defensoría del Pueblo: vista Pendientes/Tomados y búsqueda global. */
  filtroDefensoria?: { vista: "pendientes" | "tomados"; busqueda: string }
  /** Restringe los resultados a estos IDs, además del filtro por nombre de estado. */
  estadosPermitidos?: readonly number[]
  /** Solo los reportes dentro de este rectángulo (mapa por zona, #281). */
  zona?: ZonaMapa
  limite?: number
  offset?: number
}

/** Opciones de lectura de `getReportes`. */
type OpcionesLecturaReportes = {
  /** Trae el nombre público de cada autor. */
  includeAuthors?: boolean
  /**
   * Lee sin la sesión del visitante (rol anon). El resultado es igual para todos, así que se
   * puede cachear en una respuesta pública. Solo para datos públicos.
   */
  publico?: boolean
}

export type ReportMapItem = {
  id: number
  title: string
  description: string
  category: string
  priority: string
  status: string
  estadoId?: number | null
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
    estadoId: report.estado_id ?? null,
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

/**
 * Arma el `select` del listado y del mapa.
 *
 * @param imageSelectMode - Columnas de imagen que existen en la base.
 * @param conAutor - Si trae el nombre del autor en la misma consulta. PostgREST lo une por la
 *   relación `usuario_id` → `public_profiles`, con la misma RLS de la vista: así no hace falta un
 *   segundo viaje a Supabase solo para los nombres. La relación se fija por la columna
 *   (`!usuario_id`) para que otra clave foránea hacia `profiles` no la vuelva ambigua.
 * @returns La lista de columnas y relaciones para `select`.
 */
const buildReportesSelect = (imageSelectMode: ImageSelectMode, conAutor: boolean) => `id,
      usuario_id,
      titulo,
      descripcion,
      created_at,
      estado_id,
      lat,
      lon,
      categoria:categorias!reportes_categoria_id_fkey(nombre),
      prioridad:prioridades!reportes_prioridad_id_fkey(nombre),
      estado:estados!reportes_estado_id_fkey(nombre),
      fotos:fotos_reporte(${imageSelectMode === "thumbnail"
        ? "url,bucket,path,thumbnail_url,thumbnail_bucket,thumbnail_path"
        : imageSelectMode === "canonical"
          ? "url,bucket,path"
          : "url"})${conAutor ? ",\n      autor:public_profiles!usuario_id(username)" : ""}`

/**
 * Construye la consulta filtrada y paginada para el formato de imágenes solicitado.
 *
 * @param supabase - Cliente con el que se lee (público o con sesión).
 * @param filtros - Filtros ya normalizados, con límite y desplazamiento.
 * @param imageSelectMode - Columnas de imagen que existen en la base.
 * @param conAutor - Si trae el nombre del autor en la misma consulta.
 * @returns La consulta de PostgREST lista para esperar.
 */
async function fetchReportes(
  supabase: SupabaseClient,
  filtros: Required<Pick<FiltrosReportes, "soloConCoordenadas" | "limite" | "offset">> & FiltrosReportes,
  imageSelectMode: ImageSelectMode,
  conAutor: boolean,
) {
  const {
    search,
    categoria,
    estado,
    prioridad,
    soloConCoordenadas,
    soloPendientes,
    filtroDefensoria,
    estadosPermitidos,
    zona,
    limite,
    offset,
  } = filtros

  // Con zona, la función de PostGIS filtra por área con el índice espacial y devuelve filas de
  // `reportes`: el mismo select y los mismos filtros se encadenan encima.
  const seleccion = buildReportesSelect(imageSelectMode, conAutor)
  const desdeTabla = () => supabase.from("reportes").select(seleccion)
  // Para PostgREST las dos ramas son la misma consulta; el tipo de la RPC solo deja de exponer
  // los filtros después de `select`, aunque en ejecución los acepta igual.
  const origen = zona
    ? (supabase
        .rpc("reportes_en_zona", { oeste: zona.oeste, sur: zona.sur, este: zona.este, norte: zona.norte }, { get: true })
        .select(seleccion) as unknown as ReturnType<typeof desdeTabla>)
    : desdeTabla()
  let query = origen
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

  if (estadosPermitidos) {
    query = query.in("estado_id", estadosPermitidos)
  }

  if (filtroDefensoria) {
    const id = obtenerIdBusquedaDefensoria(filtroDefensoria.busqueda)
    if (id !== null) {
      query = query.in("estado_id", [REPORT_STATE_IDS.PENDIENTE, REPORT_STATE_IDS.TOMADO_DEFENSORIA]).eq("id", id)
    } else {
      query = query.eq("estado_id", filtroDefensoria.vista === "tomados" ? REPORT_STATE_IDS.TOMADO_DEFENSORIA : REPORT_STATE_IDS.PENDIENTE)
      const expresion = filtroBusquedaDefensoria(filtroDefensoria.busqueda)
      if (expresion) query = query.or(expresion)
    }
  }

  // La bandeja de la Defensoría atiende primero los más antiguos; el resto conserva los más recientes.
  const ordenarDesdeElMasAntiguo = filtroDefensoria !== undefined
  query = query.order("created_at", { ascending: ordenarDesdeElMasAntiguo })
  if (ordenarDesdeElMasAntiguo) query = query.order("id", { ascending: true })

  // Fetch one extra row to know whether another page exists without an expensive exact count.
  return query
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
 *   - `estadosPermitidos`: IDs de estado que la consulta puede devolver
 *   - `limite`: número máximo de resultados (por defecto 12)
 * @returns Objeto con `data` — lista de reportes (`ReporteDB[]`) o `null`, y `error` — el error devuelto por Supabase o `null`.
 */
export async function getReportes(
  filtros: FiltrosReportes = {},
  { includeAuthors = true, publico = false }: OpcionesLecturaReportes = {},
) {
  const supabase: SupabaseClient = publico ? createPublicClient() : await createClient()
  const {
    search,
    categoria,
    estado,
    prioridad,
    soloConCoordenadas = false,
    soloPendientes = false,
    filtroDefensoria,
    estadosPermitidos,
    zona,
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
    filtroDefensoria,
    estadosPermitidos,
    zona,
    limite,
    offset,
  }

  let { data, error } = await fetchReportes(supabase, normalizedFilters, "thumbnail", includeAuthors)

  if (error && isMissingReportImageColumnsError(error)) {
    ;({ data, error } = await fetchReportes(supabase, normalizedFilters, "canonical", includeAuthors))
  }

  if (error && isMissingReportImageColumnsError(error)) {
    ;({ data, error } = await fetchReportes(supabase, normalizedFilters, "legacy", includeAuthors))
  }

  // fetchReportes asks for one extra row: if it came back, there is another page.
  const rows = data ?? []
  const hasMore = rows.length > limite
  const pageRows = hasMore ? rows.slice(0, limite) : rows

  // El autor ya viene en la misma fila. Without crews there is no operational state to show,
  // so the lookup is skipped.
  const estadosOperativos = cuadrillasHabilitadas()
    ? await obtenerEstadoOperativoPublicoPorReporte(
        supabase,
        pageRows.map((report) => report.id),
      )
    : new Map<number, never>()

  const resolvedData = pageRows.map((report: ReporteDBRaw) => ({
    ...report,
    autor: report.usuario_id
      ? { username: (includeAuthors ? getSingleUsername(report.autor) : null) ?? null }
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

export async function getReportCardData(filtros: FiltrosReportes = {}, options: { includeAuthors?: boolean } = {}) {
  const { data, error, hasMore, estadosOperativos } = await getReportes(filtros, options)

  return {
    data: adjuntarEstadoOperativo(data.map(mapReportToCardData), estadosOperativos),
    error,
    hasMore,
  }
}

/**
 * Reportes para la bandeja de la Defensoría del Pueblo: Pendientes y Tomados, con el
 * número de reclamo y la dirección escrita adjuntos cuando existen (S5, S9).
 */
export async function getReportesDefensoria(limite = 20, offset = 0, filtroDefensoria?: { vista: "pendientes" | "tomados"; busqueda: string }) {
  const { data, error, hasMore } = await getReportCardData(
    { estadosPermitidos: [REPORT_STATE_IDS.PENDIENTE, REPORT_STATE_IDS.TOMADO_DEFENSORIA], filtroDefensoria, limite, offset },
    { includeAuthors: true },
  )
  if (error) return { data: [], error, hasMore, totalPendientes: 0 }

  const ids = data.map((report) => report.id)
  // Panel autorizado de la Defensoría: los reclamos solo son legibles por staff de la
  // Defensoría (RLS: autor o rol 6); el público ya no tiene acceso a la tabla (S9).
  const supabaseAdmin = await createClient()
  const [{ data: reclamos }, { data: direcciones, error: errorDirecciones }] = ids.length
    ? await Promise.all([
      supabaseAdmin.from("reclamos_defensoria").select("reporte_id, numero_reclamo, tomado_at").in("reporte_id", ids),
      supabaseAdmin.from("reportes").select("id, direccion").in("id", ids),
    ])
    : [{ data: [] as { reporte_id: number; numero_reclamo: string; tomado_at: string }[] }, { data: [], error: null }]

  if (errorDirecciones) return { data: [], error: errorDirecciones, hasMore, totalPendientes: 0 }
  const reclamosPorReporte = new Map((reclamos ?? []).map((reclamo) => [reclamo.reporte_id, reclamo]))
  const direccionesPorReporte = new Map((direcciones ?? []).map((reporte) => [reporte.id, reporte.direccion]))

  return {
    data: data.map((report) => ({
      ...report,
      numeroReclamo: reclamosPorReporte.get(report.id)?.numero_reclamo ?? null,
      direccion: direccionesPorReporte.get(report.id) ?? null,
    })),
    error: null,
    hasMore,
    totalPendientes: data.filter((report) => report.status === "Pendiente").length,
  }
}

/**
 * Reportes con coordenadas listos para el mapa, con su estado operativo.
 *
 * @param filtros - Filtros del listado; con `zona`, solo los de ese rectángulo.
 * @param opciones - `publico: true` lee sin sesión para poder cachear la respuesta.
 * @returns `data` con los marcadores, `error` y `hasMore` (había más que `limite`).
 */
export async function getReportMapData(filtros: FiltrosReportes = {}, opciones: OpcionesLecturaReportes = {}) {
  const { data, error, estadosOperativos, hasMore } = await getReportes({
    ...filtros,
    soloConCoordenadas: true,
  }, opciones)

  const mapItems = data
    .map(mapReportToMapItem)
    .filter((report): report is ReportMapItem => report !== null)

  const conEstadoOperativo = adjuntarEstadoOperativo(mapItems, estadosOperativos)

  // El número de reclamo nunca llega al mapa ni al popup: es privado del autor (S9) y solo
  // se consulta en la ficha (autor o Defensoría) y en el panel autorizado de la Defensoría.
  return {
    data: conEstadoOperativo,
    error,
    hasMore,
  }
}

/** Grupo de reportes de una celda del mapa: centro real, cantidad y límites. */
export type GrupoMapa = {
  lat: number
  lon: number
  cantidad: number
  limites: ZonaMapa
}

type FilaGrupoMapa = {
  lat: number
  lon: number
  cantidad: number
  oeste: number
  sur: number
  este: number
  norte: number
}

/**
 * Cuenta los reportes de la zona por celda de grilla, con los mismos filtros que los puntos
 * del mapa (estados, categoría, prioridad y búsqueda), así un grupo nunca cuenta reportes
 * que el filtro excluiría. Lee sin sesión: el resultado es público y cacheable.
 *
 * @param parametros.zona - Rectángulo ya ajustado al mapa.
 * @param parametros.celda - Lado de la celda en grados.
 * @param parametros.estados - IDs de estado permitidos.
 * @returns `data` con los grupos y `error`.
 */
export async function getGruposEnZona({
  zona,
  celda,
  estados,
  search,
  categoria,
  prioridad,
}: Pick<FiltrosReportes, "search" | "categoria" | "prioridad"> & {
  zona: ZonaMapa
  celda: number
  estados: readonly number[]
}): Promise<{ data: GrupoMapa[]; error: PostgrestError | null }> {
  const supabase = createPublicClient()
  const busqueda = search && search.trim() !== "" ? search : null
  const { data, error } = await supabase
    .rpc("reportes_agrupados_en_zona", {
      oeste: zona.oeste,
      sur: zona.sur,
      este: zona.este,
      norte: zona.norte,
      celda,
      estados: [...estados],
      categoria: resolveLookupFilterId(CATEGORY_FILTER_IDS, categoria),
      prioridad: resolveLookupFilterId(PRIORITY_FILTER_IDS, prioridad),
      busqueda,
    })
  const filas = (data ?? []) as FilaGrupoMapa[]

  return {
    data: filas.map((fila) => ({
      lat: fila.lat,
      lon: fila.lon,
      cantidad: fila.cantidad,
      limites: { oeste: fila.oeste, sur: fila.sur, este: fila.este, norte: fila.norte },
    })),
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
      .select(buildReportesSelect(imageSelectMode, false))
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
